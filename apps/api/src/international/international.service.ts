import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { desc, eq, isNotNull, sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog } from '../db/schema.js';
import { programs } from '../db/schema-academic.js';
import { internationalAdmissions } from '../db/schema-admissions-deep.js';
import { applicants, applicationPrograms } from '../db/schema-backoffice.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { ADMISSIONS_ADMIN, hasRole } from '../common/roles.js';

// Personel okuma/yazma yetkisi (admissions.service STAFF ile bire bir).
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

export interface CreateInternationalInput {
  applicantId: string;
  country?: string | undefined;
  depositAmount?: number | undefined;
  note?: string | undefined;
}

export interface UpdateInternationalInput {
  depositPaid?: boolean | undefined;
  visaStatus?: string | undefined;
  status?: string | undefined;
  acceptanceLetterNo?: string | undefined;
  note?: string | undefined;
}

/**
 * Uluslararası kabul servisi (0021 admissions-deep). Tenant-kapsamlı (RLS),
 * personel yetkisi in-service kontrol edilir; yazma işlemleri audit'lenir.
 * Kural: depozito ödenmeden resmi kabul belgesi (acceptance letter) düzenlenemez.
 */
@Injectable()
export class InternationalService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Uluslararası kabul kayıtları; aday adı + program adı join, en yeni önce. */
  async list(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Uluslararası kabul kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: internationalAdmissions.id,
          applicantId: internationalAdmissions.applicantId,
          applicantName: applicants.fullName,
          programId: applicationPrograms.programId,
          programName: programs.name,
          country: internationalAdmissions.country,
          depositAmount: internationalAdmissions.depositAmount,
          depositPaid: internationalAdmissions.depositPaid,
          acceptanceLetterNo: internationalAdmissions.acceptanceLetterNo,
          visaStatus: internationalAdmissions.visaStatus,
          status: internationalAdmissions.status,
          note: internationalAdmissions.note,
          createdAt: internationalAdmissions.createdAt,
        })
        .from(internationalAdmissions)
        .innerJoin(applicants, eq(internationalAdmissions.applicantId, applicants.id))
        .innerJoin(
          applicationPrograms,
          eq(applicants.applicationProgramId, applicationPrograms.id),
        )
        .innerJoin(programs, eq(applicationPrograms.programId, programs.id))
        .orderBy(desc(internationalAdmissions.createdAt));
      return { items };
    });
  }

  /** Uluslararası kabul kaydı oluştur (personel). Aday varlığı doğrulanır + audit. */
  async create(input: CreateInternationalInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ADMISSIONS_ADMIN)) {
      throw new ForbiddenException('Uluslararası kabul kaydı oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [applicant] = await tx
        .select({ id: applicants.id })
        .from(applicants)
        .where(eq(applicants.id, input.applicantId))
        .limit(1);
      if (!applicant) {
        throw new NotFoundException('Başvuran bulunamadı');
      }

      const [row] = await tx
        .insert(internationalAdmissions)
        .values({
          tenantId: ctx.tenantId,
          applicantId: input.applicantId,
          country: input.country ?? null,
          depositAmount: input.depositAmount ?? null,
          note: input.note ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'international.create',
        resourceType: 'international_admission',
        resourceId: row!.id,
        diff: {
          applicantId: input.applicantId,
          country: input.country ?? null,
          depositAmount: input.depositAmount ?? null,
        },
      });

      return row!;
    });
  }

  /**
   * Uluslararası kabul kaydını güncelle (personel). Depozito ödenmemişse
   * resmi kabul belgesi no'su elle girilemez (409).
   */
  async update(id: string, input: UpdateInternationalInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ADMISSIONS_ADMIN)) {
      throw new ForbiddenException('Uluslararası kabul kaydı güncelleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: internationalAdmissions.id, depositPaid: internationalAdmissions.depositPaid })
        .from(internationalAdmissions)
        .where(eq(internationalAdmissions.id, id))
        .limit(1);
      if (!existing) {
        throw new NotFoundException('Uluslararası kabul kaydı bulunamadı');
      }

      // Bu istek sonrası geçerli olacak depozito durumu.
      const depositPaid = input.depositPaid ?? existing.depositPaid;
      if (input.acceptanceLetterNo !== undefined && !depositPaid) {
        throw new ConflictException('Depozito ödenmeden resmi kabul belgesi düzenlenemez');
      }

      const patch: Record<string, unknown> = {};
      if (input.depositPaid !== undefined) patch.depositPaid = input.depositPaid;
      if (input.visaStatus !== undefined) patch.visaStatus = input.visaStatus;
      if (input.status !== undefined) patch.status = input.status;
      if (input.acceptanceLetterNo !== undefined) patch.acceptanceLetterNo = input.acceptanceLetterNo;
      if (input.note !== undefined) patch.note = input.note;

      if (Object.keys(patch).length === 0) {
        const [row] = await tx
          .select()
          .from(internationalAdmissions)
          .where(eq(internationalAdmissions.id, id))
          .limit(1);
        return row!;
      }

      const [row] = await tx
        .update(internationalAdmissions)
        .set(patch)
        .where(eq(internationalAdmissions.id, id))
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'international.update',
        resourceType: 'international_admission',
        resourceId: id,
        diff: patch,
      });

      return row!;
    });
  }

  /**
   * Resmi kabul belgesi düzenle. Depozito ödenmemişse 409. Belge no otomatik
   * üretilir (ACC-yyyy-0001); kayıtta belge no varsa idempotent döner.
   */
  async issueAcceptanceLetter(id: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, ADMISSIONS_ADMIN)) {
      throw new ForbiddenException('Resmi kabul belgesi düzenleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(internationalAdmissions)
        .where(eq(internationalAdmissions.id, id))
        .limit(1);
      if (!existing) {
        throw new NotFoundException('Uluslararası kabul kaydı bulunamadı');
      }
      if (!existing.depositPaid) {
        throw new ConflictException('Depozito ödenmeden resmi kabul belgesi düzenlenemez');
      }
      if (existing.acceptanceLetterNo) {
        return existing;
      }

      // Belge no otomatik: yıl + tenant içi sıra (ACC-yyyy-0001).
      const year = String(new Date().getUTCFullYear());
      const [counted] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(internationalAdmissions)
        .where(isNotNull(internationalAdmissions.acceptanceLetterNo));
      const acceptanceLetterNo = `ACC-${year}-${String((counted?.count ?? 0) + 1).padStart(4, '0')}`;

      const [row] = await tx
        .update(internationalAdmissions)
        .set({ acceptanceLetterNo })
        .where(eq(internationalAdmissions.id, id))
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'international.acceptance_letter',
        resourceType: 'international_admission',
        resourceId: id,
        diff: { acceptanceLetterNo },
      });

      return row!;
    });
  }
}
