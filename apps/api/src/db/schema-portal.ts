import {
  boolean,
  date,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { courses, departments, students } from './schema-academic.js';
import { requests } from './schema-comm.js';
import { doubleMajorApplications } from './schema-double-major.js';
import { tenants, users } from './schema.js';

/**
 * Portal domain şeması (danışmanlık + yönetişim + operasyon). RLS tüm tablolarda
 * (0012_portal.sql). Yeni tablo GEREKTİĞİ için eklendi:
 *  - advisor_notes: danışmanın danışan öğrenciyle görüşme/uyarı notu (gerçek yazma).
 *  - department_heads: bölüm başkanı ↔ bölüm eşlemesi (bölüm-kapsamlı sorgular).
 *  - feature_flags: kalıcı özellik bayrakları (yönetici toggle).
 *  - governance_sessions / governance_decisions: fakülte yönetim kurulu oturum/kararı.
 *  - course_bologna: dersin Bologna öğrenme çıktıları (değerlendirme/iş yükü GERÇEK
 *    grade_components + courses saatlerinden türetildiği için burada YOK).
 *
 * NOT: students.advisor_user_id kolonu 0012 ile eklenir (danışman-öğrenci eşlemesi);
 * schema-academic.ts'e dokunmamak için portal sorgularında raw kolon referansı kullanılır.
 */

/** Danışman görüşme/uyarı notu — danışan öğrenciye özel, zaman-çizelgesi. */
export const advisorNotes = pgTable('advisor_notes', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'restrict' }),
  authorUserId: uuid('author_user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  category: text('category').notNull().default('gorusme'), // gorusme | uyari | yonlendirme
  body: text('body').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Bölüm başkanı ↔ bölüm eşlemesi — bölüm-kapsamlı okuma sorguları için. */
export const departmentHeads = pgTable(
  'department_heads',
  {
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id, { onDelete: 'cascade' }),
  },
  (t) => [unique('department_heads_uq').on(t.userId, t.departmentId)],
);

/** Kalıcı özellik bayrağı — yönetici aç/kapat. */
export const featureFlags = pgTable(
  'feature_flags',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    key: text('key').notNull(),
    label: text('label').notNull(),
    description: text('description'),
    enabled: boolean('enabled').notNull().default(false),
    updatedByUserId: uuid('updated_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('feature_flags_key_uq').on(t.tenantId, t.key)],
);

/** Fakülte yönetim kurulu oturumu. status: open | closed. */
export const governanceSessions = pgTable(
  'governance_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    sessionNo: text('session_no').notNull(),
    date: date('date').notNull(),
    status: text('status').notNull().default('open'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique('governance_sessions_no_uq').on(t.tenantId, t.sessionNo)],
);

/** Kurul kararı — gündem maddesi + sonuç + (opsiyonel) bağlı talep/ÇAP. */
export const governanceDecisions = pgTable('governance_decisions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => governanceSessions.id, { onDelete: 'cascade' }),
  decisionNo: text('decision_no').notNull(),
  subject: text('subject').notNull(),
  outcome: text('outcome').notNull(), // kabul | ret | erteleme
  reason: text('reason'),
  linkedRequestId: uuid('linked_request_id').references(() => requests.id, { onDelete: 'set null' }),
  linkedDoubleMajorId: uuid('linked_double_major_id').references(
    () => doubleMajorApplications.id,
    { onDelete: 'set null' },
  ),
  createdByUserId: uuid('created_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** Dersin Bologna öğrenme çıktıları (değerlendirme/iş yükü gerçek veriden türetilir). */
export const courseBologna = pgTable(
  'course_bologna',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    learningOutcomes: jsonb('learning_outcomes').$type<string[]>().notNull().default([]),
    orderNo: smallint('order_no').notNull().default(0),
  },
  (t) => [unique('course_bologna_uq').on(t.tenantId, t.courseId)],
);

export const PORTAL_TENANT_TABLES = [
  'advisor_notes',
  'department_heads',
  'feature_flags',
  'governance_sessions',
  'governance_decisions',
  'course_bologna',
] as const;
