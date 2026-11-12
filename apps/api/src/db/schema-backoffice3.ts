import { boolean, date, index, jsonb, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants, users } from './schema.js';
import { students, curriculumCourses } from './schema-academic.js';
import { sections } from './schema-enrollment.js';

/** Backoffice 3 (0016): sınav/yoklama, intibak-muaf-transfer, mesajlaşma, anket. */

export const examSchedules = pgTable('exam_schedules', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
  examType: text('exam_type').notNull(),
  examDate: date('exam_date'),
  startTime: text('start_time'),
  location: text('location'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('exam_schedules_section_idx').on(t.tenantId, t.sectionId)]);

export const makeupExams = pgTable('makeup_exams', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  sectionId: uuid('section_id').notNull().references(() => sections.id, { onDelete: 'cascade' }),
  examType: text('exam_type').notNull(),
  decisionNo: text('decision_no'),
  status: text('status').notNull().default('atandi'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('makeup_exams_student_idx').on(t.tenantId, t.studentId)]);

export const courseAdaptations = pgTable('course_adaptations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  type: text('type').notNull(),
  sourceCourse: text('source_course').notNull(),
  targetCurriculumCourseId: uuid('target_curriculum_course_id').references(() => curriculumCourses.id, { onDelete: 'set null' }),
  letter: text('letter'),
  decisionNo: text('decision_no'),
  status: text('status').notNull().default('onayli'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('course_adaptations_student_idx').on(t.tenantId, t.studentId)]);

export const messages = pgTable('messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  fromUserId: uuid('from_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  toUserId: uuid('to_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  subject: text('subject').notNull(),
  body: text('body').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('messages_to_idx').on(t.tenantId, t.toUserId), index('messages_from_idx').on(t.tenantId, t.fromUserId)]);

export const surveys = pgTable('surveys', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  description: text('description'),
  kind: text('kind').notNull().default('anket'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const surveyResponses = pgTable('survey_responses', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  surveyId: uuid('survey_id').notNull().references(() => surveys.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  answers: jsonb('answers'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('survey_responses_uq').on(t.surveyId, t.userId), index('survey_responses_survey_idx').on(t.tenantId, t.surveyId)]);
