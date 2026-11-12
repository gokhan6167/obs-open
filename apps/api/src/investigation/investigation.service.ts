import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog, users } from '../db/schema.js';
import { students } from '../db/schema-academic.js';
import { disciplinaryActions } from '../db/schema-discipline.js';
import { disciplinaryInvestigations } from '../db/schema-finance-quality.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { DISCIPLINE_ADMIN, hasRole } from '../common/roles.js';

type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

// Personel okuma yetkisi (discipline.service STAFF ile bire bir).
// Yazma (soruşturma açma/güncelleme/ceza) DISCIPLINE_ADMIN ile dar tutulur.
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

export type InvestigationStage = 'on_inceleme' | 'sorusturma' | 'karar' | 'itiraz' | 'kapali';

export interface CreateInvestigationInput {
  studentId: string;
  complaint: string;
  investigatorUserId?: string | undefined;
}

export interface UpdateInvestigationInput {
  stage?: InvestigationStage | undefined;
  evidence?: string | undefined;
  decision?: string | undefined;
  decisionNo?: string | undefined;
  decisionDate?: string | undefined;
  investigatorUserId?: string | null | undefined;
}

export interface ApplyPenaltyInput {
  category: string;
  penalty: string;
  startsOn?: string | undefined;
  endsOn?: string | undefined;
}

const isBlank = (v: string | null | undefined): boolean => !v || v.trim().length === 0;

/**
 * Disiplin soruşturma akışı (0024). Tenant-kapsamlı (RLS), personel yetkisi
 * in-service kontrol edilir. Aşama zinciri: ihbar → ön inceleme → soruşturma →
 * karar → itiraz → kapalı. Karar aşamasına karar metni, kapanışa karar no şarttır;
 * ceza yalnızca karar/kapalı aşamasında üretilip disiplin kaydına bağlanır.
 */
@Injectable()
export class InvestigationService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Soruşturmalar (personel); ?stage,?studentId; öğrenci no/e-posta + soruşturmacı e-postası. */
  async list(stage?: string, studentId?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Soruşturma kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const investigator = alias(users, 'investigator');
      const conds = [];
      if (stage) conds.push(eq(disciplinaryInvestigations.stage, stage));
      if (studentId) conds.push(eq(disciplinaryInvestigations.studentId, studentId));
      const items = await tx
        .select({
          id: disciplinaryInvestigations.id,
          studentId: disciplinaryInvestigations.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          complaint: disciplinaryInvestigations.complaint,
          stage: disciplinaryInvestigations.stage,
          investigatorUserId: disciplinaryInvestigations.investigatorUserId,
          investigatorEmail: investigator.email,
          evidence: disciplinaryInvestigations.evidence,
          decision: disciplinaryInvestigations.decision,
          decisionNo: disciplinaryInvestigations.decisionNo,
          decisionDate: disciplinaryInvestigations.decisionDate,
          actionId: disciplinaryInvestigations.actionId,
          createdAt: disciplinaryInvestigations.createdAt,
        })
        .from(disciplinaryInvestigations)
        .innerJoin(students, eq(disciplinaryInvestigations.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .leftJoin(investigator, eq(disciplinaryInvestigations.investigatorUserId, investigator.id))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(disciplinaryInvestigations.createdAt));
      return { items };
    });
  }

  /** Soruşturma detayı (personel) + bağlı disiplin cezası. */
  async detail(id: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Soruşturma kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const investigator = alias(users, 'investigator');
      const [row] = await tx
        .select({
          id: disciplinaryInvestigations.id,
          studentId: disciplinaryInvestigations.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          complaint: disciplinaryInvestigations.complaint,
          stage: disciplinaryInvestigations.stage,
          investigatorUserId: disciplinaryInvestigations.investigatorUserId,
          investigatorEmail: investigator.email,
          evidence: disciplinaryInvestigations.evidence,
          decision: disciplinaryInvestigations.decision,
          decisionNo: disciplinaryInvestigations.decisionNo,
          decisionDate: disciplinaryInvestigations.decisionDate,
          actionId: disciplinaryInvestigations.actionId,
          createdAt: disciplinaryInvestigations.createdAt,
        })
        .from(disciplinaryInvestigations)
        .innerJoin(students, eq(disciplinaryInvestigations.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .leftJoin(investigator, eq(disciplinaryInvestigations.investigatorUserId, investigator.id))
        .where(eq(disciplinaryInvestigations.id, id))
        .limit(1);
      if (!row) {
        throw new NotFoundException('Soruşturma bulunamadı');
      }

      let action: Record<string, unknown> | null = null;
      if (row.actionId) {
        const [found] = await tx
          .select()
          .from(disciplinaryActions)
          .where(eq(disciplinaryActions.id, row.actionId))
          .limit(1);
        action = found ?? null;
      }

      return { investigation: row, action };
    });
  }

  /** Soruşturma aç (disiplin yetkilisi). Öğrenci varlığı doğrulanır; aşama ihbar + audit. */
  async create(input: CreateInvestigationInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, DISCIPLINE_ADMIN)) {
      throw new ForbiddenException('Soruşturma açma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [stu] = await tx
        .select({ id: students.id })
        .from(students)
        .where(eq(students.id, input.studentId))
        .limit(1);
      if (!stu) {
        throw new NotFoundException('Öğrenci bulunamadı');
      }

      const [row] = await tx
        .insert(disciplinaryInvestigations)
        .values({
          tenantId: ctx.tenantId,
          studentId: input.studentId,
          complaint: input.complaint,
          stage: 'ihbar',
          investigatorUserId: input.investigatorUserId ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'investigation.create',
        resourceType: 'disciplinary_investigation',
        resourceId: row!.id,
        diff: {
          studentId: input.studentId,
          investigatorUserId: input.investigatorUserId ?? null,
        },
      });

      return row!;
    });
  }

  /**
   * Soruşturmayı güncelle (disiplin yetkilisi). Aşama geçiş kuralları:
   * "karar" için karar metni, "kapali" için karar no zorunlu (aynı istekte
   * gelebilir veya kayıtta var olabilir).
   */
  async update(id: string, input: UpdateInvestigationInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, DISCIPLINE_ADMIN)) {
      throw new ForbiddenException('Soruşturma güncelleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const existing = await this.mustFind(tx, id);

      // Aynı istekte gelen değer de sayılır; sadece kayıttakine bakmak "karar
      // metnini yaz + aşamayı ilerlet" tek adımını gereksiz yere bloklardı.
      const effectiveDecision = input.decision ?? existing.decision;
      const effectiveDecisionNo = input.decisionNo ?? existing.decisionNo;

      if (input.stage === 'karar' && isBlank(effectiveDecision)) {
        throw new ConflictException('Karar metni olmadan karar aşamasına geçilemez');
      }
      if (input.stage === 'kapali' && isBlank(effectiveDecisionNo)) {
        throw new ConflictException('Karar numarası olmadan soruşturma kapatılamaz');
      }

      const patch: Record<string, unknown> = {};
      if (input.stage !== undefined) patch.stage = input.stage;
      if (input.evidence !== undefined) patch.evidence = input.evidence;
      if (input.decision !== undefined) patch.decision = input.decision;
      if (input.decisionNo !== undefined) patch.decisionNo = input.decisionNo;
      if (input.decisionDate !== undefined) patch.decisionDate = input.decisionDate;
      if (input.investigatorUserId !== undefined) {
        patch.investigatorUserId = input.investigatorUserId ?? null;
      }

      if (Object.keys(patch).length === 0) {
        return existing;
      }

      const [row] = await tx
        .update(disciplinaryInvestigations)
        .set(patch)
        .where(eq(disciplinaryInvestigations.id, id))
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'investigation.update',
        resourceType: 'disciplinary_investigation',
        resourceId: id,
        diff: { fromStage: existing.stage, toStage: row!.stage },
      });

      return row!;
    });
  }

  /**
   * Karardan ceza üret (disiplin yetkilisi). Yalnızca karar/kapalı aşamasında; disiplin
   * cezası kaydı açılır ve soruşturmaya actionId ile bağlanır (tekrar 409).
   */
  async applyPenalty(id: string, input: ApplyPenaltyInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, DISCIPLINE_ADMIN)) {
      throw new ForbiddenException('Ceza uygulama yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const existing = await this.mustFind(tx, id);

      if (existing.stage !== 'karar' && existing.stage !== 'kapali') {
        throw new ConflictException('Ceza yalnızca karar veya kapalı aşamasında uygulanabilir');
      }
      if (existing.actionId) {
        throw new ConflictException('Bu soruşturma için ceza zaten uygulanmış');
      }

      const [action] = await tx
        .insert(disciplinaryActions)
        .values({
          tenantId: ctx.tenantId,
          studentId: existing.studentId,
          category: input.category,
          penalty: input.penalty,
          reason: existing.decision ?? existing.complaint,
          decisionNo: existing.decisionNo ?? null,
          decisionDate: existing.decisionDate ?? null,
          startsOn: input.startsOn ?? null,
          endsOn: input.endsOn ?? null,
          createdByUserId: ctx.actorUserId ?? null,
        })
        .returning();

      const [row] = await tx
        .update(disciplinaryInvestigations)
        .set({ actionId: action!.id })
        .where(eq(disciplinaryInvestigations.id, id))
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'investigation.apply_penalty',
        resourceType: 'disciplinary_investigation',
        resourceId: id,
        diff: {
          actionId: action!.id,
          studentId: existing.studentId,
          category: input.category,
          penalty: input.penalty,
        },
      });

      return { investigation: row!, action: action! };
    });
  }

  private async mustFind(
    tx: Tx,
    id: string,
  ): Promise<typeof disciplinaryInvestigations.$inferSelect> {
    const [row] = await tx
      .select()
      .from(disciplinaryInvestigations)
      .where(eq(disciplinaryInvestigations.id, id))
      .limit(1);
    if (!row) {
      throw new NotFoundException('Soruşturma bulunamadı');
    }
    return row;
  }
}
