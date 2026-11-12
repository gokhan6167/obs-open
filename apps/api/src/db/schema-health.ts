import { boolean, date, integer, pgTable, real, smallint, text, unique, uuid } from 'drizzle-orm/pg-core';
import { academicTerms, programs, students } from './schema-academic.js';
import { tenants } from './schema.js';

/**
 * Sağlık programları şeması (Faz 7 / M7 — Demo farklılaştırıcısı). RLS tüm
 * tablolarda. Kurul (komite) modeli + klinik rotasyon + staj/intörnlük.
 */

/** Hastane/klinik/uygulama kurumu. */
export const clinicalSites = pgTable(
  'clinical_sites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    capacity: integer('capacity').notNull().default(0),
  },
  (t) => [unique('clinical_sites_uq').on(t.tenantId, t.code)],
);

/** Rotasyon tanımı: bir programın bir dönemdeki grup bazlı dönüşümlü klinik eğitimi. */
export const rotations = pgTable('rotations', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  programId: uuid('program_id')
    .notNull()
    .references(() => programs.id, { onDelete: 'restrict' }),
  termId: uuid('term_id')
    .notNull()
    .references(() => academicTerms.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  groupCount: smallint('group_count').notNull(),
  weeksPerGroup: smallint('weeks_per_group').notNull(),
});

/** Rotasyon ataması: öğrenci-grup-klinik-tarih. Grup dönüşümlü planlama üretir. */
export const rotationAssignments = pgTable(
  'rotation_assignments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    rotationId: uuid('rotation_id')
      .notNull()
      .references(() => rotations.id, { onDelete: 'cascade' }),
    clinicalSiteId: uuid('clinical_site_id')
      .notNull()
      .references(() => clinicalSites.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    groupNo: smallint('group_no').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    evaluationScore: real('evaluation_score'),
  },
  // Bir öğrenci aynı rotasyonda bir kez.
  (t) => [unique('rotation_assignments_uq').on(t.rotationId, t.studentId)],
);

/** Kurul (komite): dönem içindeki eğitim bloğu; yıl notundaki ağırlığı var. */
export const committees = pgTable(
  'committees',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'restrict' }),
    termId: uuid('term_id')
      .notNull()
      .references(() => academicTerms.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    orderNo: smallint('order_no').notNull(),
    /** Kurullar-içi ağırlık, bin baz puan (0-10000). */
    weightBps: integer('weight_bps').notNull(),
  },
  (t) => [unique('committees_uq').on(t.termId, t.orderNo)],
);

/** Öğrencinin bir kuruldan aldığı kurul sonu sınav puanı. */
export const committeeScores = pgTable(
  'committee_scores',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    committeeId: uuid('committee_id')
      .notNull()
      .references(() => committees.id, { onDelete: 'cascade' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    score: real('score').notNull(),
  },
  (t) => [unique('committee_scores_uq').on(t.committeeId, t.studentId)],
);

/** Staj / intörnlük. status: planned|ongoing|completed|approved. */
export const internships = pgTable('internships', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'restrict' }),
  clinicalSiteId: uuid('clinical_site_id')
    .notNull()
    .references(() => clinicalSites.id, { onDelete: 'restrict' }),
  startsOn: date('starts_on').notNull(),
  endsOn: date('ends_on').notNull(),
  status: text('status').notNull().default('planned'),
  logbookApproved: boolean('logbook_approved').notNull().default(false),
});

export const HEALTH_TENANT_TABLES = [
  'clinical_sites',
  'rotations',
  'rotation_assignments',
  'committees',
  'committee_scores',
  'internships',
] as const;
