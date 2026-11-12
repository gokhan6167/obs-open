import {
  bigint,
  date,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { academicTerms, programs, students } from './schema-academic.js';
import { tenants } from './schema.js';

/**
 * Mali şema (Faz 5 / M6). Para KURUŞ (bigint, tam sayı). RLS tüm tablolarda.
 * Ödeme callback'leri idempotent: (tenant_id, idempotency_key) benzersiz -> aynı
 * callback iki kez gelse tek ödeme (0007).
 */

/** Ücret tanımı: program × yıl -> brüt tutar (kuruş). */
export const feeSchedules = pgTable(
  'fee_schedules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    year: smallint('year').notNull(),
    baseAmount: bigint('base_amount', { mode: 'number' }).notNull(),
  },
  (t) => [unique('fee_schedules_uq').on(t.programId, t.year)],
);

/** Burs — tarihçeli (oran değişiklikleri). rate 0..1 (bin baz puan: 0-10000). */
export const scholarships = pgTable('scholarships', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'restrict' }),
  type: text('type').notNull(), // osym | basari | sporcu | ...
  rateBps: integer('rate_bps').notNull(), // 0-10000 (=%0-100)
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
});

/** Fatura (borç). amount = net (kuruş). status: unpaid | partial | paid. */
export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'restrict' }),
  termId: uuid('term_id')
    .notNull()
    .references(() => academicTerms.id, { onDelete: 'restrict' }),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  paidAmount: bigint('paid_amount', { mode: 'number' }).notNull().default(0),
  status: text('status').notNull().default('unpaid'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Ödeme — idempotent (idempotency_key). provider: iyzico | banka | mock. */
export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'restrict' }),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    provider: text('provider').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    providerRef: text('provider_ref'),
    status: text('status').notNull().default('success'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('payments_idempotency_uq').on(t.tenantId, t.idempotencyKey)],
);

/** Banka mutabakat kaydı (dosyadan). matched_payment_id eşleşince dolar. */
export const reconciliationRecords = pgTable('reconciliation_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  bankRef: text('bank_ref').notNull(),
  amount: bigint('amount', { mode: 'number' }).notNull(),
  matchedPaymentId: uuid('matched_payment_id').references(() => payments.id, {
    onDelete: 'set null',
  }),
  importedAt: timestamp('imported_at', { withTimezone: true }).notNull().defaultNow(),
});

export const FINANCE_TENANT_TABLES = [
  'fee_schedules',
  'scholarships',
  'invoices',
  'payments',
  'reconciliation_records',
] as const;
