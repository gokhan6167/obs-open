import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { hasRole, STUDENT_ADMIN } from '../common/roles.js';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog } from '../db/schema.js';
import { students } from '../db/schema-academic.js';
import { militaryDeferrals, studentDocuments, studentLeaves } from '../db/schema-backoffice.js';
import { priorEducations, studentAwards } from '../db/schema-depth.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';

// Personel okuma/yazma yetkisi (discipline.service STAFF ile bire bir).
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

export interface CreateLeaveInput {
  type: string;
  startsOn?: string | undefined;
  endsOn?: string | undefined;
  decisionNo?: string | undefined;
  decisionDate?: string | undefined;
  reason?: string | undefined;
}

export interface CreateMilitaryInput {
  status: string;
  deferralDate?: string | undefined;
  note?: string | undefined;
}

export interface CreateDocumentInput {
  kind: string;
  description?: string | undefined;
  docNo?: string | undefined;
  receivedOn?: string | undefined;
  hasOriginal?: boolean | undefined;
}

export interface CreatePriorEducationInput {
  schoolName: string;
  degree?: string | undefined;
  graduationYear?: number | undefined;
  gpa?: number | undefined;
  note?: string | undefined;
}

export interface CreateAwardInput {
  title: string;
  awardDate?: string | undefined;
  description?: string | undefined;
}

/**
 * Öğrenci dosyası servisi (0015 backoffice). Tenant-kapsamlı (RLS), personel
 * yetkisi in-service kontrol edilir; kayıt oluşturma audit'lenir.
 */
@Injectable()
export class StudentFileService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Öğrenci varlığını doğrular (tenant-scoped). */
  private async ensureStudent(
    tx: Parameters<Parameters<typeof withTenant>[2]>[0],
    studentId: string,
  ): Promise<void> {
    const [stu] = await tx
      .select({ id: students.id })
      .from(students)
      .where(eq(students.id, studentId))
      .limit(1);
    if (!stu) {
      throw new NotFoundException('Öğrenci bulunamadı');
    }
  }

  /** Öğrenci dosyası: izinler + askerlik + belgeler. */
  async get(studentId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Öğrenci dosyasına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const leaves = await tx
        .select()
        .from(studentLeaves)
        .where(eq(studentLeaves.studentId, studentId))
        .orderBy(desc(studentLeaves.createdAt));
      const military = await tx
        .select()
        .from(militaryDeferrals)
        .where(eq(militaryDeferrals.studentId, studentId))
        .orderBy(desc(militaryDeferrals.createdAt));
      const documents = await tx
        .select()
        .from(studentDocuments)
        .where(eq(studentDocuments.studentId, studentId))
        .orderBy(desc(studentDocuments.createdAt));
      const priorEds = await tx
        .select()
        .from(priorEducations)
        .where(eq(priorEducations.studentId, studentId))
        .orderBy(desc(priorEducations.createdAt));
      const awards = await tx
        .select()
        .from(studentAwards)
        .where(eq(studentAwards.studentId, studentId))
        .orderBy(desc(studentAwards.createdAt));
      return { leaves, military, documents, priorEducations: priorEds, awards };
    });
  }

  /** İzin/kayıt oluştur (personel). */
  async createLeave(studentId: string, input: CreateLeaveInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Öğrenci izni oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.ensureStudent(tx, studentId);

      const [row] = await tx
        .insert(studentLeaves)
        .values({
          tenantId: ctx.tenantId,
          studentId,
          type: input.type,
          startsOn: input.startsOn ?? null,
          endsOn: input.endsOn ?? null,
          decisionNo: input.decisionNo ?? null,
          decisionDate: input.decisionDate ?? null,
          reason: input.reason ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'student_file.leave.create',
        resourceType: 'student_leave',
        resourceId: row!.id,
        diff: { studentId, type: input.type, decisionNo: input.decisionNo ?? null },
      });

      return row!;
    });
  }

  /** Askerlik erteleme kaydı oluştur (personel). */
  async createMilitary(
    studentId: string,
    input: CreateMilitaryInput,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Askerlik kaydı oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.ensureStudent(tx, studentId);

      const [row] = await tx
        .insert(militaryDeferrals)
        .values({
          tenantId: ctx.tenantId,
          studentId,
          status: input.status,
          deferralDate: input.deferralDate ?? null,
          note: input.note ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'student_file.military.create',
        resourceType: 'military_deferral',
        resourceId: row!.id,
        diff: { studentId, status: input.status },
      });

      return row!;
    });
  }

  /** Belge kaydı oluştur (personel). */
  async createDocument(
    studentId: string,
    input: CreateDocumentInput,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Belge kaydı oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.ensureStudent(tx, studentId);

      const [row] = await tx
        .insert(studentDocuments)
        .values({
          tenantId: ctx.tenantId,
          studentId,
          kind: input.kind,
          description: input.description ?? null,
          docNo: input.docNo ?? null,
          receivedOn: input.receivedOn ?? null,
          hasOriginal: input.hasOriginal ?? false,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'student_file.document.create',
        resourceType: 'student_document',
        resourceId: row!.id,
        diff: { studentId, kind: input.kind, docNo: input.docNo ?? null },
      });

      return row!;
    });
  }

  /** Önceki öğrenim kaydı oluştur (personel). */
  async createPriorEducation(
    studentId: string,
    input: CreatePriorEducationInput,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Önceki öğrenim kaydı oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.ensureStudent(tx, studentId);

      const [row] = await tx
        .insert(priorEducations)
        .values({
          tenantId: ctx.tenantId,
          studentId,
          schoolName: input.schoolName,
          degree: input.degree ?? null,
          graduationYear: input.graduationYear ?? null,
          gpa: input.gpa?.toString() ?? null,
          note: input.note ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'student_file.prior_education.create',
        resourceType: 'prior_education',
        resourceId: row!.id,
        diff: { studentId, schoolName: input.schoolName },
      });

      return row!;
    });
  }

  /** Öğrenci ödül/başarı kaydı oluştur (personel). */
  async createAward(studentId: string, input: CreateAwardInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Ödül kaydı oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.ensureStudent(tx, studentId);

      const [row] = await tx
        .insert(studentAwards)
        .values({
          tenantId: ctx.tenantId,
          studentId,
          title: input.title,
          awardDate: input.awardDate ?? null,
          description: input.description ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'student_file.award.create',
        resourceType: 'student_award',
        resourceId: row!.id,
        diff: { studentId, title: input.title },
      });

      return row!;
    });
  }
}
