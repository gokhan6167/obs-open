import { boolean, date, index, integer, jsonb, numeric, pgTable, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants, users } from './schema.js';
import { students } from './schema-academic.js';
import { thesisTopics } from './schema-services.js';

/** Lisansüstü + staj + CO-OP (0022). */

export const thesisCommittees = pgTable('thesis_committees', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  thesisId: uuid('thesis_id').notNull().references(() => thesisTopics.id, { onDelete: 'cascade' }),
  memberUserId: uuid('member_user_id').references(() => users.id, { onDelete: 'set null' }),
  memberName: text('member_name'),
  role: text('role').notNull().default('uye'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('thesis_committees_thesis_idx').on(t.tenantId, t.thesisId)]);

export const thesisProgress = pgTable('thesis_progress', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  thesisId: uuid('thesis_id').notNull().references(() => thesisTopics.id, { onDelete: 'cascade' }),
  period: text('period'),
  meetingDate: date('meeting_date'),
  result: text('result').notNull().default('basarili'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('thesis_progress_thesis_idx').on(t.tenantId, t.thesisId)]);

export const plagiarismReports = pgTable('plagiarism_reports', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  thesisId: uuid('thesis_id').notNull().references(() => thesisTopics.id, { onDelete: 'cascade' }),
  similarityPct: numeric('similarity_pct', { precision: 5, scale: 2 }),
  thresholdPct: numeric('threshold_pct', { precision: 5, scale: 2 }),
  passed: boolean('passed'),
  reportUrl: text('report_url'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('plagiarism_reports_thesis_idx').on(t.tenantId, t.thesisId)]);

export const thesisDefenses = pgTable('thesis_defenses', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  thesisId: uuid('thesis_id').notNull().references(() => thesisTopics.id, { onDelete: 'cascade' }),
  defenseDate: date('defense_date'),
  location: text('location'),
  jury: jsonb('jury'),
  result: text('result').notNull().default('beklemede'),
  decisionNo: text('decision_no'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('thesis_defenses_thesis_idx').on(t.tenantId, t.thesisId)]);

export const qualificationExams = pgTable('qualification_exams', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  examDate: date('exam_date'),
  writtenScore: numeric('written_score', { precision: 5, scale: 2 }),
  oralScore: numeric('oral_score', { precision: 5, scale: 2 }),
  result: text('result').notNull().default('beklemede'),
  attemptNo: smallint('attempt_no').notNull().default(1),
  jury: jsonb('jury'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('qualification_exams_student_idx').on(t.tenantId, t.studentId)]);

export const internshipRecords = pgTable('internship_records', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  company: text('company').notNull(),
  position: text('position'),
  startsOn: date('starts_on'),
  endsOn: date('ends_on'),
  days: integer('days'),
  insuranceDone: boolean('insurance_done').notNull().default(false),
  logbookSubmitted: boolean('logbook_submitted').notNull().default(false),
  companyRating: smallint('company_rating'),
  grade: text('grade'),
  status: text('status').notNull().default('basvuruldu'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('internship_records_student_idx').on(t.tenantId, t.studentId)]);

export const coopCompanies = pgTable('coop_companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  sector: text('sector'),
  contact: text('contact'),
  protocolNo: text('protocol_no'),
  scholarshipRateBps: integer('scholarship_rate_bps'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('coop_companies_name_uq').on(t.tenantId, t.name)]);

export const coopPlacements = pgTable('coop_placements', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  companyId: uuid('company_id').notNull().references(() => coopCompanies.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  term: text('term'),
  status: text('status').notNull().default('basvuruldu'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('coop_placements_company_idx').on(t.tenantId, t.companyId), index('coop_placements_student_idx').on(t.tenantId, t.studentId)]);
