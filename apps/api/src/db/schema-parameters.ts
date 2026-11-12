import { boolean, date, jsonb, pgTable, smallint, text, unique, uuid } from 'drizzle-orm/pg-core';
import type { GradeBand, RepeatPolicy, RoundingMode } from '@obs/academic-core';
import { programs } from './schema-academic.js';
import { tenants } from './schema.js';

/**
 * Parametre altyapısı (Faz 1 / task 11). Mevzuat değerleri KODDA DEĞİL, burada:
 * harf notu ölçekleri, GNO politikası, akademik kural setleri. Her kayıt
 * VERSİYONLU + YÜRÜRLÜK TARİHLİ ve tenant/program bazlıdır.
 *
 * Çözümleme (ParametersService): verilen tarih + program için en spesifik ve
 * yürürlükteki kayıt seçilir (program-özel > tenant-geneli, sonra en yeni).
 * program_id NULL = tenant geneli varsayılan.
 *
 * docs/ASSUMPTIONS.md'deki her varsayım bu tablolardan birine oturur.
 */

/** Harf notu ölçeği — bantlar academic-core GradeBand[] olarak saklanır. */
export const gradeScales = pgTable(
  'grade_scales',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    programId: uuid('program_id').references(() => programs.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    bands: jsonb('bands').$type<GradeBand[]>().notNull(),
    effectiveFrom: date('effective_from').notNull(),
    effectiveTo: date('effective_to'),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [unique('grade_scales_uq').on(t.tenantId, t.code, t.effectiveFrom)],
);

/** GNO politikası — tekrar politikası + yuvarlama. */
export const gpaPolicies = pgTable('gpa_policies', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  programId: uuid('program_id').references(() => programs.id, { onDelete: 'cascade' }),
  repeatPolicy: text('repeat_policy').$type<RepeatPolicy>().notNull(),
  roundingDigits: smallint('rounding_digits').notNull().default(2),
  roundingMode: text('rounding_mode').$type<RoundingMode>().notNull().default('half-up'),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
});

/**
 * Akademik kural seti — AKTS alt/üst limitleri, GNO'ya göre üst limit artışı,
 * devamsızlık eşikleri vb. Esnek/parametrik olduğu için jsonb.
 */
export const academicRuleSets = pgTable('academic_rule_sets', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  programId: uuid('program_id').references(() => programs.id, { onDelete: 'cascade' }),
  rules: jsonb('rules').$type<AcademicRules>().notNull(),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
});

/** Kural seti şekli. VARSAYIM değerleri seed/ASSUMPTIONS'ta; burada sadece tip. */
export interface AcademicRules {
  /** Dönemlik alınabilecek asgari/azami AKTS. */
  minEctsPerTerm: number;
  maxEctsPerTerm: number;
  /** GNO bu eşiğin üstündeyse üst AKTS limiti şu değere çıkar. */
  gpaBoostThreshold?: number;
  maxEctsWithBoost?: number;
  /** Devamsızlık üst sınırları (teorik/uygulama), yüzde. */
  maxAbsenceTheoryPct: number;
  maxAbsencePracticePct: number;
  /** Asgari mezuniyet GNO'su. */
  minGraduationGpa: number;
}

export const PARAMETER_TENANT_TABLES = [
  'grade_scales',
  'gpa_policies',
  'academic_rule_sets',
] as const;
