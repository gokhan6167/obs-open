import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  inet,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * OBS çekirdek şeması. Her tenant-kapsamlı tabloda `tenant_id` var ve RLS
 * (0001_init.sql) DB seviyesinde izolasyonu zorlar. Uygulama katmanı unutsa
 * bile veri sızmaz — çift kilit (ADR-0003).
 *
 * NOT: RLS politikaları ve append-only audit trigger'ı Drizzle şemasında
 * ifade edilemediği için elle yazılmış SQL migration'da (0001_init.sql) tanımlı.
 */

/** Tenant kayıt defteri — platform seviyesi (global). */
export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  name: text('name').notNull(),
  deploymentMode: text('deployment_mode').notNull().default('multi-tenant'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Kullanıcılar — tenant-kapsamlı, RLS'e tabi. */
export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    email: text('email').notNull(),
    passwordHash: text('password_hash').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    totpSecret: text('totp_secret'),
    // Özlük iletişim + fotoğraf (0014, nullable).
    phone: text('phone'),
    photoUrl: text('photo_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('users_tenant_email_uq').on(t.tenantId, t.email)],
);

/** Roller — tenant-kapsamlı (RBAC, ADR ilerideki fazda). */
export const roles = pgTable(
  'roles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    key: text('key').notNull(),
    name: text('name').notNull(),
  },
  (t) => [unique('roles_tenant_key_uq').on(t.tenantId, t.key)],
);

/** Kullanıcı-rol ataması (birleştirilebilir roller). */
export const userRoles = pgTable(
  'user_roles',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    roleId: uuid('role_id')
      .notNull()
      .references(() => roles.id, { onDelete: 'cascade' }),
  },
  (t) => [unique('user_roles_uq').on(t.userId, t.roleId)],
);

/**
 * Append-only audit log (master prompt §5). UPDATE/DELETE trigger ile engellenir
 * (0001_init.sql). Her yazma işlemi buraya düşer: kim, ne, eski->yeni, IP.
 */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial('id', { mode: 'bigint' }).primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    actorUserId: uuid('actor_user_id'),
    action: text('action').notNull(),
    resourceType: text('resource_type').notNull(),
    resourceId: text('resource_id'),
    diff: jsonb('diff').$type<Record<string, unknown>>(),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    at: timestamp('at', { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => [index('audit_tenant_at_idx').on(t.tenantId, t.at)],
);
