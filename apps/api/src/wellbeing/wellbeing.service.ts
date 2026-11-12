import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { students } from '../db/schema-academic.js';
import {
  counselingAppointments,
  disabilitySupports,
  healthVisits,
} from '../db/schema-student-life.js';
import { users } from '../db/schema.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';

type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

/**
 * HASSAS VERİ: PDR ve sağlık kayıtları geniş personel setine açılmaz.
 * Yalnızca bu dar rol seti okuyabilir/yazabilir (isStaff bilinçli olarak kullanılmadı).
 */
const WELLBEING_STAFF = ['sistem_yoneticisi', 'oidb'];
const isWellbeingStaff = (roles: readonly string[] = []): boolean =>
  roles.some((r) => WELLBEING_STAFF.includes(r));

export interface CreateCounselingInput {
  kind: 'bireysel' | 'grup' | 'atolye';
  note?: string | undefined;
}

export interface UpdateCounselingInput {
  appointmentAt?: string | undefined;
  status?: 'planlandi' | 'tamamlandi' | 'iptal' | 'gelmedi' | undefined;
  note?: string | undefined;
  counselorUserId?: string | undefined;
}

export interface CreateDisabilityInput {
  studentId: string;
  disabilityType?: string | undefined;
  needs?: string | undefined;
  accommodations?: string | undefined;
  examExtraTimePct?: number | undefined;
}

export interface CreateHealthInput {
  studentId: string;
  visitDate?: string | undefined;
  complaint?: string | undefined;
  treatment?: string | undefined;
  referredTo?: string | undefined;
}

/**
 * Öğrenci refahı servisi (0023): PDR randevuları, engelli destek kayıtları ve
 * sağlık merkezi ziyaretleri. Tenant-kapsamlı (RLS). Gizlilik: kayıtları yalnızca
 * dar rol seti (WELLBEING_STAFF) görür; öğrenci sadece kendi kaydına erişir ve
 * danışman notu (note) öğrenciye hiçbir uçta dönülmez.
 */
@Injectable()
export class WellbeingService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** PDR randevu listesi (dar staff; öğrenci no/e-posta join). */
  async listCounseling(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.assertStaff(ctx.roles ?? [], 'PDR kayıtlarına erişim yetkiniz yok');
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: counselingAppointments.id,
          studentId: counselingAppointments.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          counselorUserId: counselingAppointments.counselorUserId,
          requestedAt: counselingAppointments.requestedAt,
          appointmentAt: counselingAppointments.appointmentAt,
          kind: counselingAppointments.kind,
          status: counselingAppointments.status,
          note: counselingAppointments.note,
          rating: counselingAppointments.rating,
          createdAt: counselingAppointments.createdAt,
        })
        .from(counselingAppointments)
        .innerJoin(students, eq(counselingAppointments.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .orderBy(desc(counselingAppointments.createdAt));
      return { items };
    });
  }

  /** Aktör öğrencinin PDR randevuları (note maskelenir). */
  async myCounseling(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) return [];
      return tx
        .select({
          id: counselingAppointments.id,
          studentId: counselingAppointments.studentId,
          counselorUserId: counselingAppointments.counselorUserId,
          requestedAt: counselingAppointments.requestedAt,
          appointmentAt: counselingAppointments.appointmentAt,
          kind: counselingAppointments.kind,
          status: counselingAppointments.status,
          rating: counselingAppointments.rating,
          createdAt: counselingAppointments.createdAt,
        })
        .from(counselingAppointments)
        .where(eq(counselingAppointments.studentId, sid))
        .orderBy(desc(counselingAppointments.createdAt));
    });
  }

  /** Aktör öğrenci randevu talebi oluşturur (status=talep; note dönülmez). */
  async createCounseling(input: CreateCounselingInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) {
        throw new ForbiddenException('Randevu talebi için öğrenci kaydınız bulunamadı');
      }
      const [row] = await tx
        .insert(counselingAppointments)
        .values({
          tenantId: ctx.tenantId,
          studentId: sid,
          kind: input.kind,
          note: input.note ?? null,
          status: 'talep',
        })
        .returning();
      return this.maskNote(row!);
    });
  }

  /** PDR randevu güncelle (dar staff): tarih/durum/not/danışman. */
  async updateCounseling(
    id: string,
    input: UpdateCounselingInput,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.assertStaff(ctx.roles ?? [], 'PDR randevusu güncelleme yetkiniz yok');
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(counselingAppointments)
        .where(eq(counselingAppointments.id, id))
        .limit(1);
      if (!existing) {
        throw new NotFoundException('Randevu bulunamadı');
      }

      const patch: Record<string, unknown> = {};
      if (input.appointmentAt !== undefined) patch.appointmentAt = new Date(input.appointmentAt);
      if (input.status !== undefined) patch.status = input.status;
      if (input.note !== undefined) patch.note = input.note;
      if (input.counselorUserId !== undefined) patch.counselorUserId = input.counselorUserId;

      if (Object.keys(patch).length === 0) {
        return existing;
      }

      const [row] = await tx
        .update(counselingAppointments)
        .set(patch)
        .where(eq(counselingAppointments.id, id))
        .returning();
      return row!;
    });
  }

  /** Aktör öğrenci kendi randevusunu puanlar (1-5; note dönülmez). */
  async rateCounseling(id: string, rating: number): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) {
        throw new ForbiddenException('Yalnızca öğrenci kendi randevusunu puanlayabilir');
      }
      const [existing] = await tx
        .select({ id: counselingAppointments.id, studentId: counselingAppointments.studentId })
        .from(counselingAppointments)
        .where(eq(counselingAppointments.id, id))
        .limit(1);
      if (!existing) {
        throw new NotFoundException('Randevu bulunamadı');
      }
      if (existing.studentId !== sid) {
        throw new ForbiddenException('Yalnızca kendi randevunuzu puanlayabilirsiniz');
      }
      const [row] = await tx
        .update(counselingAppointments)
        .set({ rating })
        .where(eq(counselingAppointments.id, id))
        .returning();
      return this.maskNote(row!);
    });
  }

  /** Engelli destek kayıtları (dar staff; öğrenci no/e-posta join). */
  async listDisability(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.assertStaff(ctx.roles ?? [], 'Engelli destek kayıtlarına erişim yetkiniz yok');
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: disabilitySupports.id,
          studentId: disabilitySupports.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          disabilityType: disabilitySupports.disabilityType,
          needs: disabilitySupports.needs,
          accommodations: disabilitySupports.accommodations,
          examExtraTimePct: disabilitySupports.examExtraTimePct,
          status: disabilitySupports.status,
          createdAt: disabilitySupports.createdAt,
        })
        .from(disabilitySupports)
        .innerJoin(students, eq(disabilitySupports.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .orderBy(desc(disabilitySupports.createdAt));
      return { items };
    });
  }

  /** Engelli destek kaydı oluştur (dar staff). */
  async createDisability(input: CreateDisabilityInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.assertStaff(ctx.roles ?? [], 'Engelli destek kaydı oluşturma yetkiniz yok');
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [student] = await tx
        .select({ id: students.id })
        .from(students)
        .where(eq(students.id, input.studentId))
        .limit(1);
      if (!student) {
        throw new NotFoundException('Öğrenci bulunamadı');
      }
      const [row] = await tx
        .insert(disabilitySupports)
        .values({
          tenantId: ctx.tenantId,
          studentId: input.studentId,
          disabilityType: input.disabilityType ?? null,
          needs: input.needs ?? null,
          accommodations: input.accommodations ?? null,
          examExtraTimePct: input.examExtraTimePct ?? null,
        })
        .returning();
      return row!;
    });
  }

  /** Aktör öğrencinin kendi engelli destek kayıtları. */
  async myDisability(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) return [];
      return tx
        .select()
        .from(disabilitySupports)
        .where(eq(disabilitySupports.studentId, sid))
        .orderBy(desc(disabilitySupports.createdAt));
    });
  }

  /** Sağlık merkezi ziyaretleri (dar staff; öğrenci no/e-posta join). */
  async listHealth(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.assertStaff(ctx.roles ?? [], 'Sağlık kayıtlarına erişim yetkiniz yok');
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: healthVisits.id,
          studentId: healthVisits.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          visitDate: healthVisits.visitDate,
          complaint: healthVisits.complaint,
          treatment: healthVisits.treatment,
          referredTo: healthVisits.referredTo,
          createdAt: healthVisits.createdAt,
        })
        .from(healthVisits)
        .innerJoin(students, eq(healthVisits.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .orderBy(desc(healthVisits.createdAt));
      return { items };
    });
  }

  /** Sağlık ziyareti kaydı oluştur (dar staff). */
  async createHealth(input: CreateHealthInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    this.assertStaff(ctx.roles ?? [], 'Sağlık kaydı oluşturma yetkiniz yok');
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [student] = await tx
        .select({ id: students.id })
        .from(students)
        .where(eq(students.id, input.studentId))
        .limit(1);
      if (!student) {
        throw new NotFoundException('Öğrenci bulunamadı');
      }
      const [row] = await tx
        .insert(healthVisits)
        .values({
          tenantId: ctx.tenantId,
          studentId: input.studentId,
          visitDate: input.visitDate ?? null,
          complaint: input.complaint ?? null,
          treatment: input.treatment ?? null,
          referredTo: input.referredTo ?? null,
        })
        .returning();
      return row!;
    });
  }

  private assertStaff(roles: readonly string[], message: string): void {
    if (!isWellbeingStaff(roles)) {
      throw new ForbiddenException(message);
    }
  }

  /** Danışman notu öğrenciye dönülmez. */
  private maskNote(row: Record<string, unknown>): Record<string, unknown> {
    const { note: _note, ...rest } = row;
    return rest;
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
