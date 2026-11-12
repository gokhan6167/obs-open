import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { programs } from '../db/schema-academic.js';
import {
  accreditationFiles,
  correctiveActions,
  programReviews,
} from '../db/schema-finance-quality.js';
import { auditLog } from '../db/schema.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { QUALITY_ADMIN, hasRole } from '../common/roles.js';

type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

// Personel yetkisi (approval/campus STAFF ile bire bir).
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

/** Akreditasyona engel sayılan düzeltici eylem durumları. */
const OPEN_ACTION_STATUSES = ['acik', 'devam'];

export interface CreateReviewInput {
  programId: string;
  year: number;
  studentCount?: number | undefined;
  graduateCount?: number | undefined;
  avgGpa?: number | undefined;
  employmentRate?: number | undefined;
  satisfaction?: number | undefined;
  note?: string | undefined;
}

export interface CreateAccreditationInput {
  programId: string;
  body: string;
  cycle?: string | undefined;
  visitDate?: string | undefined;
  note?: string | undefined;
}

export interface UpdateAccreditationInput {
  status: 'hazirlik' | 'basvuru' | 'saha_ziyareti' | 'akredite' | 'red';
  visitDate?: string | undefined;
  note?: string | undefined;
}

export interface CreateActionInput {
  finding: string;
  action?: string | undefined;
  dueOn?: string | undefined;
}

export interface UpdateActionInput {
  status: 'acik' | 'devam' | 'kapali';
  action?: string | undefined;
}

/**
 * Kalite servisi (0024). Tenant-kapsamlı (RLS), tümü personel yetkisi ister.
 * Program izleme göstergeleri (yıllık, program+yıl tekil) ve akreditasyon dosyası
 * yaşam döngüsü: hazirlik → basvuru → saha_ziyareti → akredite/red. Saha ziyareti
 * bulguları düzeltici eylem olarak izlenir; açık/devam bulgu varken dosya akredite
 * edilemez (dış denetim kuralı).
 */
@Injectable()
export class QualityService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Program izleme kayıtları (?programId,?year); program adı join, en yeni yıl önce. */
  async reviews(programId?: string, year?: string): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Program izleme kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, (tx) => {
      const conds = [];
      if (programId) conds.push(eq(programReviews.programId, programId));
      if (year) conds.push(eq(programReviews.year, Number(year)));
      return tx
        .select({
          id: programReviews.id,
          programId: programReviews.programId,
          programCode: programs.code,
          programName: programs.name,
          year: programReviews.year,
          studentCount: programReviews.studentCount,
          graduateCount: programReviews.graduateCount,
          avgGpa: programReviews.avgGpa,
          employmentRate: programReviews.employmentRate,
          satisfaction: programReviews.satisfaction,
          note: programReviews.note,
          createdAt: programReviews.createdAt,
        })
        .from(programReviews)
        .innerJoin(programs, eq(programReviews.programId, programs.id))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(programReviews.year), asc(programs.code));
    });
  }

  /** Program izleme kaydı (personel). Aynı program+yıl varsa 409. */
  async createReview(input: CreateReviewInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, QUALITY_ADMIN)) {
      throw new ForbiddenException('Program izleme kaydı oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.mustProgram(tx, input.programId);

      const [existing] = await tx
        .select({ id: programReviews.id })
        .from(programReviews)
        .where(
          and(eq(programReviews.programId, input.programId), eq(programReviews.year, input.year)),
        )
        .limit(1);
      if (existing) {
        throw new ConflictException('Bu program için bu yıla ait izleme kaydı zaten var');
      }

      const [row] = await tx
        .insert(programReviews)
        .values({
          tenantId: ctx.tenantId,
          programId: input.programId,
          year: input.year,
          studentCount: input.studentCount ?? null,
          graduateCount: input.graduateCount ?? null,
          avgGpa: input.avgGpa !== undefined ? String(input.avgGpa) : null,
          employmentRate: input.employmentRate !== undefined ? String(input.employmentRate) : null,
          satisfaction: input.satisfaction !== undefined ? String(input.satisfaction) : null,
          note: input.note ?? null,
        })
        .returning();
      return row!;
    });
  }

  /** Akreditasyon dosyaları (?programId); program adı + bulgu sayısı (toplam/açık). */
  async accreditations(programId?: string): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Akreditasyon dosyalarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, (tx) =>
      tx
        .select({
          id: accreditationFiles.id,
          programId: accreditationFiles.programId,
          programCode: programs.code,
          programName: programs.name,
          body: accreditationFiles.body,
          cycle: accreditationFiles.cycle,
          status: accreditationFiles.status,
          visitDate: accreditationFiles.visitDate,
          note: accreditationFiles.note,
          createdAt: accreditationFiles.createdAt,
          findingCount: sql<number>`count(${correctiveActions.id})::int`,
          openFindingCount: sql<number>`(count(${correctiveActions.id}) filter (where ${correctiveActions.status} in ('acik', 'devam')))::int`,
        })
        .from(accreditationFiles)
        .innerJoin(programs, eq(accreditationFiles.programId, programs.id))
        .leftJoin(correctiveActions, eq(correctiveActions.accreditationId, accreditationFiles.id))
        .where(programId ? eq(accreditationFiles.programId, programId) : undefined)
        .groupBy(accreditationFiles.id, programs.code, programs.name)
        .orderBy(desc(accreditationFiles.createdAt)),
    );
  }

  /** Akreditasyon dosyası aç (personel). Durum 'hazirlik' başlar. */
  async createAccreditation(input: CreateAccreditationInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, QUALITY_ADMIN)) {
      throw new ForbiddenException('Akreditasyon dosyası açma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.mustProgram(tx, input.programId);

      const [row] = await tx
        .insert(accreditationFiles)
        .values({
          tenantId: ctx.tenantId,
          programId: input.programId,
          body: input.body,
          cycle: input.cycle ?? null,
          visitDate: input.visitDate ?? null,
          note: input.note ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'quality.accreditation.create',
        resourceType: 'accreditation_file',
        resourceId: row!.id,
        diff: { programId: input.programId, body: input.body, cycle: input.cycle ?? null },
      });

      return row!;
    });
  }

  /**
   * Dosya durumu güncelle (personel). 'akredite' yalnızca açık/devam düzeltici
   * eylem kalmadıysa verilebilir.
   */
  async updateAccreditation(
    id: string,
    input: UpdateAccreditationInput,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, QUALITY_ADMIN)) {
      throw new ForbiddenException('Akreditasyon durumu güncelleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const file = await this.mustAccreditation(tx, id);

      if (input.status === 'akredite') {
        const [open] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(correctiveActions)
          .where(
            and(
              eq(correctiveActions.accreditationId, id),
              inArray(correctiveActions.status, OPEN_ACTION_STATUSES),
            ),
          );
        if ((open?.count ?? 0) > 0) {
          throw new ConflictException('Acik duzeltici eylemler kapatilmadan akredite edilemez');
        }
      }

      const [row] = await tx
        .update(accreditationFiles)
        .set({
          status: input.status,
          ...(input.visitDate !== undefined ? { visitDate: input.visitDate } : {}),
          ...(input.note !== undefined ? { note: input.note } : {}),
        })
        .where(eq(accreditationFiles.id, id))
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'quality.accreditation.status',
        resourceType: 'accreditation_file',
        resourceId: id,
        diff: { from: file.status, to: input.status },
      });

      return row!;
    });
  }

  /** Dosyanın düzeltici eylemleri (en yeni önce). */
  async actions(accreditationId: string): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Düzeltici eylemlere erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.mustAccreditation(tx, accreditationId);
      return tx
        .select({
          id: correctiveActions.id,
          accreditationId: correctiveActions.accreditationId,
          finding: correctiveActions.finding,
          action: correctiveActions.action,
          dueOn: correctiveActions.dueOn,
          status: correctiveActions.status,
          createdAt: correctiveActions.createdAt,
        })
        .from(correctiveActions)
        .where(eq(correctiveActions.accreditationId, accreditationId))
        .orderBy(desc(correctiveActions.createdAt));
    });
  }

  /** Bulgu + düzeltici eylem ekle (personel). Durum 'acik' başlar. */
  async createAction(
    accreditationId: string,
    input: CreateActionInput,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, QUALITY_ADMIN)) {
      throw new ForbiddenException('Düzeltici eylem ekleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.mustAccreditation(tx, accreditationId);

      const [row] = await tx
        .insert(correctiveActions)
        .values({
          tenantId: ctx.tenantId,
          accreditationId,
          finding: input.finding,
          action: input.action ?? null,
          dueOn: input.dueOn ?? null,
        })
        .returning();
      return row!;
    });
  }

  /** Düzeltici eylem durumu (personel). */
  async updateAction(id: string, input: UpdateActionInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, QUALITY_ADMIN)) {
      throw new ForbiddenException('Düzeltici eylem güncelleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: correctiveActions.id })
        .from(correctiveActions)
        .where(eq(correctiveActions.id, id))
        .limit(1);
      if (!existing) {
        throw new NotFoundException('Düzeltici eylem bulunamadı');
      }

      const [row] = await tx
        .update(correctiveActions)
        .set({
          status: input.status,
          ...(input.action !== undefined ? { action: input.action } : {}),
        })
        .where(eq(correctiveActions.id, id))
        .returning();
      return row!;
    });
  }

  private async mustProgram(tx: Tx, programId: string): Promise<void> {
    const [program] = await tx
      .select({ id: programs.id })
      .from(programs)
      .where(eq(programs.id, programId))
      .limit(1);
    if (!program) {
      throw new NotFoundException('Program bulunamadı');
    }
  }

  private async mustAccreditation(tx: Tx, id: string): Promise<{ id: string; status: string }> {
    const [file] = await tx
      .select({ id: accreditationFiles.id, status: accreditationFiles.status })
      .from(accreditationFiles)
      .where(eq(accreditationFiles.id, id))
      .limit(1);
    if (!file) {
      throw new NotFoundException('Akreditasyon dosyası bulunamadı');
    }
    return file;
  }
}
