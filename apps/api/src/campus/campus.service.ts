import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { hasRole, STUDENT_ADMIN } from '../common/roles.js';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { students } from '../db/schema-academic.js';
import {
  libraryLoans,
  orientationAttendance,
  orientationEvents,
} from '../db/schema-student-life.js';
import { users } from '../db/schema.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';

type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

// Personel okuma yetkisi (discipline/internship STAFF ile bire bir). Yazma STUDENT_ADMIN.
const STAFF = [
  'oidb',
  'sistem_yoneticisi',
  'dekanlik',
  'bolum_baskani',
  'koordinator',
  'fakulte_sekreteri',
  'mali_isler',
  'rektorluk',
  'danisman',
  'ogretim_elemani',
];
const isStaff = (roles: readonly string[] = []): boolean => roles.some((r) => STAFF.includes(r));

export interface CreateEventInput {
  title: string;
  eventDate?: string | undefined;
  location?: string | undefined;
  description?: string | undefined;
}

export interface AttendanceInput {
  studentId: string;
  attended?: boolean | undefined;
  feedback?: number | undefined;
}

export interface CreateLoanInput {
  studentId: string;
  itemTitle: string;
  loanedOn?: string | undefined;
  dueOn?: string | undefined;
}

export interface UpdateLoanInput {
  returnedOn?: string | undefined;
  fineAmount?: number | undefined;
  status?: 'odunc' | 'iade' | 'gecikmis' | 'kayip' | undefined;
}

/**
 * Kampüs servisi (0023). Tenant-kapsamlı (RLS). Oryantasyon etkinlik/katılım ve
 * kütüphane ödünç kayıtları personel tarafından yönetilir; öğrenci kendi ödünç
 * listesini görür. Ceza/gecikme özeti ilişik kesme ve mezuniyet kontrolünde kullanılır.
 */
@Injectable()
export class CampusService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Oryantasyon etkinlikleri + katılımcı sayısı, en yeni önce. */
  async listEvents(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, (tx) =>
      tx
        .select({
          id: orientationEvents.id,
          title: orientationEvents.title,
          eventDate: orientationEvents.eventDate,
          location: orientationEvents.location,
          description: orientationEvents.description,
          createdAt: orientationEvents.createdAt,
          attendeeCount: sql<number>`count(${orientationAttendance.id})::int`,
        })
        .from(orientationEvents)
        .leftJoin(orientationAttendance, eq(orientationAttendance.eventId, orientationEvents.id))
        .groupBy(orientationEvents.id)
        .orderBy(desc(orientationEvents.createdAt)),
    );
  }

  /** Oryantasyon etkinliği oluştur (öğrenci işleri). */
  async createEvent(input: CreateEventInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Oryantasyon etkinliği oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .insert(orientationEvents)
        .values({
          tenantId: ctx.tenantId,
          title: input.title,
          eventDate: input.eventDate ?? null,
          location: input.location ?? null,
          description: input.description ?? null,
        })
        .returning();
      return row!;
    });
  }

  /** Etkinlik katılım listesi (öğrenci no/e-posta join). */
  async attendance(eventId: string): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.mustEvent(tx, eventId);
      return tx
        .select({
          id: orientationAttendance.id,
          studentId: orientationAttendance.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          attended: orientationAttendance.attended,
          feedback: orientationAttendance.feedback,
          createdAt: orientationAttendance.createdAt,
        })
        .from(orientationAttendance)
        .innerJoin(students, eq(orientationAttendance.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .where(eq(orientationAttendance.eventId, eventId))
        .orderBy(desc(orientationAttendance.createdAt));
    });
  }

  /** Katılım kaydet (öğrenci işleri). Aynı öğrenci tekrar gönderilirse kayıt güncellenir. */
  async markAttendance(eventId: string, input: AttendanceInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Katılım kaydetme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.mustEvent(tx, eventId);
      await this.mustStudent(tx, input.studentId);
      const attended = input.attended ?? true;
      const feedback = input.feedback ?? null;
      const [row] = await tx
        .insert(orientationAttendance)
        .values({
          tenantId: ctx.tenantId,
          eventId,
          studentId: input.studentId,
          attended,
          feedback,
        })
        .onConflictDoUpdate({
          target: [orientationAttendance.eventId, orientationAttendance.studentId],
          set: { attended, feedback },
        })
        .returning();
      return row!;
    });
  }

  /** Kütüphane ödünç kayıtları (personel): ?status, ?studentId; öğrenci no/e-posta join. */
  async listLoans(status?: string, studentId?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Kütüphane kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const conds = [];
      if (status) conds.push(eq(libraryLoans.status, status));
      if (studentId) conds.push(eq(libraryLoans.studentId, studentId));
      const where = conds.length ? and(...conds) : undefined;
      const items = await tx
        .select({
          id: libraryLoans.id,
          studentId: libraryLoans.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          itemTitle: libraryLoans.itemTitle,
          loanedOn: libraryLoans.loanedOn,
          dueOn: libraryLoans.dueOn,
          returnedOn: libraryLoans.returnedOn,
          fineAmount: libraryLoans.fineAmount,
          status: libraryLoans.status,
          createdAt: libraryLoans.createdAt,
        })
        .from(libraryLoans)
        .innerJoin(students, eq(libraryLoans.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .where(where)
        .orderBy(desc(libraryLoans.createdAt));
      return { items };
    });
  }

  /** Aktör öğrencinin ödünç kayıtları. */
  async myLoans(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) return [];
      return tx
        .select()
        .from(libraryLoans)
        .where(eq(libraryLoans.studentId, sid))
        .orderBy(desc(libraryLoans.createdAt));
    });
  }

  /** Ödünç kaydı oluştur (öğrenci işleri). */
  async createLoan(input: CreateLoanInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Ödünç kaydı oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.mustStudent(tx, input.studentId);
      const [row] = await tx
        .insert(libraryLoans)
        .values({
          tenantId: ctx.tenantId,
          studentId: input.studentId,
          itemTitle: input.itemTitle,
          loanedOn: input.loanedOn ?? null,
          dueOn: input.dueOn ?? null,
        })
        .returning();
      return row!;
    });
  }

  /** Ödünç kaydı güncelle (öğrenci işleri): iade tarihi / ceza / durum. */
  async updateLoan(id: string, input: UpdateLoanInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Ödünç kaydı güncelleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(libraryLoans)
        .where(eq(libraryLoans.id, id))
        .limit(1);
      if (!existing) {
        throw new NotFoundException('Ödünç kaydı bulunamadı');
      }

      const patch: Record<string, unknown> = {};
      if (input.returnedOn !== undefined) patch.returnedOn = input.returnedOn;
      if (input.fineAmount !== undefined) patch.fineAmount = input.fineAmount;
      if (input.status !== undefined) patch.status = input.status;

      if (Object.keys(patch).length === 0) {
        return existing;
      }

      const [row] = await tx
        .update(libraryLoans)
        .set(patch)
        .where(eq(libraryLoans.id, id))
        .returning();
      return row!;
    });
  }

  /**
   * Öğrencinin ödenmemiş kütüphane cezası toplamı (status != iade) ve gecikmiş
   * kitap sayısı. İlişik kesme / mezuniyet kontrolünde kullanılır.
   */
  async debt(studentId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Kütüphane borç bilgisine erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.mustStudent(tx, studentId);
      const [row] = await tx
        .select({
          unpaidFine: sql<number>`coalesce(sum(case when ${libraryLoans.status} <> 'iade' then ${libraryLoans.fineAmount} else 0 end), 0)::int`,
          overdueCount: sql<number>`count(*) filter (where ${libraryLoans.returnedOn} is null and ${libraryLoans.dueOn} is not null and ${libraryLoans.dueOn} < current_date)::int`,
        })
        .from(libraryLoans)
        .where(eq(libraryLoans.studentId, studentId));
      return {
        studentId,
        unpaidFine: row?.unpaidFine ?? 0,
        overdueCount: row?.overdueCount ?? 0,
        clear: (row?.unpaidFine ?? 0) === 0 && (row?.overdueCount ?? 0) === 0,
      };
    });
  }

  private async mustEvent(tx: Tx, eventId: string): Promise<void> {
    const [e] = await tx
      .select({ id: orientationEvents.id })
      .from(orientationEvents)
      .where(eq(orientationEvents.id, eventId))
      .limit(1);
    if (!e) {
      throw new NotFoundException('Oryantasyon etkinliği bulunamadı');
    }
  }

  private async mustStudent(tx: Tx, studentId: string): Promise<void> {
    const [s] = await tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);
    if (!s) {
      throw new NotFoundException('Öğrenci bulunamadı');
    }
  }

  private async myStudentId(tx: Tx, actorUserId?: string): Promise<string | null> {
    if (!actorUserId) return null;
    const [s] = await tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.userId, actorUserId))
      .limit(1);
    return s?.id ?? null;
  }
}
