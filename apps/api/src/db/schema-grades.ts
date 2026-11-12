import {
  boolean,
  date,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { academicTerms, students } from './schema-academic.js';
import { tenants, users } from './schema.js';
import { sections } from './schema-enrollment.js';

/**
 * Not, değerlendirme ve devamsızlık şeması (Faz 3 / M4). RLS tüm tablolarda.
 *
 * SESSİZ DEĞİŞİKLİK İMKÂNSIZ (§M4): ilan edilmiş notun içeriği (harf/puan) yalnızca
 * grade_corrections akışıyla değişir; DB trigger (0005) app.grade_correction GUC'u
 * set edilmeden içerik değişimini reddeder.
 */

/** Değerlendirme bileşeni (vize %x, final %y ...). Dönem başında kilitlenir. */
export const gradeComponents = pgTable(
  'grade_components',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    weight: smallint('weight').notNull(), // yüzde
    locked: boolean('locked').notNull().default(false),
  },
  (t) => [unique('grade_components_uq').on(t.sectionId, t.name)],
);

/** Öğrencinin bir bileşenden aldığı ham puan. */
export const componentScores = pgTable(
  'component_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    componentId: uuid('component_id')
      .notNull()
      .references(() => gradeComponents.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    score: real('score').notNull(),
  },
  (t) => [unique('component_scores_uq').on(t.componentId, t.studentId)],
);

/** Ders sonu notu. status: draft | announced | finalized. */
export const grades = pgTable(
  'grades',
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
    rawScore: real('raw_score'),
    letter: text('letter'),
    coefficient: real('coefficient'),
    evaluationType: text('evaluation_type').notNull().default('absolute'),
    status: text('status').notNull().default('draft'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('grades_student_section_uq').on(t.studentId, t.sectionId)],
);

/** Not düzeltme — ilan sonrası içerik değişiminin TEK yolu. Karar no + onay zorunlu. */
export const gradeCorrections = pgTable('grade_corrections', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  gradeId: uuid('grade_id')
    .notNull()
    .references(() => grades.id, { onDelete: 'restrict' }),
  oldLetter: text('old_letter'),
  newLetter: text('new_letter'),
  oldRaw: real('old_raw'),
  newRaw: real('new_raw'),
  reason: text('reason').notNull(),
  decisionNo: text('decision_no').notNull(), // yönetim kurulu karar no
  approvedByUserId: uuid('approved_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Not itirazı (ilan sonrası pencere). */
export const gradeAppeals = pgTable('grade_appeals', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  gradeId: uuid('grade_id')
    .notNull()
    .references(() => grades.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'restrict' }),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('open'), // open | accepted | rejected
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Devamsızlık kaydı (teorik/uygulama ayrı). */
export const attendance = pgTable(
  'attendance',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    sectionId: uuid('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    sessionDate: date('session_date').notNull(),
    kind: text('kind').notNull(), // theory | practice
    present: boolean('present').notNull(),
  },
  (t) => [unique('attendance_uq').on(t.sectionId, t.studentId, t.sessionDate, t.kind)],
);

export const GRADE_TENANT_TABLES = [
  'grade_components',
  'component_scores',
  'grades',
  'grade_corrections',
  'grade_appeals',
  'attendance',
] as const;
