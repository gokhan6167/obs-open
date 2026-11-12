import { date, index, integer, pgTable, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants, users } from './schema.js';
import { courses } from './schema-academic.js';

/** Eksikler (0018): seçmeli havuz, hafta tanımlama, fotoğraf onayı. */

export const electivePools = pgTable('elective_pools', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  code: text('code').notNull(),
  name: text('name').notNull(),
  kind: text('kind').notNull().default('secmeli'),
  status: text('status').notNull().default('aktif'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('elective_pools_code_uq').on(t.tenantId, t.code)]);

export const electivePoolCourses = pgTable('elective_pool_courses', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  poolId: uuid('pool_id').notNull().references(() => electivePools.id, { onDelete: 'cascade' }),
  courseId: uuid('course_id').notNull().references(() => courses.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('elective_pool_courses_uq').on(t.poolId, t.courseId), index('elective_pool_courses_pool_idx').on(t.tenantId, t.poolId)]);

export const academicWeeks = pgTable('academic_weeks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  year: integer('year').notNull(),
  term: text('term').notNull(),
  weekNo: smallint('week_no').notNull(),
  startsOn: date('starts_on'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('academic_weeks_uq').on(t.tenantId, t.year, t.term, t.weekNo)]);

export const photoRequests = pgTable('photo_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  photoUrl: text('photo_url'),
  status: text('status').notNull().default('beklemede'),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('photo_requests_status_idx').on(t.tenantId, t.status)]);
