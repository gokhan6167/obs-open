import { integer, pgTable, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { academicTerms, courses, programs, students } from './schema-academic.js';
import { tenants, users } from './schema.js';

/**
 * Ders kayıt şeması (Faz 2 / M3). Kontenjan atomikliği DB seviyesinde:
 * sections.filled asla quota'yı aşamaz (CHECK) ve artış atomik UPDATE ... WHERE
 * filled < quota ile yapılır (0004_enrollment.sql). RLS tüm tablolarda.
 */

/** Şube — bir dersin bir dönemdeki açılan örneği; kontenjan burada. */
export const sections = pgTable(
  'sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    termId: uuid('term_id')
      .notNull()
      .references(() => academicTerms.id, { onDelete: 'restrict' }),
    programId: uuid('program_id').references(() => programs.id, { onDelete: 'set null' }),
    instructorUserId: uuid('instructor_user_id').references(() => users.id, { onDelete: 'set null' }),
    code: text('code').notNull(), // şube no, örn. '01'
    quota: integer('quota').notNull(),
    filled: integer('filled').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('sections_uq').on(t.tenantId, t.courseId, t.termId, t.code)],
);

/** Öğrenci ders kaydı. Durum: draft | submitted | approved | rejected | withdrawn. */
export const enrollments = pgTable(
  'enrollments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'restrict' }),
    termId: uuid('term_id')
      .notNull()
      .references(() => academicTerms.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  // Aynı öğrenci aynı şubeye iki kez kaydolamaz (çift kayıt koruması).
  (t) => [unique('enrollments_student_section_uq').on(t.studentId, t.sectionId)],
);

/** Bekleme listesi — kontenjan dolunca sıraya. */
export const enrollmentWaitlist = pgTable(
  'enrollment_waitlist',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    position: smallint('position').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('waitlist_uq').on(t.sectionId, t.studentId)],
);

export const ENROLLMENT_TENANT_TABLES = ['sections', 'enrollments', 'enrollment_waitlist'] as const;
