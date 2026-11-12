import { boolean, date, index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants } from './schema.js';
import { students } from './schema-academic.js';
import { applicants } from './schema-backoffice.js';

/** Başvuru/kabul derinliği (0021): belge, dış servis logu, dil yeterlilik, uluslararası kabul. */

export const applicationDocuments = pgTable('application_documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  applicantId: uuid('applicant_id').notNull().references(() => applicants.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  fileName: text('file_name'),
  fileUrl: text('file_url'),
  verified: boolean('verified').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('application_documents_applicant_idx').on(t.tenantId, t.applicantId)]);

export const externalServiceLogs = pgTable('external_service_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  service: text('service').notNull(),
  operation: text('operation').notNull(),
  subjectRef: text('subject_ref'),
  status: text('status').notNull().default('basarili'),
  response: jsonb('response'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('external_service_logs_svc_idx').on(t.tenantId, t.service, t.createdAt)]);

export const languageProficiencies = pgTable('language_proficiencies', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
  applicantId: uuid('applicant_id').references(() => applicants.id, { onDelete: 'set null' }),
  examType: text('exam_type').notNull(),
  score: numeric('score', { precision: 6, scale: 2 }),
  examDate: date('exam_date'),
  result: text('result').notNull().default('beklemede'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('language_proficiencies_student_idx').on(t.tenantId, t.studentId)]);

export const internationalAdmissions = pgTable('international_admissions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  applicantId: uuid('applicant_id').notNull().references(() => applicants.id, { onDelete: 'cascade' }),
  country: text('country'),
  depositAmount: integer('deposit_amount'),
  depositPaid: boolean('deposit_paid').notNull().default(false),
  acceptanceLetterNo: text('acceptance_letter_no'),
  visaStatus: text('visa_status').notNull().default('beklemede'),
  status: text('status').notNull().default('on_kabul'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('international_admissions_applicant_idx').on(t.tenantId, t.applicantId)]);
