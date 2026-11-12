import { date, index, integer, numeric, pgTable, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants, users } from './schema.js';
import { programs, students } from './schema-academic.js';
import { disciplinaryActions } from './schema-discipline.js';

/** Cari derinlik + program kalite + disiplin soruşturma (0024). */

export const paymentPlans = pgTable('payment_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  year: integer('year').notNull(),
  term: text('term'),
  totalAmount: integer('total_amount').notNull(),
  installmentCount: smallint('installment_count').notNull().default(1),
  status: text('status').notNull().default('aktif'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('payment_plans_student_idx').on(t.tenantId, t.studentId)]);

export const paymentInstallments = pgTable('payment_installments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  planId: uuid('plan_id').notNull().references(() => paymentPlans.id, { onDelete: 'cascade' }),
  seq: smallint('seq').notNull(),
  dueOn: date('due_on'),
  amount: integer('amount').notNull(),
  paidAmount: integer('paid_amount').notNull().default(0),
  paidOn: date('paid_on'),
  method: text('method'),
  status: text('status').notNull().default('bekliyor'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('payment_installments_uq').on(t.planId, t.seq), index('payment_installments_plan_idx').on(t.tenantId, t.planId)]);

export const refundRequests = pgTable('refund_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  amount: integer('amount').notNull(),
  iban: text('iban'),
  accountHolder: text('account_holder'),
  bank: text('bank'),
  reason: text('reason'),
  status: text('status').notNull().default('talep'),
  decidedByUserId: uuid('decided_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  paidAt: timestamp('paid_at', { withTimezone: true }),
}, (t) => [index('refund_requests_student_idx').on(t.tenantId, t.studentId)]);

export const programReviews = pgTable('program_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
  year: integer('year').notNull(),
  studentCount: integer('student_count'),
  graduateCount: integer('graduate_count'),
  avgGpa: numeric('avg_gpa', { precision: 4, scale: 2 }),
  employmentRate: numeric('employment_rate', { precision: 5, scale: 2 }),
  satisfaction: numeric('satisfaction', { precision: 5, scale: 2 }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('program_reviews_uq').on(t.tenantId, t.programId, t.year)]);

export const accreditationFiles = pgTable('accreditation_files', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  cycle: text('cycle'),
  status: text('status').notNull().default('hazirlik'),
  visitDate: date('visit_date'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('accreditation_files_program_idx').on(t.tenantId, t.programId)]);

export const correctiveActions = pgTable('corrective_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  accreditationId: uuid('accreditation_id').notNull().references(() => accreditationFiles.id, { onDelete: 'cascade' }),
  finding: text('finding').notNull(),
  action: text('action'),
  dueOn: date('due_on'),
  status: text('status').notNull().default('acik'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('corrective_actions_acc_idx').on(t.tenantId, t.accreditationId)]);

export const disciplinaryInvestigations = pgTable('disciplinary_investigations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  complaint: text('complaint').notNull(),
  stage: text('stage').notNull().default('ihbar'),
  investigatorUserId: uuid('investigator_user_id').references(() => users.id, { onDelete: 'set null' }),
  evidence: text('evidence'),
  decision: text('decision'),
  decisionNo: text('decision_no'),
  decisionDate: date('decision_date'),
  actionId: uuid('action_id').references(() => disciplinaryActions.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('disciplinary_investigations_student_idx').on(t.tenantId, t.studentId)]);
