import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { students } from '../db/schema-academic.js';
import {
  approvalActions,
  approvalFlowSteps,
  approvalFlows,
  approvalInstances,
} from '../db/schema-approval.js';
import { auditLog, users } from '../db/schema.js';
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

export interface CreateFlowInput {
  key: string;
  name: string;
  description?: string | undefined;
}

export interface CreateStepInput {
  stepNo: number;
  unit: string;
  roleKey?: string | null | undefined;
  name: string;
  slaDays?: number | null | undefined;
}

export interface StartInstanceInput {
  flowKey: string;
  subjectType: string;
  subjectId: string;
  studentId?: string | undefined;
}

export interface ActionInput {
  action: 'onay' | 'red' | 'iade' | 'not';
  note?: string | undefined;
}

/** Instance oluşturulduğundan bu yana geçen tam gün (SLA ölçümü). */
const elapsedDaysSql = sql<number>`floor(extract(epoch from (now() - ${approvalInstances.createdAt})) / 86400)::int`;

/**
 * Çok-birimli onay motoru (0020). Tenant-kapsamlı (RLS); akış/adım tanımı ve
 * kuyruk personel yetkisi ister. Instance akışın adımlarında ilerler:
 * onay → sonraki adım (son adımda onaylandi), red → reddedildi, iade → önceki
 * adım, not → yalnızca kayıt.
 */
@Injectable()
export class ApprovalService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Akışlar + adım sayısı, en yeni önce. */
  async flows(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: approvalFlows.id,
          key: approvalFlows.key,
          name: approvalFlows.name,
          description: approvalFlows.description,
          active: approvalFlows.active,
          createdAt: approvalFlows.createdAt,
          stepCount: sql<number>`count(${approvalFlowSteps.id})::int`,
        })
        .from(approvalFlows)
        .leftJoin(approvalFlowSteps, eq(approvalFlowSteps.flowId, approvalFlows.id))
        .groupBy(approvalFlows.id)
        .orderBy(desc(approvalFlows.createdAt));
      return { items };
    });
  }

  /** Akış tanımla (personel). Aynı key varsa 409. */
  async createFlow(input: CreateFlowInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Onay akışı tanımlama yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: approvalFlows.id })
        .from(approvalFlows)
        .where(eq(approvalFlows.key, input.key))
        .limit(1);
      if (existing) {
        throw new ConflictException('Bu anahtarla bir onay akışı zaten var');
      }

      const [row] = await tx
        .insert(approvalFlows)
        .values({
          tenantId: ctx.tenantId,
          key: input.key,
          name: input.name,
          description: input.description ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'approval.flow.create',
        resourceType: 'approval_flow',
        resourceId: row!.id,
        diff: { key: input.key, name: input.name },
      });

      return row!;
    });
  }

  /** Akışın sıralı adımları. */
  async steps(flowId: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const flow = await this.findFlowById(tx, flowId);
      const items = await tx
        .select({
          id: approvalFlowSteps.id,
          stepNo: approvalFlowSteps.stepNo,
          unit: approvalFlowSteps.unit,
          roleKey: approvalFlowSteps.roleKey,
          name: approvalFlowSteps.name,
          slaDays: approvalFlowSteps.slaDays,
          createdAt: approvalFlowSteps.createdAt,
        })
        .from(approvalFlowSteps)
        .where(eq(approvalFlowSteps.flowId, flowId))
        .orderBy(asc(approvalFlowSteps.stepNo));
      return { flow, items };
    });
  }

  /** Akışa adım ekle (personel). Aynı flow+stepNo varsa 409. */
  async createStep(flowId: string, input: CreateStepInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Onay adımı tanımlama yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      await this.findFlowById(tx, flowId);

      const [existing] = await tx
        .select({ id: approvalFlowSteps.id })
        .from(approvalFlowSteps)
        .where(
          and(eq(approvalFlowSteps.flowId, flowId), eq(approvalFlowSteps.stepNo, input.stepNo)),
        )
        .limit(1);
      if (existing) {
        throw new ConflictException('Bu akışta aynı sıra numaralı adım zaten var');
      }

      const [row] = await tx
        .insert(approvalFlowSteps)
        .values({
          tenantId: ctx.tenantId,
          flowId,
          stepNo: input.stepNo,
          unit: input.unit,
          roleKey: input.roleKey ?? null,
          name: input.name,
          slaDays: input.slaDays ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'approval.step.create',
        resourceType: 'approval_flow_step',
        resourceId: row!.id,
        diff: { flowId, stepNo: input.stepNo, unit: input.unit },
      });

      return row!;
    });
  }

  /**
   * Akışı başlat. flowKey ile akış bulunur (yoksa 404). Aynı subjectType+subjectId
   * için devam eden instance varsa yenisi açılmaz, mevcut dönülür (idempotent).
   */
  async startInstance(input: StartInstanceInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    // Serbest akış başlatma yalnızca personelde. (Öğrenci talebine bağlı akışlar
    // student-request tarafında, sahiplik doğrulanmış şekilde açılır.)
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Onay akışı başlatma yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [flow] = await tx
        .select({ id: approvalFlows.id })
        .from(approvalFlows)
        .where(eq(approvalFlows.key, input.flowKey))
        .limit(1);
      if (!flow) {
        throw new NotFoundException('Onay akışı bulunamadı');
      }

      const [running] = await tx
        .select()
        .from(approvalInstances)
        .where(
          and(
            eq(approvalInstances.subjectType, input.subjectType),
            eq(approvalInstances.subjectId, input.subjectId),
            eq(approvalInstances.status, 'devam'),
          ),
        )
        .limit(1);
      if (running) {
        return running;
      }

      const [row] = await tx
        .insert(approvalInstances)
        .values({
          tenantId: ctx.tenantId,
          flowId: flow.id,
          subjectType: input.subjectType,
          subjectId: input.subjectId,
          studentId: input.studentId ?? null,
          currentStep: 1,
          status: 'devam',
          startedByUserId: ctx.actorUserId ?? null,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'approval.instance.start',
        resourceType: 'approval_instance',
        resourceId: row!.id,
        diff: { flowKey: input.flowKey, subjectType: input.subjectType, subjectId: input.subjectId },
      });

      return row!;
    });
  }

  /** Instance kuyruğu (personel); ?status,?subjectType; akış/adım adı + öğrenci no join. */
  async instances(status?: string, subjectType?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Onay kuyruğuna erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const conds = [];
      if (status) conds.push(eq(approvalInstances.status, status));
      if (subjectType) conds.push(eq(approvalInstances.subjectType, subjectType));
      const items = await tx
        .select({
          id: approvalInstances.id,
          flowId: approvalInstances.flowId,
          flowKey: approvalFlows.key,
          flowName: approvalFlows.name,
          subjectType: approvalInstances.subjectType,
          subjectId: approvalInstances.subjectId,
          studentId: approvalInstances.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          currentStep: approvalInstances.currentStep,
          currentStepName: approvalFlowSteps.name,
          currentStepUnit: approvalFlowSteps.unit,
          status: approvalInstances.status,
          createdAt: approvalInstances.createdAt,
          closedAt: approvalInstances.closedAt,
        })
        .from(approvalInstances)
        .innerJoin(approvalFlows, eq(approvalInstances.flowId, approvalFlows.id))
        .leftJoin(
          approvalFlowSteps,
          and(
            eq(approvalFlowSteps.flowId, approvalInstances.flowId),
            eq(approvalFlowSteps.stepNo, approvalInstances.currentStep),
          ),
        )
        .leftJoin(students, eq(approvalInstances.studentId, students.id))
        .leftJoin(users, eq(students.userId, users.id))
        .where(conds.length ? and(...conds) : undefined)
        .orderBy(desc(approvalInstances.createdAt));
      return { items };
    });
  }

  /** Instance tam detay: akış + sıralı adımlar + aksiyon geçmişi. */
  async instanceDetail(id: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [instance] = await tx
        .select({
          id: approvalInstances.id,
          flowId: approvalInstances.flowId,
          subjectType: approvalInstances.subjectType,
          subjectId: approvalInstances.subjectId,
          studentId: approvalInstances.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          currentStep: approvalInstances.currentStep,
          status: approvalInstances.status,
          startedByUserId: approvalInstances.startedByUserId,
          createdAt: approvalInstances.createdAt,
          closedAt: approvalInstances.closedAt,
        })
        .from(approvalInstances)
        .leftJoin(students, eq(approvalInstances.studentId, students.id))
        .leftJoin(users, eq(students.userId, users.id))
        .where(eq(approvalInstances.id, id))
        .limit(1);
      if (!instance) {
        throw new NotFoundException('Onay kaydı bulunamadı');
      }

      // Yetki: personel her kaydı görür; öğrenci YALNIZCA kendi akışını görebilir.
      const staff = isStaff(ctx.roles ?? []);
      if (!staff) {
        const [own] = await tx
          .select({ id: students.id })
          .from(students)
          .where(eq(students.userId, ctx.actorUserId ?? ''))
          .limit(1);
        if (!own || own.id !== instance.studentId) {
          throw new ForbiddenException('Bu onay kaydına erişim yetkiniz yok');
        }
      }

      const [flow] = await tx
        .select({
          id: approvalFlows.id,
          key: approvalFlows.key,
          name: approvalFlows.name,
          description: approvalFlows.description,
          active: approvalFlows.active,
        })
        .from(approvalFlows)
        .where(eq(approvalFlows.id, instance.flowId))
        .limit(1);

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
          actedByEmail: users.email,
          createdAt: approvalActions.createdAt,
        })
        .from(approvalActions)
        .leftJoin(users, eq(approvalActions.actedByUserId, users.id))
        .where(eq(approvalActions.instanceId, id))
        .orderBy(asc(approvalActions.createdAt));

      // Öğrenciye iç işleyiş notu ve personel e-postası sızdırılmaz.
      const safeActions = staff
        ? actions
        : actions.map(({ note: _note, actedByEmail: _email, actedByUserId: _uid, ...rest }) => rest);

      return { instance, flow: flow ?? null, steps, actions: safeActions };
    });
  }

  /**
   * Adım aksiyonu (personel). Aksiyon o anki adıma yazılır; sonra:
   * onay → sonraki adım / son adımsa onaylandi+closedAt,
   * red → reddedildi+closedAt, iade → önceki adım, not → durum değişmez.
   */
  async act(id: string, input: ActionInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Onay aksiyonu yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [instance] = await tx
        .select()
        .from(approvalInstances)
        .where(eq(approvalInstances.id, id))
        .limit(1);
      if (!instance) {
        throw new NotFoundException('Onay kaydı bulunamadı');
      }
      if (instance.status !== 'devam') {
        throw new ConflictException('Onay akışı kapanmış, aksiyon alınamaz');
      }

      const steps = await tx
        .select({
          stepNo: approvalFlowSteps.stepNo,
          unit: approvalFlowSteps.unit,
          roleKey: approvalFlowSteps.roleKey,
        })
        .from(approvalFlowSteps)
        .where(eq(approvalFlowSteps.flowId, instance.flowId))
        .orderBy(asc(approvalFlowSteps.stepNo));

      const currentStep = instance.currentStep;
      const current = steps.find((s) => s.stepNo === currentStep);
      const next = steps.find((s) => s.stepNo > currentStep);
      const prev = [...steps].reverse().find((s) => s.stepNo < currentStep);

      // Adım rol paritesi: adıma rol tanımlıysa yalnızca o role sahip aktör karara
      // bağlayabilir. Aksi halde çok-birimli zincir anlamsızlaşır (herkes her adımı
      // onaylayabilirdi). Rol tanımsız adım = tüm personele açık.
      if (current?.roleKey && !(ctx.roles ?? []).includes(current.roleKey)) {
        throw new ForbiddenException(
          `Bu adımı karara bağlama yetkiniz yok (gereken rol: ${current.roleKey})`,
        );
      }

      const [action] = await tx
        .insert(approvalActions)
        .values({
          tenantId: ctx.tenantId,
          instanceId: id,
          stepNo: currentStep,
          unit: current?.unit ?? null,
          action: input.action,
          note: input.note ?? null,
          actedByUserId: ctx.actorUserId ?? null,
        })
        .returning();

      let patch: { currentStep?: number; status?: string; closedAt?: Date } | null = null;
      if (input.action === 'onay') {
        // Sonraki adım yoksa son adımdayız → akış onaylandı.
        patch = next ? { currentStep: next.stepNo } : { status: 'onaylandi', closedAt: new Date() };
      } else if (input.action === 'red') {
        patch = { status: 'reddedildi', closedAt: new Date() };
      } else if (input.action === 'iade') {
        patch = { currentStep: prev?.stepNo ?? Math.max(1, currentStep - 1) };
      }

      let row = instance;
      if (patch) {
        const [updated] = await tx
          .update(approvalInstances)
          .set(patch)
          .where(eq(approvalInstances.id, id))
          .returning();
        row = updated!;
      }

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'approval.instance.action',
        resourceType: 'approval_instance',
        resourceId: id,
        diff: {
          action: input.action,
          fromStep: currentStep,
          toStep: row.currentStep,
          status: row.status,
        },
      });

      return { instance: row, action: action! };
    });
  }

  /**
   * Aktörün kuyruğu: devam eden ve o anki adımı aktörün rollerine düşen kayıtlar.
   * Adımın roleKey'i null ise adım rol-bağımsızdır → tüm personel görür.
   */
  async myQueue(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    const roles = ctx.roles ?? [];
    if (!isStaff(roles)) {
      throw new ForbiddenException('Onay kuyruğuna erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const roleMatch = roles.length
        ? or(isNull(approvalFlowSteps.roleKey), inArray(approvalFlowSteps.roleKey, [...roles]))
        : isNull(approvalFlowSteps.roleKey);

      const rows = await tx
        .select({
          id: approvalInstances.id,
          flowKey: approvalFlows.key,
          flowName: approvalFlows.name,
          subjectType: approvalInstances.subjectType,
          subjectId: approvalInstances.subjectId,
          studentId: approvalInstances.studentId,
          studentNo: students.studentNo,
          studentEmail: users.email,
          currentStep: approvalInstances.currentStep,
          stepName: approvalFlowSteps.name,
          unit: approvalFlowSteps.unit,
          roleKey: approvalFlowSteps.roleKey,
          slaDays: approvalFlowSteps.slaDays,
          elapsedDays: elapsedDaysSql,
          createdAt: approvalInstances.createdAt,
        })
        .from(approvalInstances)
        .innerJoin(approvalFlows, eq(approvalInstances.flowId, approvalFlows.id))
        .innerJoin(
          approvalFlowSteps,
          and(
            eq(approvalFlowSteps.flowId, approvalInstances.flowId),
            eq(approvalFlowSteps.stepNo, approvalInstances.currentStep),
          ),
        )
        .leftJoin(students, eq(approvalInstances.studentId, students.id))
        .leftJoin(users, eq(students.userId, users.id))
        .where(and(eq(approvalInstances.status, 'devam'), roleMatch))
        .orderBy(asc(approvalInstances.createdAt));

      const items = rows.map((r) => ({
        ...r,
        slaBreached: r.slaDays !== null && r.elapsedDays > r.slaDays,
      }));
      return { items };
    });
  }

  private async findFlowById(
    tx: Parameters<Parameters<DbHandle['db']['transaction']>[0]>[0],
    flowId: string,
  ): Promise<Record<string, unknown>> {
    const [flow] = await tx
      .select({
        id: approvalFlows.id,
        key: approvalFlows.key,
        name: approvalFlows.name,
        description: approvalFlows.description,
        active: approvalFlows.active,
      })
      .from(approvalFlows)
      .where(eq(approvalFlows.id, flowId))
      .limit(1);
    if (!flow) {
      throw new NotFoundException('Onay akışı bulunamadı');
    }
    return flow;
  }
}
