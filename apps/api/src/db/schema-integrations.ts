import { boolean, index, jsonb, pgTable, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants, users } from './schema.js';

/** Entegrasyon katmanı (0025): e-imza/EBYS akışı, entegrasyon config, bildirim logu. */

export const documentSignatures = pgTable('document_signatures', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  subjectType: text('subject_type').notNull(),
  subjectId: uuid('subject_id'),
  title: text('title').notNull(),
  signerUserId: uuid('signer_user_id').references(() => users.id, { onDelete: 'set null' }),
  signerName: text('signer_name'),
  seq: smallint('seq').notNull().default(1),
  status: text('status').notNull().default('bekliyor'),
  signedAt: timestamp('signed_at', { withTimezone: true }),
  ebysRef: text('ebys_ref'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('document_signatures_subject_idx').on(t.tenantId, t.subjectType, t.subjectId),
  index('document_signatures_status_idx').on(t.tenantId, t.status),
]);

export const integrationConfigs = pgTable('integration_configs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  baseUrl: text('base_url'),
  enabled: boolean('enabled').notNull().default(false),
  mode: text('mode').notNull().default('mock'),
  config: jsonb('config'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('integration_configs_key_uq').on(t.tenantId, t.key)]);

export const notificationLogs = pgTable('notification_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  channel: text('channel').notNull(),
  recipient: text('recipient').notNull(),
  subject: text('subject'),
  body: text('body'),
  status: text('status').notNull().default('gonderildi'),
  providerRef: text('provider_ref'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('notification_logs_channel_idx').on(t.tenantId, t.channel, t.createdAt)]);
