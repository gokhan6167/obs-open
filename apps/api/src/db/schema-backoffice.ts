import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { tenants } from './schema.js';
import { programs, students } from './schema-academic.js';

/** Backoffice ana modülleri (0015_backoffice2.sql). Tenant-kapsamlı, RLS'e tabi. */

export const buildings = pgTable(
  'buildings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
    code: text('code').notNull(),
    name: text('name').notNull(),
    campus: text('campus'),
    address: text('address'),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('buildings_code_uq').on(t.tenantId, t.code)],
);

export const classrooms = pgTable(
  'classrooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
    buildingId: uuid('building_id').notNull().references(() => buildings.id, { onDelete: 'cascade' }),
    code: text('code').notNull(),
    name: text('name'),
    kind: text('kind').notNull().default('derslik'),
    capacity: integer('capacity').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('classrooms_building_idx').on(t.tenantId, t.buildingId)],
);

export const studentLeaves = pgTable(
  'student_leaves',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
    type: text('type').notNull(),
    startsOn: date('starts_on'),
    endsOn: date('ends_on'),
    decisionNo: text('decision_no'),
    decisionDate: date('decision_date'),
    reason: text('reason'),
    status: text('status').notNull().default('aktif'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('student_leaves_student_idx').on(t.tenantId, t.studentId)],
);

export const militaryDeferrals = pgTable(
  'military_deferrals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
    status: text('status').notNull().default('ertelendi'),
    deferralDate: date('deferral_date'),
    note: text('note'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('military_deferrals_student_idx').on(t.tenantId, t.studentId)],
);

export const studentDocuments = pgTable(
  'student_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
    kind: text('kind').notNull(),
    description: text('description'),
    docNo: text('doc_no'),
    receivedOn: date('received_on'),
    hasOriginal: boolean('has_original').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('student_documents_student_idx').on(t.tenantId, t.studentId)],
);

export const applicationPrograms = pgTable(
  'application_programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
    programId: uuid('program_id').notNull().references(() => programs.id, { onDelete: 'restrict' }),
    type: text('type').notNull(),
    year: integer('year').notNull(),
    term: text('term'),
    quota: integer('quota').notNull().default(0),
    startsOn: date('starts_on'),
    endsOn: date('ends_on'),
    minGpa: numeric('min_gpa', { precision: 4, scale: 2 }),
    status: text('status').notNull().default('acik'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('application_programs_prog_idx').on(t.tenantId, t.programId)],
);

export const applicants = pgTable(
  'applicants',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
    applicationProgramId: uuid('application_program_id').notNull().references(() => applicationPrograms.id, { onDelete: 'cascade' }),
    fullName: text('full_name').notNull(),
    nationalId: text('national_id'),
    score: numeric('score', { precision: 6, scale: 2 }),
    status: text('status').notNull().default('basvurdu'),
    // Aday self-servis takibi + iletişim + tercih sırası (0021).
    pinCode: text('pin_code'),
    email: text('email'),
    phone: text('phone'),
    preferenceNo: smallint('preference_no'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('applicants_program_idx').on(t.tenantId, t.applicationProgramId)],
);

export const diplomas = pgTable(
  'diplomas',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id').notNull().references(() => students.id, { onDelete: 'restrict' }),
    diplomaNo: text('diploma_no'),
    serialNo: text('serial_no'),
    graduationDate: date('graduation_date'),
    degree: text('degree'),
    decisionNo: text('decision_no'),
    decisionDate: date('decision_date'),
    rankNo: integer('rank_no'),
    status: text('status').notNull().default('hazirlaniyor'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('diplomas_student_uq').on(t.tenantId, t.studentId)],
);
