import { jsonb, pgTable, real, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { programs, students } from './schema-academic.js';
import { tenants, users } from './schema.js';

/**
 * ÇAP (çift anadal) / yandal başvuruları (Faz-canlı / M1). Başvuru -> komisyon
 * incelemesi -> onay/ret durum makinesiyle (academic-core request-status deseni).
 * Uygunluk academic-core checkDoubleMajorEligibility ile başvuru anında kontrol edilir.
 */
export const doubleMajorApplications = pgTable('double_major_applications', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  studentId: uuid('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'restrict' }),
  type: text('type').notNull(), // cap | yandal
  targetProgramId: uuid('target_program_id')
    .notNull()
    .references(() => programs.id, { onDelete: 'restrict' }),
  status: text('status').notNull().default('submitted'),
  gpaSnapshot: real('gpa_snapshot'),
  eligibility: jsonb('eligibility').$type<Record<string, unknown>>(),
  reviewerUserId: uuid('reviewer_user_id').references(() => users.id, { onDelete: 'set null' }),
  decisionReason: text('decision_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const DOUBLE_MAJOR_TENANT_TABLES = ['double_major_applications'] as const;
