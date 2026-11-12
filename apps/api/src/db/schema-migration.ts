import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './schema.js';

/**
 * Veri göçü şeması (Faz 8 / M11). Ayrı ve riskli iş paketi. RLS tüm tablolarda.
 * Prova (dry_run) + canlı koşumlar; ham veri staging, kirli veri karantina,
 * mutabakat istisnaları. İstisna raporu sıfırlanmadan canlıya geçilmez.
 */

export const migrationRuns = pgTable('migration_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  mode: text('mode').notNull(), // dry_run | live
  status: text('status').notNull().default('running'), // running | completed | failed
  stats: jsonb('stats').$type<Record<string, unknown>>(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

/** OİS'ten gelen ham + eşlenmiş satır (staging). */
export const stagingRows = pgTable('staging_rows', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  migrationRunId: uuid('migration_run_id')
    .notNull()
    .references(() => migrationRuns.id, { onDelete: 'cascade' }),
  sourceTable: text('source_table').notNull(),
  record: jsonb('record').$type<Record<string, unknown>>().notNull(),
});

/** Kirli/eksik veri karantinası — ÖİDB elle çözer. */
export const quarantineRows = pgTable('quarantine_rows', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  migrationRunId: uuid('migration_run_id')
    .notNull()
    .references(() => migrationRuns.id, { onDelete: 'cascade' }),
  sourceTable: text('source_table').notNull(),
  raw: jsonb('raw').$type<Record<string, unknown>>().notNull(),
  reason: text('reason').notNull(),
  resolved: boolean('resolved').notNull().default(false),
});

/** Mutabakat istisnası (OİS↔yeni transkript uyuşmazlığı). */
export const reconciliationExceptions = pgTable('reconciliation_exceptions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  migrationRunId: uuid('migration_run_id')
    .notNull()
    .references(() => migrationRuns.id, { onDelete: 'cascade' }),
  studentNo: text('student_no').notNull(),
  field: text('field').notNull(),
  oisValue: text('ois_value').notNull(),
  newValue: text('new_value').notNull(),
  resolved: boolean('resolved').notNull().default(false),
});

export const MIGRATION_TENANT_TABLES = [
  'migration_runs',
  'staging_rows',
  'quarantine_rows',
  'reconciliation_exceptions',
] as const;
