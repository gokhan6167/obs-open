import { pgTable, smallint, text, unique, uuid } from 'drizzle-orm/pg-core';
import { curriculumCourses, programs } from './schema-academic.js';
import { tenants } from './schema.js';

/**
 * Müfredat/Bologna genişleme şeması (curriculum domain — 0012 migration).
 * Program çıktıları (PÇ), ders öğrenme çıktıları (DÇ) ve PÇ-DÇ ilişki matrisi.
 * Tüm tablolar tenant-kapsamlı ve RLS'e tabidir.
 */

/** Program çıktısı (PÇ): TYYÇ boyutu ile programın kazanım hedefi. */
export const programOutcomes = pgTable(
  'program_outcomes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    textTr: text('text_tr').notNull(),
    textEn: text('text_en'),
    tyycDimension: text('tyyc_dimension'),
    sortNo: smallint('sort_no').notNull().default(0),
  },
  (t) => [unique('program_outcomes_uq').on(t.programId, t.code)],
);

/** Ders öğrenme çıktısı (DÇ): bir müfredat-dersinin kazanımı. */
export const courseOutcomes = pgTable(
  'course_outcomes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    curriculumCourseId: uuid('curriculum_course_id')
      .notNull()
      .references(() => curriculumCourses.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    textTr: text('text_tr').notNull(),
    textEn: text('text_en'),
    sortNo: smallint('sort_no').notNull().default(0),
  },
  (t) => [unique('course_outcomes_uq').on(t.curriculumCourseId, t.code)],
);

/** PÇ-DÇ ilişki matrisi hücresi: ders-PÇ ilişki düzeyi (0-3). */
export const outcomeRelations = pgTable(
  'outcome_relations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    curriculumCourseId: uuid('curriculum_course_id')
      .notNull()
      .references(() => curriculumCourses.id, { onDelete: 'cascade' }),
    programOutcomeId: uuid('program_outcome_id')
      .notNull()
      .references(() => programOutcomes.id, { onDelete: 'cascade' }),
    level: smallint('level').notNull().default(0),
  },
  (t) => [unique('outcome_relations_uq').on(t.curriculumCourseId, t.programOutcomeId)],
);

/** Bu şemadaki tenant-kapsamlı tablo adları — RLS/migration döngüsü kullanır. */
export const CURRICULUM_TENANT_TABLES = [
  'program_outcomes',
  'course_outcomes',
  'outcome_relations',
] as const;
