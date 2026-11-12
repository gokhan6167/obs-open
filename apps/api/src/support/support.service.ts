import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog, users } from '../db/schema.js';
import { supportTickets } from '../db/schema-services.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';
import { CORE_ADMIN, hasRole } from '../common/roles.js';

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

export interface CreateSupportInput {
  category: string;
  subject: string;
  body: string;
  priority?: string | undefined;
}

export interface UpdateSupportInput {
  status: string;
  resolution?: string | undefined;
  assignedUnit?: string | undefined;
}

/**
 * Çözüm merkezi (0019). Tenant-kapsamlı (RLS). Öğrenci/personel kendi talebini
 * oluşturur; personel tüm kuyruğu görür ve karar verir. Kayıt işlemleri audit'lenir.
 */
@Injectable()
export class SupportService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Aktörün kendi destek talepleri. */
  async my(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!ctx.actorUserId) {
      throw new ForbiddenException('Kimlik bağlamı yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: supportTickets.id,
          category: supportTickets.category,
          subject: supportTickets.subject,
          body: supportTickets.body,
          priority: supportTickets.priority,
          assignedUnit: supportTickets.assignedUnit,
          status: supportTickets.status,
          resolution: supportTickets.resolution,
          createdAt: supportTickets.createdAt,
          resolvedAt: supportTickets.resolvedAt,
        })
        .from(supportTickets)
        .where(eq(supportTickets.userId, ctx.actorUserId!))
        .orderBy(desc(supportTickets.createdAt));
      return { items };
    });
  }

  /** Destek talebi oluştur (aktör kullanıcı). */
  async create(input: CreateSupportInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!ctx.actorUserId) {
      throw new ForbiddenException('Kimlik bağlamı yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .insert(supportTickets)
        .values({
          tenantId: ctx.tenantId,
          userId: ctx.actorUserId!,
          category: input.category,
          subject: input.subject,
          body: input.body,
          priority: input.priority ?? 'normal',
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'support.create',
        resourceType: 'support_ticket',
        resourceId: row!.id,
        diff: {
          category: input.category,
          subject: input.subject,
          priority: input.priority ?? 'normal',
        },
      });

      return row!;
    });
  }

  /** Tüm destek kuyruğu (personel); opsiyonel status filtresi, açan email join. */
  async list(status?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Destek kuyruğuna erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const where = status
        ? eq(supportTickets.status, status)
        : undefined;
      const items = await tx
        .select({
          id: supportTickets.id,
          userId: supportTickets.userId,
          userEmail: users.email,
          category: supportTickets.category,
          subject: supportTickets.subject,
          body: supportTickets.body,
          priority: supportTickets.priority,
          assignedUnit: supportTickets.assignedUnit,
          status: supportTickets.status,
          resolution: supportTickets.resolution,
          createdAt: supportTickets.createdAt,
          resolvedAt: supportTickets.resolvedAt,
        })
        .from(supportTickets)
        .innerJoin(users, eq(supportTickets.userId, users.id))
        .where(where)
        .orderBy(desc(supportTickets.createdAt));
      return { items };
    });
  }

  /** Destek talebi güncelle (personel). Çözüldü ise resolvedAt=now + audit. */
  async update(id: string, input: UpdateSupportInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!hasRole(ctx.roles, CORE_ADMIN)) {
      throw new ForbiddenException('Destek talebi güncelleme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [existing] = await tx
        .select({ id: supportTickets.id })
        .from(supportTickets)
        .where(eq(supportTickets.id, id))
        .limit(1);
      if (!existing) {
        throw new NotFoundException('Destek talebi bulunamadı');
      }

      const patch: Record<string, unknown> = {
        status: input.status,
        resolution: input.resolution ?? null,
        assignedUnit: input.assignedUnit ?? null,
        resolvedAt: input.status === 'cozuldu' ? new Date() : null,
      };

      const [row] = await tx
        .update(supportTickets)
        .set(patch)
        .where(and(eq(supportTickets.id, id), eq(supportTickets.tenantId, ctx.tenantId)))
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'support.update',
        resourceType: 'support_ticket',
        resourceId: id,
        diff: {
          status: input.status,
          resolution: input.resolution ?? null,
          assignedUnit: input.assignedUnit ?? null,
        },
      });

      return row!;
    });
  }
}
