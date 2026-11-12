import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { auditLog, users } from '../db/schema.js';
import { messages } from '../db/schema-backoffice3.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';

// Alıcı listesi için personel yetkisi (students.service STAFF ile bire bir).
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

export interface CreateMessageInput {
  toUserId: string;
  subject: string;
  body: string;
}

/**
 * Mesajlaşma servisi (0016 backoffice). Tenant-kapsamlı (RLS); aktör (ctx.actorUserId)
 * gelen/giden kutusunu görür, alıcı okundu işaretler, personel alıcı listesini çeker.
 */
@Injectable()
export class MessagingService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Aktöre gelen mesajlar; gönderen email join. */
  async inbox(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    const me = ctx.actorUserId;
    if (!me) {
      throw new ForbiddenException('Oturum bulunamadı');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: messages.id,
          fromUserId: messages.fromUserId,
          fromEmail: users.email,
          toUserId: messages.toUserId,
          subject: messages.subject,
          body: messages.body,
          readAt: messages.readAt,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .innerJoin(users, eq(messages.fromUserId, users.id))
        .where(eq(messages.toUserId, me))
        .orderBy(desc(messages.createdAt));
      return { items };
    });
  }

  /** Aktörün gönderdiği mesajlar; alıcı email join. */
  async sent(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    const me = ctx.actorUserId;
    if (!me) {
      throw new ForbiddenException('Oturum bulunamadı');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({
          id: messages.id,
          toUserId: messages.toUserId,
          toEmail: users.email,
          fromUserId: messages.fromUserId,
          subject: messages.subject,
          body: messages.body,
          readAt: messages.readAt,
          createdAt: messages.createdAt,
        })
        .from(messages)
        .innerJoin(users, eq(messages.toUserId, users.id))
        .where(eq(messages.fromUserId, me))
        .orderBy(desc(messages.createdAt));
      return { items };
    });
  }

  /** Tenant kullanıcıları (userId+email); yalnız personel/ADMIN. */
  async recipients(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Alıcı listesine erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select({ userId: users.id, email: users.email })
        .from(users)
        .orderBy(users.email);
      return { items };
    });
  }

  /** Mesaj gönder (fromUserId=aktör). Alıcı varlığı doğrulanır + audit. */
  async create(input: CreateMessageInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    const me = ctx.actorUserId;
    if (!me) {
      throw new ForbiddenException('Oturum bulunamadı');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [recipient] = await tx
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.toUserId))
        .limit(1);
      if (!recipient) {
        throw new NotFoundException('Alıcı bulunamadı');
      }

      const [row] = await tx
        .insert(messages)
        .values({
          tenantId: ctx.tenantId,
          fromUserId: me,
          toUserId: input.toUserId,
          subject: input.subject,
          body: input.body,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: me,
        action: 'messaging.create',
        resourceType: 'message',
        resourceId: row!.id,
        diff: {
          toUserId: input.toUserId,
          subject: input.subject,
        },
      });

      return row!;
    });
  }

  /** Mesajı okundu işaretle (yalnız alıcı). */
  async markRead(id: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    const me = ctx.actorUserId;
    if (!me) {
      throw new ForbiddenException('Oturum bulunamadı');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .update(messages)
        .set({ readAt: new Date() })
        .where(and(eq(messages.id, id), eq(messages.toUserId, me)))
        .returning();
      if (!row) {
        throw new NotFoundException('Mesaj bulunamadı');
      }
      return row;
    });
  }
}
