import { boolean, date, index, integer, numeric, pgTable, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants, users } from './schema.js';
import { students } from './schema-academic.js';

/** Öğrenci yaşamı (0023): kısmi zamanlı, PDR, engelli destek, oryantasyon, sağlık, kütüphane. */

export const partTimeJobs = pgTable('part_time_jobs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  unit: text('unit'),
  description: text('description'),
  hourlyRate: integer('hourly_rate'),
  quota: smallint('quota'),
  status: text('status').notNull().default('acik'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const partTimeAssignments = pgTable('part_time_assignments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  jobId: uuid('job_id').notNull().references(() => partTimeJobs.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  status: text('status').notNull().default('basvuruldu'),
  startedOn: date('started_on'),
  endedOn: date('ended_on'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('part_time_assignments_uq').on(t.jobId, t.studentId), index('part_time_assignments_student_idx').on(t.tenantId, t.studentId)]);

export const partTimeTimesheets = pgTable('part_time_timesheets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  assignmentId: uuid('assignment_id').notNull().references(() => partTimeAssignments.id, { onDelete: 'cascade' }),
  period: text('period').notNull(),
  hours: numeric('hours', { precision: 6, scale: 2 }).notNull(),
  approved: boolean('approved').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('part_time_timesheets_assignment_idx').on(t.tenantId, t.assignmentId)]);

/** PDR — gizli; erişim dar rol setiyle sınırlanmalı. */
export const counselingAppointments = pgTable('counseling_appointments', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  counselorUserId: uuid('counselor_user_id').references(() => users.id, { onDelete: 'set null' }),
  requestedAt: timestamp('requested_at', { withTimezone: true }).notNull().defaultNow(),
  appointmentAt: timestamp('appointment_at', { withTimezone: true }),
  kind: text('kind').notNull().default('bireysel'),
  status: text('status').notNull().default('talep'),
  note: text('note'),
  rating: smallint('rating'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('counseling_appointments_student_idx').on(t.tenantId, t.studentId)]);

export const disabilitySupports = pgTable('disability_supports', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  disabilityType: text('disability_type'),
  needs: text('needs'),
  accommodations: text('accommodations'),
  examExtraTimePct: smallint('exam_extra_time_pct'),
  status: text('status').notNull().default('aktif'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('disability_supports_student_idx').on(t.tenantId, t.studentId)]);

export const orientationEvents = pgTable('orientation_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  title: text('title').notNull(),
  eventDate: date('event_date'),
  location: text('location'),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const orientationAttendance = pgTable('orientation_attendance', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  eventId: uuid('event_id').notNull().references(() => orientationEvents.id, { onDelete: 'cascade' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  attended: boolean('attended').notNull().default(false),
  feedback: smallint('feedback'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('orientation_attendance_uq').on(t.eventId, t.studentId), index('orientation_attendance_event_idx').on(t.tenantId, t.eventId)]);

export const healthVisits = pgTable('health_visits', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  visitDate: date('visit_date'),
  complaint: text('complaint'),
  treatment: text('treatment'),
  referredTo: text('referred_to'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('health_visits_student_idx').on(t.tenantId, t.studentId)]);

export const libraryLoans = pgTable('library_loans', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
  itemTitle: text('item_title').notNull(),
  loanedOn: date('loaned_on'),
  dueOn: date('due_on'),
  returnedOn: date('returned_on'),
  fineAmount: integer('fine_amount').notNull().default(0),
  status: text('status').notNull().default('odunc'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('library_loans_student_idx').on(t.tenantId, t.studentId)]);
