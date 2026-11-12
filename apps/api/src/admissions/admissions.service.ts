import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog } from '../db/schema.js';
import { programs } from '../db/schema-academic.js';
import { applicants, applicationPrograms } from '../db/schema-backoffice.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { ADMISSIONS_ADMIN, hasRole } from '../common/roles.js';

// Personel okuma/yazma yetkisi (students.service STAFF ile bire bir).
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

export interface CreateProgramInput {
  programId: string;
  type: string;
  year: number;
  term?: string | undefined;
  quota: number;
  startsOn?: string | undefined;
  endsOn?: string | undefined;
  minGpa?: number | undefined;
}

export interface CreateApplicantInput {
  applicationProgramId: string;
  fullName: string;
  nationalId?: string | undefined;
  score?: number | undefined;
}

/**
 * Başvuru (admissions) servisi (0015 backoffice). Tenant-kapsamlı (RLS),
 * personel yetkisi in-service kontrol edilir; yazma işlemleri audit'lenir.
 */
@Injectable()
export class AdmissionsService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Başvuru programları; program adı join + başvuran sayısı. */
  async listPrograms(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Başvuru programlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: applicationPrograms.id,
          programId: applicationPrograms.programId,
          programName: programs.name,
          type: applicationPrograms.type,
          year: applicationPrograms.year,
          term: applicationPrograms.term,
          quota: applicationPrograms.quota,
          startsOn: applicationPrograms.startsOn,
          endsOn: applicationPrograms.endsOn,
          minGpa: applicationPrograms.minGpa,
          status: applicationPrograms.status,
          applicantCount: sql<number>`count(${applicants.id})::int`,
          createdAt: applicationPrograms.createdAt,
        })
        .from(applicationPrograms)
        .innerJoin(programs, eq(applicationPrograms.programId, programs.id))
        .leftJoin(applicants, eq(applicants.applicationProgramId, applicationPrograms.id))
        .groupBy(applicationPrograms.id, programs.name)
        .orderBy(desc(applicationPrograms.createdAt));
      return { items };
    });
  }

  /** Başvuru programı oluştur (personel). Program varlığı doğrulanır + audit. */
  async createProgram(input: CreateProgramInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ADMISSIONS_ADMIN)) {
      throw new ForbiddenException('Başvuru programı oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [prog] = await tx
        .select({ id: programs.id })
        .from(programs)
        .where(eq(programs.id, input.programId))
        .limit(1);
      if (!prog) {
        throw new NotFoundException('Program bulunamadı');
      }

      const [row] = await tx
        .insert(applicationPrograms)
        .values({
          tenantId: ctx.tenantId,
          programId: input.programId,
          type: input.type,
          year: input.year,
          term: input.term ?? null,
          quota: input.quota,
          startsOn: input.startsOn ?? null,
          endsOn: input.endsOn ?? null,
          minGpa: input.minGpa?.toString() ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'admissions.program.create',
        resourceType: 'application_program',
        resourceId: row!.id,
        diff: {
          programId: input.programId,
          type: input.type,
          year: input.year,
          quota: input.quota,
        },
      });

      return row!;
    });
  }

  /** Başvuranlar; opsiyonel başvuru programı filtresi. */
  async listApplicants(applicationProgramId?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Başvuran kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const where = applicationProgramId
        ? eq(applicants.applicationProgramId, applicationProgramId)
        : undefined;
      const items = await tx
        .select({
          id: applicants.id,
          applicationProgramId: applicants.applicationProgramId,
          fullName: applicants.fullName,
          nationalId: applicants.nationalId,
          score: applicants.score,
          status: applicants.status,
          createdAt: applicants.createdAt,
        })
        .from(applicants)
        .where(where)
        .orderBy(desc(applicants.createdAt));
      return { items };
    });
  }

  /** Başvuran oluştur (personel). Başvuru programı varlığı doğrulanır + audit. */
  async createApplicant(input: CreateApplicantInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ADMISSIONS_ADMIN)) {
      throw new ForbiddenException('Başvuran oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [ap] = await tx
        .select({ id: applicationPrograms.id })
        .from(applicationPrograms)
        .where(eq(applicationPrograms.id, input.applicationProgramId))
        .limit(1);
      if (!ap) {
        throw new NotFoundException('Başvuru programı bulunamadı');
      }

      const [row] = await tx
        .insert(applicants)
        .values({
          tenantId: ctx.tenantId,
          applicationProgramId: input.applicationProgramId,
          fullName: input.fullName,
          nationalId: input.nationalId ?? null,
          score: input.score?.toString() ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'admissions.applicant.create',
        resourceType: 'applicant',
        resourceId: row!.id,
        diff: {
          applicationProgramId: input.applicationProgramId,
          fullName: input.fullName,
        },
      });

      return row!;
    });
  }

  /** Başvuran durumunu güncelle (personel). Kayıt varlığı doğrulanır + audit. */
  async updateApplicantStatus(id: string, status: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ADMISSIONS_ADMIN)) {
      throw new ForbiddenException('Başvuran durumu güncelleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: applicants.id })
        .from(applicants)
        .where(eq(applicants.id, id))
        .limit(1);
      if (!existing) {
        throw new NotFoundException('Başvuran bulunamadı');
      }

      const [row] = await tx
        .update(applicants)
        .set({ status })
        .where(eq(applicants.id, id))
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'admissions.applicant.status',
        resourceType: 'applicant',
        resourceId: id,
        diff: { status },
      });

      return row!;
    });
  }
}
