import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { computeCommitteeYear, type CommitteeYearResult } from '@obs/academic-core';
import { and, asc, eq } from 'drizzle-orm';
import { requireRole } from '../common/authz.js';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { students } from '../db/schema-academic.js';
import {
  clinicalSites,
  committeeScores,
  committees,
  internships,
  rotationAssignments,
  rotations,
} from '../db/schema-health.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { planRotation } from './rotation-planner.js';
import { SGK_PROVIDER, type SgkProvider } from './sgk.provider.js';

const HEALTH_ROLES = ['oidb', 'sistem_yoneticisi', 'dekanlik', 'ogretim_elemani'];

export interface CommitteeYearParams {
  generalExamScore: number;
  committeesWeightInYear: number;
  generalExamWeightInYear: number;
  passingThreshold: number;
}

/**
 * Sağlık modülü servisi (M7). Grup bazlı dönüşümlü rotasyon planı üretir ve kurul
 * (komite) yıl notunu hesaplar (academic-core computeCommitteeYear ile).
 */
@Injectable()
export class HealthService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(SGK_PROVIDER) private readonly sgk: SgkProvider,
  ) {}

  /**
   * Rotasyon planı üret: öğrencileri gruplara dağıt, grupları dönüşümlü kliniklere
   * ata (round-robin, çakışmasız). İlk periyot yerleşimini kaydeder.
   */
  async generateRotationPlan(
    rotationId: string,
    studentIds: readonly string[],
    startsOn: string,
  ): Promise<{ assigned: number }> {
    const ctx = requireTenant();
    requireRole(ctx, HEALTH_ROLES);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [rot] = await tx
        .select({ groupCount: rotations.groupCount })
        .from(rotations)
        .where(eq(rotations.id, rotationId))
        .limit(1);
      if (!rot) {
        throw new NotFoundException('Rotasyon bulunamadı');
      }
      const sites = await tx
        .select({ id: clinicalSites.id })
        .from(clinicalSites)
        .orderBy(asc(clinicalSites.code));
      if (sites.length === 0) {
        throw new NotFoundException('Klinik tanımlı değil');
      }

      // İlk periyot (period=0) yerleşimi.
      const plan = planRotation(rot.groupCount, sites.length, 1);
      let assigned = 0;
      for (let i = 0; i < studentIds.length; i += 1) {
        const groupNo = i % rot.groupCount;
        const slot = plan.find((s) => s.groupNo === groupNo && s.period === 0)!;
        await tx.insert(rotationAssignments).values({
          tenantId: ctx.tenantId,
          rotationId,
          clinicalSiteId: sites[slot.siteIndex]!.id,
          studentId: studentIds[i]!,
          groupNo,
          startsOn,
          endsOn: startsOn, // basitleştirme: süre uygulama katmanında hesaplanır
        });
        assigned += 1;
      }
      return { assigned };
    });
  }

  /** Kurul (komite) yıl notu: öğrencinin kurul puanları + genel sınav. */
  async computeCommitteeYearForStudent(
    studentId: string,
    termId: string,
    params: CommitteeYearParams,
  ): Promise<CommitteeYearResult> {
    const ctx = requireTenant();
    requireRole(ctx, HEALTH_ROLES);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const studentRows = await tx
        .select({
          committeeId: committees.id,
          weightBps: committees.weightBps,
          score: committeeScores.score,
        })
        .from(committees)
        .innerJoin(committeeScores, eq(committeeScores.committeeId, committees.id))
        .where(and(eq(committees.termId, termId), eq(committeeScores.studentId, studentId)))
        .orderBy(asc(committees.orderNo));

      return computeCommitteeYear({
        committees: studentRows.map((r) => ({
          committeeId: r.committeeId,
          weight: r.weightBps / 10000,
          score: r.score,
        })),
        generalExamScore: params.generalExamScore,
        committeesWeightInYear: params.committeesWeightInYear,
        generalExamWeightInYear: params.generalExamWeightInYear,
        passingThreshold: params.passingThreshold,
      });
    });
  }

  /** Staj/intörnlük kaydı oluştur. */
  async createInternship(
    studentId: string,
    clinicalSiteId: string,
    startsOn: string,
    endsOn: string,
  ): Promise<{ internshipId: string }> {
    const ctx = requireTenant();
    requireRole(ctx, HEALTH_ROLES);
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .insert(internships)
        .values({ tenantId: ctx.tenantId, studentId, clinicalSiteId, startsOn, endsOn })
        .returning({ id: internships.id });
      return { internshipId: row!.id };
    });
  }

  /** Staj defteri onayı -> tamamlandı. */
  async approveLogbook(internshipId: string): Promise<void> {
    const ctx = requireTenant();
    requireRole(ctx, HEALTH_ROLES);
    await withTenant(this.handle.db, ctx.tenantId, (tx) =>
      tx
        .update(internships)
        .set({ logbookApproved: true, status: 'completed' })
        .where(eq(internships.id, internshipId)),
    );
  }

  /** SGK giriş bildirimi verisi üret (adaptör). Yalnızca ÖİDB/sistem. */
  async generateSgkData(): Promise<{ generated: number; format: string }> {
    const ctx = requireTenant();
    requireRole(ctx, ['oidb', 'sistem_yoneticisi']);
    const records = await withTenant(this.handle.db, ctx.tenantId, (tx) =>
      tx
        .select({
          studentNo: students.studentNo,
          siteName: clinicalSites.name,
          startsOn: internships.startsOn,
          endsOn: internships.endsOn,
        })
        .from(internships)
        .innerJoin(students, eq(internships.studentId, students.id))
        .innerJoin(clinicalSites, eq(internships.clinicalSiteId, clinicalSites.id)),
    );
    return this.sgk.generateEntries(records);
  }
}
