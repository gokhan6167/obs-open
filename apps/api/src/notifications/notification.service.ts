import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { notificationPrefs, notifications } from '../db/schema-comm.js';
import { withTenant } from '../db/tenant-context.js';
import { NOTIFICATION_CHANNELS, type NotificationChannel } from './channels.js';

export interface NotifyInput {
  tenantId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
}

/**
 * Bildirim servisi (M8). Her bildirim uygulama içi (DB) yazılır; ayrıca kullanıcı
 * tercihine göre etkin dış kanallara (email/sms/push mock) gönderilir. Domain
 * event'leri (GradePublished, RequestDecided...) bu servisi çağırır.
 */
@Injectable()
export class NotificationService {
  constructor(
    @Inject(DB) private readonly handle: DbHandle,
    @Inject(NOTIFICATION_CHANNELS) private readonly channels: NotificationChannel[],
  ) {}

  async notify(input: NotifyInput): Promise<{ notificationId: string }> {
    const notificationId = await withTenant(this.handle.db, input.tenantId, async (tx) => {
      const [row] = await tx
        .insert(notifications)
        .values({
          tenantId: input.tenantId,
          userId: input.userId,
          type: input.type,
          title: input.title,
          body: input.body,
        })
        .returning({ id: notifications.id });

      // Kullanıcı tercihine göre etkin dış kanallar.
      const prefs = await tx
        .select({ channel: notificationPrefs.channel, enabled: notificationPrefs.enabled })
        .from(notificationPrefs)
        .where(eq(notificationPrefs.userId, input.userId));
      const enabled = new Set(prefs.filter((p) => p.enabled).map((p) => p.channel));

      for (const ch of this.channels) {
        if (enabled.has(ch.name)) {
          await ch.send({ userId: input.userId, title: input.title, body: input.body });
        }
      }
      return row!.id;
    });
    return { notificationId };
  }

  async listUnread(tenantId: string, userId: string): Promise<{ id: string; title: string }[]> {
    return withTenant(this.handle.db, tenantId, (tx) =>
      tx
        .select({ id: notifications.id, title: notifications.title })
        .from(notifications)
        .where(and(eq(notifications.userId, userId), eq(notifications.read, false))),
    );
  }

  async markRead(tenantId: string, notificationId: string): Promise<void> {
    await withTenant(this.handle.db, tenantId, (tx) =>
      tx.update(notifications).set({ read: true }).where(eq(notifications.id, notificationId)),
    );
  }
}
