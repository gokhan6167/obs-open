import { boolean, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { students } from './schema-academic.js';
import { tenants, users } from './schema.js';

/**
 * İletişim + talep şeması (Faz 6 / M8). RLS tüm tablolarda. Duyuru hedefleme
 * scope + scope_id ile (university/faculty/department/course/section).
 */

export const announcements = pgTable('announcements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  body: text('body').notNull(),
  scope: text('scope').notNull(), // university | faculty | department | course | section
  scopeId: uuid('scope_id'),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  read: boolean('read').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Kullanıcı bazlı kanal tercihi (in_app/email/sms/push). */
export const notificationPrefs = pgTable(
  'notification_prefs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    channel: text('channel').notNull(),
    enabled: boolean('enabled').notNull().default(true),
  },
  (t) => [unique('notification_prefs_uq').on(t.userId, t.channel)],
);

/** Yapılandırılmış talep (dilekçe). status: submitted|in_review|approved|rejected|cancelled. */
export const requests = pgTable('requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'restrict' }),
  type: text('type').notNull(), // kayit_dondurma | mazeret_sinavi | belge | ...
  payload: jsonb('payload').$type<Record<string, unknown>>(),
  status: text('status').notNull().default('submitted'),
  reviewerUserId: uuid('reviewer_user_id').references(() => users.id, { onDelete: 'set null' }),
  decisionReason: text('decision_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const COMM_TENANT_TABLES = [
  'announcements',
  'notifications',
  'notification_prefs',
  'requests',
] as const;
