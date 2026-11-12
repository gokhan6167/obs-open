import { boolean, date, index, integer, numeric, pgTable, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants, users } from './schema.js';
import { students } from './schema-academic.js';
import { sections } from './schema-enrollment.js';
import { classrooms } from './schema-backoffice.js';

/** Derinlik (0017): ders açma haftalık program/öğretim elemanı, öğrenci dosyası ek, harç borç tipi. */

export const sectionMeetings = pgTable('section_meetings', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
  dayOfWeek: smallint('day_of_week'),
  startTime: text('start_time'),
  endTime: text('end_time'),
  kind: text('kind').notNull().default('teorik'),
  classroomId: uuid('classroom_id').references(() => classrooms.id, { onDelete: 'set null' }),
  instructorUserId: uuid('instructor_user_id').references(() => users.id, { onDelete: 'set null' }),
  isMakeup: boolean('is_makeup').notNull().default(false),
  ykkNo: text('ykk_no'),
  weekNo: smallint('week_no'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('section_meetings_section_idx').on(t.tenantId, t.sectionId)]);

export const sectionInstructors = pgTable('section_instructors', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  role: text('role').notNull().default('veren'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('section_instructors_uq').on(t.sectionId, t.userId), index('section_instructors_section_idx').on(t.tenantId, t.sectionId)]);

export const priorEducations = pgTable('prior_educations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  schoolName: text('school_name').notNull(),
  degree: text('degree'),
  graduationYear: integer('graduation_year'),
  gpa: numeric('gpa', { precision: 4, scale: 2 }),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('prior_educations_student_idx').on(t.tenantId, t.studentId)]);

export const studentAwards = pgTable('student_awards', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  awardDate: date('award_date'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('student_awards_student_idx').on(t.tenantId, t.studentId)]);

export const debtTypes = pgTable('debt_types', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('debt_types_code_uq').on(t.tenantId, t.code)]);
