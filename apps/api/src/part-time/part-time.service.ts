import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { students } from '../db/schema-academic.js';
import { partTimeAssignments, partTimeJobs, partTimeTimesheets } from '../db/schema-student-life.js';
import { users } from '../db/schema.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { STUDENT_ADMIN, hasRole } from '../common/roles.js';

type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

// Personel okuma yetkisi (club/internship STAFF ile bire bir).
// Yazma (ilan/atama/puantaj onayı) STUDENT_ADMIN ile dar tutulur.
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

export interface CreateJobInput {
  title: string;
  unit?: string | undefined;
  description?: string | undefined;
  hourlyRate?: number | undefined;
  quota?: number | undefined;
}

export interface UpdateJobInput {
  status: 'acik' | 'kapali';
}

export interface UpdateAssignmentInput {
  status?: 'kabul' | 'devam' | 'bitti' | 'red' | undefined;
  startedOn?: string | undefined;
  endedOn?: string | undefined;
}

export interface CreateTimesheetInput {
  period: string;
  hours: number;
}

/**
 * Kısmi zamanlı çalışma servisi (0023). Tenant-kapsamlı (RLS). İlan açma/kapama ve
 * atama-puantaj onayı personel; başvuru aktör öğrencinin kendi kaydı (sahiplik).
 * Onaylanan puantajlarda ücret = saat × ilanın saatlik ücreti (kuruş) olarak dönülür.
 */
@Injectable()
export class PartTimeService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Tüm ilanlar + başvuru sayısı, en yeni önce. */
  async listJobs(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, (tx) =>
      tx
        .select({
          id: partTimeJobs.id,
          title: partTimeJobs.title,
          unit: partTimeJobs.unit,
          description: partTimeJobs.description,
          hourlyRate: partTimeJobs.hourlyRate,
          quota: partTimeJobs.quota,
          status: partTimeJobs.status,
          createdAt: partTimeJobs.createdAt,
          applicationCount: sql<number>`count(${partTimeAssignments.id})::int`,
        })
        .from(partTimeJobs)
        .leftJoin(partTimeAssignments, eq(partTimeAssignments.jobId, partTimeJobs.id))
        .groupBy(partTimeJobs.id)
        .orderBy(desc(partTimeJobs.createdAt)),
    );
  }

  /** İlan oluştur (öğrenci işleri yetkilisi). */
  async createJob(input: CreateJobInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('İlan oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .insert(partTimeJobs)
        .values({
          tenantId: ctx.tenantId,
          title: input.title,
          unit: input.unit ?? null,
          description: input.description ?? null,
          hourlyRate: input.hourlyRate ?? null,
          quota: input.quota ?? null,
        })
        .returning();
      return row!;
    });
  }

  /** İlan durumunu güncelle (öğrenci işleri yetkilisi; acik/kapali). */
  async updateJob(id: string, input: UpdateJobInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('İlan güncelleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .update(partTimeJobs)
        .set({ status: input.status })
        .where(eq(partTimeJobs.id, id))
        .returning();
      if (!row) {
        throw new NotFoundException('İlan bulunamadı');
      }
      return row;
    });
  }

  /** Atama kuyruğu (personel; ?jobId, ?status; öğrenci + ilan adı join). */
  async listAssignments(jobId?: string, status?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Atama kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const conds = [];
      if (jobId) conds.push(eq(partTimeAssignments.jobId, jobId));
      if (status) conds.push(eq(partTimeAssignments.status, status));
      const where = conds.length ? and(...conds) : undefined;
      const items = await tx
        .select({
          id: partTimeAssignments.id,
          jobId: partTimeAssignments.jobId,
          jobTitle: partTimeJobs.title,
          hourlyRate: partTimeJobs.hourlyRate,
          studentId: partTimeAssignments.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          status: partTimeAssignments.status,
          startedOn: partTimeAssignments.startedOn,
          endedOn: partTimeAssignments.endedOn,
          createdAt: partTimeAssignments.createdAt,
        })
        .from(partTimeAssignments)
        .innerJoin(partTimeJobs, eq(partTimeAssignments.jobId, partTimeJobs.id))
        .innerJoin(students, eq(partTimeAssignments.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .where(where)
        .orderBy(desc(partTimeAssignments.createdAt));
      return { items };
    });
  }

  /** Aktör öğrencinin atamaları (ilan bilgisi ile). */
  async myAssignments(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) return [];
      return tx
        .select({
          id: partTimeAssignments.id,
          jobId: partTimeJobs.id,
          jobTitle: partTimeJobs.title,
          unit: partTimeJobs.unit,
          hourlyRate: partTimeJobs.hourlyRate,
          status: partTimeAssignments.status,
          startedOn: partTimeAssignments.startedOn,
          endedOn: partTimeAssignments.endedOn,
          createdAt: partTimeAssignments.createdAt,
        })
        .from(partTimeAssignments)
        .innerJoin(partTimeJobs, eq(partTimeAssignments.jobId, partTimeJobs.id))
        .where(eq(partTimeAssignments.studentId, sid))
        .orderBy(desc(partTimeAssignments.createdAt));
    });
  }

  /** Aktör öğrenci ilana başvurur (ilan kapalıysa 409, ikinci başvuru 409). */
  async apply(jobId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) {
        throw new ForbiddenException('Yalnızca öğrenci ilana başvurabilir');
      }
      const [job] = await tx
        .select({ id: partTimeJobs.id, status: partTimeJobs.status })
        .from(partTimeJobs)
        .where(eq(partTimeJobs.id, jobId))
        .limit(1);
      if (!job) {
        throw new NotFoundException('İlan bulunamadı');
      }
      if (job.status !== 'acik') {
        throw new ConflictException('İlan kapalı, başvuru alınamıyor');
      }
      const [existing] = await tx
        .select({ id: partTimeAssignments.id })
        .from(partTimeAssignments)
        .where(
          and(eq(partTimeAssignments.jobId, jobId), eq(partTimeAssignments.studentId, sid)),
        )
        .limit(1);
      if (existing) {
        throw new ConflictException('Bu ilana zaten başvurdunuz');
      }
      const [row] = await tx
        .insert(partTimeAssignments)
        .values({
          tenantId: ctx.tenantId,
          jobId,
          studentId: sid,
          status: 'basvuruldu',
        })
        .returning();
      return row!;
    });
  }

  /** Atama güncelle (öğrenci işleri yetkilisi; kabul/devam/bitti/red + tarihler). */
  async updateAssignment(
    id: string,
    input: UpdateAssignmentInput,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Atama güncelleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(partTimeAssignments)
        .where(eq(partTimeAssignments.id, id))
        .limit(1);
      if (!existing) {
        throw new NotFoundException('Atama bulunamadı');
      }

      const patch: Record<string, unknown> = {};
      if (input.status !== undefined) patch.status = input.status;
      if (input.startedOn !== undefined) patch.startedOn = input.startedOn;
      if (input.endedOn !== undefined) patch.endedOn = input.endedOn;

      if (Object.keys(patch).length === 0) {
        return existing;
      }

      const [row] = await tx
        .update(partTimeAssignments)
        .set(patch)
        .where(eq(partTimeAssignments.id, id))
        .returning();
      return row!;
    });
  }

  /** Atamanın puantajları (onaylılarda ücret hesabı ile). */
  async timesheets(assignmentId: string): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const assignment = await this.loadAssignment(tx, assignmentId);
      await this.assertTimesheetAccess(tx, ctx, assignment.studentId);
      const rows = await tx
        .select()
        .from(partTimeTimesheets)
        .where(eq(partTimeTimesheets.assignmentId, assignmentId))
        .orderBy(desc(partTimeTimesheets.createdAt));
      return rows.map((r) => this.withAmount(r, assignment.hourlyRate));
    });
  }

  /** Puantaj ekle (personel veya atamanın öğrencisi). */
  async createTimesheet(
    assignmentId: string,
    input: CreateTimesheetInput,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const assignment = await this.loadAssignment(tx, assignmentId);
      await this.assertTimesheetAccess(tx, ctx, assignment.studentId);
      const [row] = await tx
        .insert(partTimeTimesheets)
        .values({
          tenantId: ctx.tenantId,
          assignmentId,
          period: input.period,
          hours: String(input.hours),
        })
        .returning();
      return this.withAmount(row!, assignment.hourlyRate);
    });
  }

  /** Puantaj onayla/geri al (öğrenci işleri yetkilisi); onaylıysa ücret hesabı yanıtta döner. */
  async approveTimesheet(id: string, approved: boolean): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Puantaj onay yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select({
          id: partTimeTimesheets.id,
          hourlyRate: partTimeJobs.hourlyRate,
        })
        .from(partTimeTimesheets)
        .innerJoin(
          partTimeAssignments,
          eq(partTimeTimesheets.assignmentId, partTimeAssignments.id),
        )
        .innerJoin(partTimeJobs, eq(partTimeAssignments.jobId, partTimeJobs.id))
        .where(eq(partTimeTimesheets.id, id))
        .limit(1);
      if (!existing) {
        throw new NotFoundException('Puantaj bulunamadı');
      }
      const [row] = await tx
        .update(partTimeTimesheets)
        .set({ approved })
        .where(eq(partTimeTimesheets.id, id))
        .returning();
      return this.withAmount(row!, existing.hourlyRate);
    });
  }

  /** Onaylı puantajda ücret (kuruş) = saat × saatlik ücret; değilse null. */
  private withAmount(
    row: typeof partTimeTimesheets.$inferSelect,
    hourlyRate: number | null,
  ): Record<string, unknown> {
    const amount =
      row.approved && hourlyRate !== null ? Math.round(Number(row.hours) * hourlyRate) : null;
    return { ...row, hourlyRate, amount };
  }

  private async loadAssignment(
    tx: Tx,
    assignmentId: string,
  ): Promise<{ studentId: string; hourlyRate: number | null }> {
    const [row] = await tx
      .select({
        studentId: partTimeAssignments.studentId,
        hourlyRate: partTimeJobs.hourlyRate,
      })
      .from(partTimeAssignments)
      .innerJoin(partTimeJobs, eq(partTimeAssignments.jobId, partTimeJobs.id))
      .where(eq(partTimeAssignments.id, assignmentId))
      .limit(1);
    if (!row) {
      throw new NotFoundException('Atama bulunamadı');
    }
    return row;
  }

  /** Puantaj erişimi: personel ya da atamanın kendi öğrencisi. */
  private async assertTimesheetAccess(
    tx: Tx,
    ctx: { roles?: readonly string[]; actorUserId?: string },
    studentId: string,
  ): Promise<void> {
    if (isStaff(ctx.roles ?? [])) return;
    const sid = await this.myStudentId(tx, ctx.actorUserId);
    if (sid !== studentId) {
      throw new ForbiddenException('Bu atamanın puantajlarına erişim yetkiniz yok');
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
