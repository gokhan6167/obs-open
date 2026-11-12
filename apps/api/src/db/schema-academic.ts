import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import type { ConditionNode } from '@obs/academic-core';
import { tenants, users } from './schema.js';

/**
 * Akademik domain şeması (Faz 1 / M1-M2). Tüm tablolar tenant-kapsamlı ve RLS'e
 * tabidir (migration 0002_academic.sql). Mevzuat değerleri burada YOK — harf
 * notu/limit gibi parametreler ayrı parametre tablolarında (Faz 1 / task 11).
 */

// === Müfredat hiyerarşisi (M2) ===

export const faculties = pgTable(
  'faculties',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('faculties_tenant_code_uq').on(t.tenantId, t.code)],
);

export const departments = pgTable(
  'departments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    facultyId: uuid('faculty_id')
      .notNull()
      .references(() => faculties.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
  },
  (t) => [unique('departments_tenant_code_uq').on(t.tenantId, t.code)],
);

/** Program seviyeleri parametrik değil, yapısal enum benzeri (text tutulur). */
export const programs = pgTable(
  'programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    level: text('level').notNull(), // onlisans | lisans | yuksek_lisans | doktora
    language: text('language').notNull().default('tr'),
    // Eğitim modeli: 'semester' (yarıyıl/GNO) | 'committee' (kurul, tıp/diş). Faz 7.
    educationModel: text('education_model').notNull().default('semester'),
  },
  (t) => [unique('programs_tenant_code_uq').on(t.tenantId, t.code)],
);

/** Yıl bazlı müfredat versiyonu — eski öğrenci eski kurallarla okur. */
export const curriculumVersions = pgTable(
  'curriculum_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'restrict' }),
    year: smallint('year').notNull(),
    name: text('name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
  },
  (t) => [unique('curriculum_versions_uq').on(t.programId, t.year)],
);

/** Ders kataloğu — tenant seviyesi (versiyonlar bu derslere referans verir). */
export const courses = pgTable(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    nameTr: text('name_tr').notNull(),
    nameEn: text('name_en'),
    ects: integer('ects').notNull(),
    localCredit: integer('local_credit').notNull(),
    theoryHours: smallint('theory_hours').notNull().default(0),
    practiceHours: smallint('practice_hours').notNull().default(0),
    labHours: smallint('lab_hours').notNull().default(0),
  },
  (t) => [unique('courses_tenant_code_uq').on(t.tenantId, t.code)],
);

/**
 * Müfredat-ders bağı: hangi ders, hangi versiyonda, hangi yarıyılda, zorunlu mu,
 * ön koşul ağacı ne. Ön koşul academic-core ConditionNode olarak saklanır.
 */
export const curriculumCourses = pgTable(
  'curriculum_courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    curriculumVersionId: uuid('curriculum_version_id')
      .notNull()
      .references(() => curriculumVersions.id, { onDelete: 'cascade' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'restrict' }),
    semesterNo: smallint('semester_no').notNull(),
    isMandatory: boolean('is_mandatory').notNull().default(true),
    prerequisite: jsonb('prerequisite').$type<ConditionNode>(),
  },
  (t) => [unique('curriculum_courses_uq').on(t.curriculumVersionId, t.courseId)],
);

// === Öğrenci (M1) ===

export const students = pgTable(
  'students',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    programId: uuid('program_id')
      .notNull()
      .references(() => programs.id, { onDelete: 'restrict' }),
    curriculumVersionId: uuid('curriculum_version_id')
      .notNull()
      .references(() => curriculumVersions.id, { onDelete: 'restrict' }),
    studentNo: text('student_no').notNull(),
    // Durum academic-core StudentStatus; geçişler durum makinesiyle yönetilir.
    status: text('status').notNull().default('aktif'),
    // Danışman-öğrenci eşlemesi (0013 ile eklendi); danışman atama kullanır.
    advisorUserId: uuid('advisor_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    // Sınıf + yürürlükteki yarıyıl (dönem atlatma; 0014).
    classYear: smallint('class_year'),
    currentSemester: smallint('current_semester'),
    enrolledAt: timestamp('enrolled_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('students_tenant_no_uq').on(t.tenantId, t.studentNo)],
);

// === Akademik takvim (M3 çekirdeği) ===

export const academicTerms = pgTable(
  'academic_terms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    year: smallint('year').notNull(),
    term: text('term').notNull(), // guz | bahar | yaz
    name: text('name').notNull(),
    startsOn: date('starts_on').notNull(),
    endsOn: date('ends_on').notNull(),
    isActive: boolean('is_active').notNull().default(false),
  },
  (t) => [unique('academic_terms_uq').on(t.tenantId, t.year, t.term)],
);

/** Takvim olayları: kayıt/ekle-sil/mazeret/sınav pencereleri. Tüm modüller okur. */
export const calendarEvents = pgTable('calendar_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  termId: uuid('term_id')
    .notNull()
    .references(() => academicTerms.id, { onDelete: 'cascade' }),
  type: text('type').notNull(), // kayit | ekle_sil | mazeret | vize | final | butunleme
  startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
  endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
});

/** Bu şemadaki tenant-kapsamlı tablo adları — migration RLS döngüsü kullanır. */
export const ACADEMIC_TENANT_TABLES = [
  'faculties',
  'departments',
  'programs',
  'curriculum_versions',
  'courses',
  'curriculum_courses',
  'students',
  'academic_terms',
  'calendar_events',
] as const;
