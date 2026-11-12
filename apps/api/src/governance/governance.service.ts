import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog } from '../db/schema.js';
import { governanceDecisions, governanceSessions } from '../db/schema-portal.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { GOVERNANCE_ADMIN, hasRole } from '../common/roles.js';

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

export interface CreateSessionInput {
  sessionNo: string;
  date: string;
}

export interface CreateDecisionInput {
  decisionNo: string;
  subject: string;
  outcome: string;
  reason?: string | undefined;
  linkedRequestId?: string | undefined;
  linkedDoubleMajorId?: string | undefined;
}

/**
 * YKK (fakülte yönetim kurulu) servisi. Tenant-kapsamlı (RLS), personel
 * yetkisi in-service kontrol edilir; yazma işlemleri audit'lenir.
 */
@Injectable()
export class GovernanceService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** YKK toplantıları listesi (en yeni önce). */
  async listSessions(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Kurul kayıtlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: governanceSessions.id,
          sessionNo: governanceSessions.sessionNo,
          date: governanceSessions.date,
          status: governanceSessions.status,
          createdAt: governanceSessions.createdAt,
        })
        .from(governanceSessions)
        .orderBy(desc(governanceSessions.createdAt));
      return { items };
    });
  }

  /** YKK toplantısı oluştur (personel) + audit. */
  async createSession(input: CreateSessionInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, GOVERNANCE_ADMIN)) {
      throw new ForbiddenException('Kurul toplantısı oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .insert(governanceSessions)
        .values({
          tenantId: ctx.tenantId,
          sessionNo: input.sessionNo,
          date: input.date,
          createdByUserId: ctx.actorUserId ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'governance.session.create',
        resourceType: 'governance_session',
        resourceId: row!.id,
        diff: {
          sessionNo: input.sessionNo,
          date: input.date,
        },
      });

      return row!;
    });
  }

  /** Toplantı kararları listesi. Toplantı varlığı doğrulanır. */
  async listDecisions(sessionId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Kurul kararlarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [session] = await tx
        .select({ id: governanceSessions.id })
        .from(governanceSessions)
        .where(eq(governanceSessions.id, sessionId))
        .limit(1);
      if (!session) {
        throw new NotFoundException('Kurul toplantısı bulunamadı');
      }

      const items = await tx
        .select({
          id: governanceDecisions.id,
          sessionId: governanceDecisions.sessionId,
          decisionNo: governanceDecisions.decisionNo,
          subject: governanceDecisions.subject,
          outcome: governanceDecisions.outcome,
          reason: governanceDecisions.reason,
          linkedRequestId: governanceDecisions.linkedRequestId,
          linkedDoubleMajorId: governanceDecisions.linkedDoubleMajorId,
          createdAt: governanceDecisions.createdAt,
        })
        .from(governanceDecisions)
        .where(eq(governanceDecisions.sessionId, sessionId))
        .orderBy(desc(governanceDecisions.createdAt));
      return { items };
    });
  }

  /** Toplantıya karar ekle (personel). Toplantı varlığı doğrulanır + audit. */
  async createDecision(
    sessionId: string,
    input: CreateDecisionInput,
  ): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, GOVERNANCE_ADMIN)) {
      throw new ForbiddenException('Kurul kararı oluşturma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [session] = await tx
        .select({ id: governanceSessions.id })
        .from(governanceSessions)
        .where(eq(governanceSessions.id, sessionId))
        .limit(1);
      if (!session) {
        throw new NotFoundException('Kurul toplantısı bulunamadı');
      }

      const [row] = await tx
        .insert(governanceDecisions)
        .values({
          tenantId: ctx.tenantId,
          sessionId,
          decisionNo: input.decisionNo,
          subject: input.subject,
          outcome: input.outcome,
          reason: input.reason ?? null,
          linkedRequestId: input.linkedRequestId ?? null,
          linkedDoubleMajorId: input.linkedDoubleMajorId ?? null,
          createdByUserId: ctx.actorUserId ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'governance.decision.create',
        resourceType: 'governance_decision',
        resourceId: row!.id,
        diff: {
          sessionId,
          decisionNo: input.decisionNo,
          subject: input.subject,
          outcome: input.outcome,
        },
      });

      return row!;
    });
  }
}
