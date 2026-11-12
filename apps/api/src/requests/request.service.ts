import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { requireOwnershipOrRole } from '../common/authz.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog } from '../db/schema.js';
import { students } from '../db/schema-academic.js';
import { requests } from '../db/schema-comm.js';
import { requireTenant, withTenant, type TenantStore } from '../db/tenant-context.js';
import { NotificationService } from '../notifications/notification.service.js';
import {
  applyRequestTransition,
  InvalidRequestTransitionError,
  type RequestStatus,
} from './request-status.js';

const STUDENT_ACTIONS = new Set(['iptal']);

function authorizeRequestAction(ctx: TenantStore, action: string, ownerUserId: string): void {
  const roles = new Set(ctx.roles ?? []);
  if (roles.has('oidb') || roles.has('sistem_yoneticisi')) {
    return;
  }
  if (STUDENT_ACTIONS.has(action) && ctx.actorUserId === ownerUserId) {
    return;
  }
  throw new ForbiddenException('Bu talep işlemi için yetkiniz yok');
}

/**
 * Yapılandırılmış talep (dilekçe) servisi (M8). Talep durum makinesiyle ilerler;
 * her karar audit'lenir ve öğrenciye bildirim gider. Serbest durum değişimi yok.
 */
@Injectable()
export class RequestService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    private readonly notifications: NotificationService,
  ) {}

  async create(
    studentId: string,
    type: string,
    payload: Record<string, unknown> | null,
  ): Promise<{ requestId: string; status: RequestStatus }> {
    const ctx = requireTenant();
    const requestId = await withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [stu] = await tx
        .select({ userId: students.userId })
        .from(students)
        .where(eq(students.id, studentId))
        .limit(1);
      if (!stu) {
        throw new NotFoundException('Öğrenci bulunamadı');
      }
      // Öğrenci kendi talebini oluşturur; ÖİDB de oluşturabilir.
      requireOwnershipOrRole(ctx, stu.userId, ['oidb', 'sistem_yoneticisi']);

      const [row] = await tx
        .insert(requests)
        .values({ tenantId: ctx.tenantId, studentId, type, payload })
        .returning({ id: requests.id });
      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'request.olusturuldu',
        resourceType: 'request',
        resourceId: row!.id,
        diff: { type },
      });
      return row!.id;
    });

    return { requestId, status: 'submitted' };
  }

  async transition(
    requestId: string,
    to: RequestStatus,
    reason?: string,
  ): Promise<{ status: RequestStatus }> {
    const ctx = requireTenant();

    const outcome = await withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [req] = await tx
        .select({ status: requests.status, studentId: requests.studentId })
        .from(requests)
        .where(eq(requests.id, requestId))
        .limit(1);
      if (!req) {
        throw new NotFoundException('Talep bulunamadı');
      }
      const [stu] = await tx
        .select({ userId: students.userId })
        .from(students)
        .where(eq(students.id, req.studentId))
        .limit(1);

      let transition;
      try {
        transition = applyRequestTransition(req.status as RequestStatus, to);
      } catch (e) {
        if (e instanceof InvalidRequestTransitionError) {
          throw new ConflictException(e.message);
        }
        throw e;
      }
      authorizeRequestAction(ctx, transition.action, stu?.userId ?? '');

      const isStaffDecision = !STUDENT_ACTIONS.has(transition.action);
      await tx
        .update(requests)
        .set({
          status: to,
          reviewerUserId: isStaffDecision ? (ctx.actorUserId ?? null) : null,
          decisionReason: reason ?? null,
        })
        .where(eq(requests.id, requestId));

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: `request.${transition.action}`,
        resourceType: 'request',
        resourceId: requestId,
        diff: { status: { from: req.status, to }, reason: reason ?? null },
      });

      return { studentUserId: stu?.userId, action: transition.action };
    });

    // Öğrenciye karar bildirimi.
    if (outcome.studentUserId) {
      await this.notifications.notify({
        tenantId: ctx.tenantId,
        userId: outcome.studentUserId,
        type: 'request',
        title: 'Talebiniz güncellendi',
        body: `Talep durumu: ${to}`,
      });
    }

    return { status: to };
  }
}
