import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  checkDoubleMajorEligibility,
  type DoubleMajorRules,
  type DoubleMajorType,
} from '@obs/academic-core';
import { eq, sql } from 'drizzle-orm';
import { requireOwnershipOrRole } from '../common/authz.js';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog } from '../db/schema.js';
import { students } from '../db/schema-academic.js';
import { grades } from '../db/schema-grades.js';
import { doubleMajorApplications } from '../db/schema-double-major.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { GpaService } from '../grades/gpa.service.js';
import {
  applyRequestTransition,
  InvalidRequestTransitionError,
  type RequestStatus,
} from '../requests/request-status.js';

// VARSAYIM kurallar (docs/ASSUMPTIONS.md; ileride parametre tablosuna taşınacak).
const DEFAULT_RULES: DoubleMajorRules = {
  minGpaCap: 3.0,
  minGpaYandal: 2.5,
  minCompletedRatio: 0.25,
  maxCompletedRatio: 0.625,
};
const DEFAULT_TOTAL_TERMS = 8;

@Injectable()
export class DoubleMajorService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    private readonly gpa: GpaService,
  ) {}

  /** ÇAP/yandal başvurusu. Uygunluk (academic-core) başvuru anında kontrol edilir. */
  async apply(
    studentId: string,
    type: DoubleMajorType,
    targetProgramId: string,
    onDate: string,
  ): Promise<{ applicationId: string; status: RequestStatus }> {
    const ctx = requireTenant();

    // Öğrenci + program + tamamlanan dönem sayısı SUNUCUDAN türetilir (client'a güvenilmez).
    const stu = await withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [s] = await tx
        .select({ userId: students.userId, programId: students.programId })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);
      if (!s) {
        return null;
      }
      const [tc] = await tx
        .select({ n: sql<number>`count(distinct ${grades.termId})::int` })
        .from(grades)
        .where(eq(grades.studentId, studentId));
      return { ...s, completedTerms: Number(tc?.n ?? 0) };
    });
    if (!stu) {
      throw new NotFoundException('Öğrenci bulunamadı');
    }
    // IDOR: öğrenci kendi başvurusu; ÖİDB de yapabilir.
    requireOwnershipOrRole(ctx, stu.userId, ['oidb', 'sistem_yoneticisi']);

    const gpaResult = await this.gpa.computeStudentGpa(studentId, stu.programId, onDate);
    const eligibility = checkDoubleMajorEligibility({
      type,
      gpa: gpaResult.gpa,
      completedTerms: stu.completedTerms, // sunucudan türetildi
      totalTerms: DEFAULT_TOTAL_TERMS,
      // Disiplin modülü henüz yok -> daima false; başvuruyu komisyon (personel) ayrıca
      // inceler ve disiplin durumunu manuel değerlendirir. Modül gelince buraya bağlanacak.
      hasDisciplinaryPenalty: false,
      rules: DEFAULT_RULES,
    });
    if (!eligibility.eligible) {
      throw new ConflictException(`Başvuru koşulları sağlanmıyor: ${eligibility.reasons.join('; ')}`);
    }

    const applicationId = await withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .insert(doubleMajorApplications)
        .values({
          tenantId: ctx.tenantId,
          studentId,
          type,
          targetProgramId,
          gpaSnapshot: gpaResult.gpa,
          eligibility: { minGpa: eligibility.minGpa },
        })
        .returning({ id: doubleMajorApplications.id });
      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'double_major.basvuru',
        resourceType: 'double_major',
        resourceId: row!.id,
        diff: { type, targetProgramId, gpa: gpaResult.gpa },
      });
      return row!.id;
    });

    return { applicationId, status: 'submitted' };
  }

  /** Komisyon geçişi (incele/onayla/reddet). ÖİDB/komisyon yetkisi. */
  async transition(
    applicationId: string,
    to: RequestStatus,
    reason?: string,
  ): Promise<{ status: RequestStatus }> {
    const ctx = requireTenant();
    const roles = new Set(ctx.roles ?? []);
    const staff = roles.has('oidb') || roles.has('sistem_yoneticisi') || roles.has('dekanlik');

    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [app] = await tx
        .select({
          status: doubleMajorApplications.status,
          studentId: doubleMajorApplications.studentId,
          ownerUserId: students.userId,
        })
        .from(doubleMajorApplications)
        .innerJoin(students, eq(doubleMajorApplications.studentId, students.id))
        .where(eq(doubleMajorApplications.id, applicationId))
        .limit(1);
      if (!app) {
        throw new NotFoundException('Başvuru bulunamadı');
      }

      let transition;
      try {
        transition = applyRequestTransition(app.status as RequestStatus, to);
      } catch (e) {
        if (e instanceof InvalidRequestTransitionError) {
          throw new ConflictException(e.message);
        }
        throw e;
      }
      // Yetki: personel her kararı verebilir. 'iptal' yalnız başvuru SAHİBİ öğrenci
      // (veya personel) tarafından; başkasının başvurusunu iptal etmek engellenir (IDOR).
      if (transition.action === 'iptal') {
        if (!staff && ctx.actorUserId !== app.ownerUserId) {
          throw new ForbiddenException('Başkasının başvurusunu iptal edemezsiniz');
        }
      } else if (!staff) {
        throw new ForbiddenException('Bu işlem için yetkiniz yok');
      }

      await tx
        .update(doubleMajorApplications)
        .set({
          status: to,
          reviewerUserId: staff ? (ctx.actorUserId ?? null) : null,
          decisionReason: reason ?? null,
        })
        .where(eq(doubleMajorApplications.id, applicationId));
      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: `double_major.${transition.action}`,
        resourceType: 'double_major',
        resourceId: applicationId,
        diff: { status: { from: app.status, to }, reason: reason ?? null },
      });
      return { status: to };
    });
  }
}
