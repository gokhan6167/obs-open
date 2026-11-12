import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { students } from '../db/schema-academic.js';
import {
  approvalActions,
  approvalFlows,
  approvalFlowSteps,
  approvalInstances,
} from '../db/schema-approval.js';
import { disciplinaryActions } from '../db/schema-discipline.js';
import { studentRequests } from '../db/schema-services.js';
import { auditLog, users } from '../db/schema.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { STUDENT_ADMIN, hasRole } from '../common/roles.js';

type Tx = Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0];

// Personel okuma/karar yetkisi (discipline.service STAFF ile bire bir).
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

export interface CreateStudentRequestInput {
  kind: string;
  reason?: string | undefined;
  detail?: Record<string, unknown> | undefined;
}

export interface DecideStudentRequestInput {
  status: string;
  decisionNote?: string | undefined;
}

/**
 * Öğrenci self-servis talepleri (0019). Tenant-kapsamlı (RLS). Öğrenci kendi
 * kaydını oluşturur/görür; personel kuyruğu görür ve karar verir.
 */
@Injectable()
export class StudentRequestService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Aktör öğrencinin talepleri. */
  async my(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) return [];
      return tx
        .select({
          id: studentRequests.id,
          kind: studentRequests.kind,
          reason: studentRequests.reason,
          detail: studentRequests.detail,
          status: studentRequests.status,
          decisionNote: studentRequests.decisionNote,
          createdAt: studentRequests.createdAt,
        })
        .from(studentRequests)
        .where(eq(studentRequests.studentId, sid))
        .orderBy(desc(studentRequests.createdAt));
    });
  }

  /** Öğrenci self-servis talep oluştur (aktör öğrenci kendi kaydını açar). */
  async create(input: CreateStudentRequestInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) {
        throw new ForbiddenException('Talep oluşturmak için öğrenci kaydınız bulunmuyor');
      }
      const [row] = await tx
        .insert(studentRequests)
        .values({
          tenantId: ctx.tenantId,
          studentId: sid,
          kind: input.kind,
          reason: input.reason ?? null,
          detail: input.detail ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'student_request.create',
        resourceType: 'student_request',
        resourceId: row!.id,
        diff: { studentId: sid, kind: input.kind },
      });

      await this.startApproval(tx, ctx.tenantId, row!.id, input.kind, sid, ctx.actorUserId);

      return row!;
    });
  }

  /** Talep kuyruğu (personel); opsiyonel ?kind/?status filtresi, öğrenci no/ad join. */
  async list(kind?: string, status?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Talep kuyruğuna erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const conds = [];
      if (kind) conds.push(eq(studentRequests.kind, kind));
      if (status) conds.push(eq(studentRequests.status, status));
      const where = conds.length ? and(...conds) : undefined;
      const items = await tx
        .select({
          id: studentRequests.id,
          studentId: studentRequests.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          kind: studentRequests.kind,
          reason: studentRequests.reason,
          detail: studentRequests.detail,
          status: studentRequests.status,
          decisionNote: studentRequests.decisionNote,
          createdAt: studentRequests.createdAt,
        })
        .from(studentRequests)
        .innerJoin(students, eq(studentRequests.studentId, students.id))
        .innerJoin(users, eq(students.userId, users.id))
        .where(where)
        .orderBy(desc(studentRequests.createdAt));
      return { items };
    });
  }

  /** Talep kararı (personel). Status/decisionNote güncellenir + audit. */
  async decide(id: string, input: DecideStudentRequestInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, STUDENT_ADMIN)) {
      throw new ForbiddenException('Talep kararı verme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: studentRequests.id })
        .from(studentRequests)
        .where(eq(studentRequests.id, id))
        .limit(1);
      if (!existing) {
        throw new NotFoundException('Talep bulunamadı');
      }

      const [row] = await tx
        .update(studentRequests)
        .set({
          status: input.status,
          decisionNote: input.decisionNote ?? null,
        })
        .where(eq(studentRequests.id, id))
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'student_request.decide',
        resourceType: 'student_request',
        resourceId: id,
        diff: { status: input.status },
      });

      return row!;
    });
  }

  /** Aktör öğrencinin disiplin cezası kayıtları (kendi kaydı). */
  async myDiscipline(): Promise<Record<string, unknown>[]> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const sid = await this.myStudentId(tx, ctx.actorUserId);
      if (!sid) return [];
      return tx
        .select({
          id: disciplinaryActions.id,
          category: disciplinaryActions.category,
          penalty: disciplinaryActions.penalty,
          reason: disciplinaryActions.reason,
          decisionNo: disciplinaryActions.decisionNo,
          decisionDate: disciplinaryActions.decisionDate,
          startsOn: disciplinaryActions.startsOn,
          endsOn: disciplinaryActions.endsOn,
          status: disciplinaryActions.status,
          createdAt: disciplinaryActions.createdAt,
        })
        .from(disciplinaryActions)
        .where(eq(disciplinaryActions.studentId, sid))
        .orderBy(desc(disciplinaryActions.createdAt));
    });
  }

  /**
   * Talebe bağlı onay süreci (instance + akış adımları + aksiyonlar).
   * Akış tanımlı değilse veya süreç başlatılmadıysa null döner.
   */
  async approval(id: string): Promise<Record<string, unknown> | null> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [req] = await tx
        .select({ id: studentRequests.id, studentId: studentRequests.studentId })
        .from(studentRequests)
        .where(eq(studentRequests.id, id))
        .limit(1);
      if (!req) {
        throw new NotFoundException('Talep bulunamadı');
      }
      if (!isStaff(ctx.roles ?? [])) {
        const sid = await this.myStudentId(tx, ctx.actorUserId);
        if (!sid || sid !== req.studentId) {
          throw new ForbiddenException('Bu talebin onay sürecine erişim yetkiniz yok');
        }
      }

      const [instance] = await tx
        .select({
          id: approvalInstances.id,
          flowId: approvalInstances.flowId,
          flowKey: approvalFlows.key,
          flowName: approvalFlows.name,
          subjectType: approvalInstances.subjectType,
          subjectId: approvalInstances.subjectId,
          studentId: approvalInstances.studentId,
          currentStep: approvalInstances.currentStep,
          status: approvalInstances.status,
          startedByUserId: approvalInstances.startedByUserId,
          createdAt: approvalInstances.createdAt,
          closedAt: approvalInstances.closedAt,
        })
        .from(approvalInstances)
        .innerJoin(approvalFlows, eq(approvalInstances.flowId, approvalFlows.id))
        .where(
          and(
            eq(approvalInstances.subjectType, 'student_request'),
            eq(approvalInstances.subjectId, id),
          ),
        )
        .orderBy(desc(approvalInstances.createdAt))
        .limit(1);
      if (!instance) return null;

      const steps = await tx
        .select({
          id: approvalFlowSteps.id,
          stepNo: approvalFlowSteps.stepNo,
          unit: approvalFlowSteps.unit,
          roleKey: approvalFlowSteps.roleKey,
          name: approvalFlowSteps.name,
          slaDays: approvalFlowSteps.slaDays,
        })
        .from(approvalFlowSteps)
        .where(eq(approvalFlowSteps.flowId, instance.flowId))
        .orderBy(asc(approvalFlowSteps.stepNo));

      const actions = await tx
        .select({
          id: approvalActions.id,
          stepNo: approvalActions.stepNo,
          unit: approvalActions.unit,
          action: approvalActions.action,
          note: approvalActions.note,
          actedByUserId: approvalActions.actedByUserId,
          createdAt: approvalActions.createdAt,
        })
        .from(approvalActions)
        .where(eq(approvalActions.instanceId, instance.id))
        .orderBy(asc(approvalActions.createdAt));

      return { instance, steps, actions };
    });
  }

  /**
   * Talep türüne karşılık gelen akış ("sr_" + kind) varsa onay süreci başlatır.
   * Akış yoksa/pasifse sessizce geçilir (mevcut talep davranışı bozulmaz).
   */
  private async startApproval(
    tx: Tx,
    tenantId: string,
    requestId: string,
    kind: string,
    studentId: string,
    actorUserId?: string,
  ): Promise<void> {
    const [flow] = await tx
      .select({ id: approvalFlows.id })
      .from(approvalFlows)
      .where(and(eq(approvalFlows.key, `sr_${kind}`), eq(approvalFlows.active, true)))
      .limit(1);
    if (!flow) return;

    await tx.insert(approvalInstances).values({
      tenantId,
      flowId: flow.id,
      subjectType: 'student_request',
      subjectId: requestId,
      studentId,
      startedByUserId: actorUserId ?? null,
    });
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
