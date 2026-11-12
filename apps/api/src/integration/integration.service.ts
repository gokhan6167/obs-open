import { randomInt } from 'node:crypto';
import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { desc, eq, sql } from 'drizzle-orm';
import type { DbHandle } from '../db/client.js';
import { DB } from '../db/drizzle.module.js';
import { integrationConfigs, notificationLogs } from '../db/schema-integrations.js';
import { auditLog } from '../db/schema.js';
import { requireTenant, withTenant } from '../db/tenant-context.js';

// Personel yetkisi (campus/approval STAFF ile bire bir).
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

/**
 * Kurumun beklediği standart entegrasyon seti. Tenant henüz hiçbirini
 * tanımlamamış olsa da konsolda "kapalı/mock" olarak görünürler ki
 * yöneticinin kurulacak entegrasyon listesi ekranda eksiksiz dursun.
 */
const DEFAULT_INTEGRATIONS: readonly { key: string; name: string }[] = [
  { key: 'ebys', name: 'EBYS (Elektronik Belge Yönetim Sistemi)' },
  { key: 'lms', name: 'LMS (Öğrenme Yönetim Sistemi)' },
  { key: 'sms', name: 'SMS Sağlayıcı' },
  { key: 'email', name: 'E-posta Sağlayıcı' },
  { key: 'banka', name: 'Banka Tahsilat' },
  { key: 'mernis', name: 'MERNİS Kimlik Doğrulama' },
  { key: 'yoksis', name: 'YÖKSİS' },
];

export interface UpsertIntegrationInput {
  name?: string | undefined;
  baseUrl?: string | undefined;
  enabled?: boolean | undefined;
  mode?: 'mock' | 'live' | undefined;
  config?: Record<string, unknown> | undefined;
}

export interface NotifyInput {
  channel: 'sms' | 'email';
  recipient: string;
  subject?: string | undefined;
  body: string;
}

/** Mock sağlayıcı referansı: MOCK-<6 hane>. */
const mockRef = (): string => `MOCK-${randomInt(100000, 1000000)}`;

/**
 * Entegrasyon konsolu (0025). Tenant-kapsamlı (RLS), personel yetkisi ister.
 * Entegrasyon tanımları upsert edilir; bildirim gönderimi bu fazda MOCK'tur:
 * dış servise İSTEK GİTMEZ, yalnızca notificationLogs'a kayıt düşülür ve yanıt
 * `_mock: true` ile işaretlenir. Gerçek sağlayıcı bağlanınca mode='live' olan
 * entegrasyon üzerinden gidilecek.
 */
@Injectable()
export class IntegrationService {
  constructor(@Inject(DB) private readonly handle: DbHandle) {}

  /** Tanımlı entegrasyonlar + tanımsız varsayılanlar (kapalı/mock) birleşik liste. */
  async list(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Entegrasyon konsoluna erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const rows = await tx.select().from(integrationConfigs);
      const byKey = new Map(rows.map((r) => [r.key, r]));

      const defaults = DEFAULT_INTEGRATIONS.map((d) => {
        const row = byKey.get(d.key);
        return row
          ? { ...row, configured: true }
          : {
              key: d.key,
              name: d.name,
              baseUrl: null,
              enabled: false,
              mode: 'mock',
              config: null,
              configured: false,
            };
      });
      // Varsayılan sette olmayan, kuruma özel eklenmiş entegrasyonlar.
      const extras = rows
        .filter((r) => !DEFAULT_INTEGRATIONS.some((d) => d.key === r.key))
        .map((r) => ({ ...r, configured: true }));

      return { items: [...defaults, ...extras] };
    });
  }

  /** Entegrasyon tanımı upsert (personel). Varsa güncellenir, yoksa oluşturulur. */
  async upsert(key: string, input: UpsertIntegrationInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Entegrasyon tanımlama yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      // İlk oluşturmada ad verilmediyse varsayılan katalogdan, o da yoksa key'den.
      const fallbackName = DEFAULT_INTEGRATIONS.find((d) => d.key === key)?.name ?? key;

      // Yalnızca gönderilen alanlar güncellenir (kısmi upsert).
      const patch: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) patch.name = input.name;
      if (input.baseUrl !== undefined) patch.baseUrl = input.baseUrl;
      if (input.enabled !== undefined) patch.enabled = input.enabled;
      if (input.mode !== undefined) patch.mode = input.mode;
      if (input.config !== undefined) patch.config = input.config;

      const [row] = await tx
        .insert(integrationConfigs)
        .values({
          tenantId: ctx.tenantId,
          key,
          name: input.name ?? fallbackName,
          baseUrl: input.baseUrl ?? null,
          enabled: input.enabled ?? false,
          mode: input.mode ?? 'mock',
          config: input.config ?? null,
        })
        .onConflictDoUpdate({
          target: [integrationConfigs.tenantId, integrationConfigs.key],
          set: patch,
        })
        .returning();

      await tx.insert(auditLog).values({
        tenantId: ctx.tenantId,
        actorUserId: ctx.actorUserId ?? null,
        action: 'integration.upsert',
        resourceType: 'integration_config',
        resourceId: row!.id,
        diff: { key, enabled: row!.enabled, mode: row!.mode },
      });

      return row!;
    });
  }

  /** Son bildirim logları (personel); ?channel ile kanal filtresi. */
  async notifications(channel?: string): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Bildirim loglarına erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const items = await tx
        .select()
        .from(notificationLogs)
        .where(channel ? eq(notificationLogs.channel, channel) : undefined)
        .orderBy(desc(notificationLogs.createdAt))
        .limit(200);
      return { items };
    });
  }

  /**
   * Bildirim gönder (personel). GERÇEK GÖNDERİM YOKTUR: dış sağlayıcıya istek
   * atılmaz, kayıt "gonderildi" olarak loglanır ve yanıt `_mock: true` döner.
   */
  async notify(input: NotifyInput): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Bildirim gönderme yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const [row] = await tx
        .insert(notificationLogs)
        .values({
          tenantId: ctx.tenantId,
          channel: input.channel,
          recipient: input.recipient,
          subject: input.subject ?? null,
          body: input.body,
          status: 'gonderildi',
          providerRef: mockRef(),
        })
        .returning();
      return { ...row!, _mock: true };
    });
  }

  /** Kanal bazlı gönderim sayıları + entegrasyon durum özeti (personel). */
  async stats(): Promise<Record<string, unknown>> {
    const ctx = requireTenant();
    if (!isStaff(ctx.roles ?? [])) {
      throw new ForbiddenException('Entegrasyon istatistiklerine erişim yetkiniz yok');
    }
    return withTenant(this.handle.db, ctx.tenantId, async (tx) => {
      const byChannel = await tx
        .select({
          channel: notificationLogs.channel,
          total: sql<number>`count(*)::int`,
          sent: sql<number>`count(*) filter (where ${notificationLogs.status} = 'gonderildi')::int`,
          lastAt: sql<Date | null>`max(${notificationLogs.createdAt})`,
        })
        .from(notificationLogs)
        .groupBy(notificationLogs.channel)
        .orderBy(desc(sql`count(*)`));

      const [agg] = await tx
        .select({
          configured: sql<number>`count(*)::int`,
          enabled: sql<number>`count(*) filter (where ${integrationConfigs.enabled})::int`,
          live: sql<number>`count(*) filter (where ${integrationConfigs.mode} = 'live')::int`,
          mock: sql<number>`count(*) filter (where ${integrationConfigs.mode} <> 'live')::int`,
        })
        .from(integrationConfigs);

      const configuredKeys = await tx
        .select({ key: integrationConfigs.key })
        .from(integrationConfigs);
      const known = new Set(configuredKeys.map((r) => r.key));
      const missing = DEFAULT_INTEGRATIONS.filter((d) => !known.has(d.key)).map((d) => d.key);

      return {
        notifications: { byChannel, total: byChannel.reduce((s, c) => s + c.total, 0) },
        integrations: {
          expected: DEFAULT_INTEGRATIONS.length,
          configured: agg?.configured ?? 0,
          enabled: agg?.enabled ?? 0,
          live: agg?.live ?? 0,
          mock: agg?.mock ?? 0,
          missing,
        },
      };
    });
  }
}
