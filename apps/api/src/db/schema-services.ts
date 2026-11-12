import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants, users } from './schema.js';
import { students } from './schema-academic.js';

/** Öğrenci hizmetleri (0019): talepler, çözüm merkezi, tez, kulüp, mezun, değişim. */

export const supportTickets = pgTable('support_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  category: text('category').notNull(),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  priority: text('priority').notNull().default('normal'),
  assignedUnit: text('assigned_unit'),
  status: text('status').notNull().default('acik'),
  resolution: text('resolution'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
}, (t) => [index('support_tickets_user_idx').on(t.tenantId, t.userId), index('support_tickets_status_idx').on(t.tenantId, t.status)]);

export const studentRequests = pgTable('student_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  kind: text('kind').notNull(),
  reason: text('reason'),
  detail: jsonb('detail'),
  status: text('status').notNull().default('basvuruldu'),
  decisionNote: text('decision_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('student_requests_student_idx').on(t.tenantId, t.studentId), index('student_requests_status_idx').on(t.tenantId, t.status)]);

export const thesisTopics = pgTable('thesis_topics', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  summary: text('summary'),
  advisorUserId: uuid('advisor_user_id').references(() => users.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('basvuruldu'),
  decisionNote: text('decision_note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('thesis_topics_student_idx').on(t.tenantId, t.studentId)]);

export const studentClubs = pgTable('student_clubs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  description: text('description'),
  advisorUserId: uuid('advisor_user_id').references(() => users.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('aktif'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('student_clubs_name_uq').on(t.tenantId, t.name)]);

export const clubMemberships = pgTable('club_memberships', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  clubId: uuid('club_id').notNull().references(() => studentClubs.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  role: text('role').notNull().default('uye'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('club_memberships_uq').on(t.clubId, t.studentId), index('club_memberships_club_idx').on(t.tenantId, t.clubId)]);

export const alumni = pgTable('alumni', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
  fullName: text('full_name').notNull(),
  graduationYear: integer('graduation_year'),
  programName: text('program_name'),
  email: text('email'),
  employment: text('employment'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('alumni_year_idx').on(t.tenantId, t.graduationYear)]);

export const exchangeMobility = pgTable('exchange_mobility', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  program: text('program').notNull().default('erasmus'),
  direction: text('direction').notNull().default('giden'),
  partnerUniversity: text('partner_university'),
  term: text('term'),
  status: text('status').notNull().default('basvuruldu'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('exchange_mobility_student_idx').on(t.tenantId, t.studentId)]);
