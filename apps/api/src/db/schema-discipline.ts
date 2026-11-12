import { date, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { tenants, users } from './schema.js';
import { students } from './schema-academic.js';

/**
 * Disiplin cezaları (0014_backoffice.sql). Tenant-kapsamlı, RLS'e tabi.
 * Ceza → YÖKSİS bildirimi iş kuralı ileride; burada kayıt modeli.
 */
export const disciplinaryActions = pgTable(
  'disciplinary_actions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'restrict' }),
    studentId: uuid('student_id')
      .notNull()
      .references(() => students.id, { onDelete: 'restrict' }),
    category: text('category').notNull(), // uyarı / kınama / uzaklaştırma / çıkarma
    penalty: text('penalty').notNull(),
    reason: text('reason'),
    decisionNo: text('decision_no'), // YKK karar no
    decisionDate: date('decision_date'),
    startsOn: date('starts_on'),
    endsOn: date('ends_on'),
    status: text('status').notNull().default('aktif'),
    createdByUserId: uuid('created_by_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('disciplinary_actions_student_idx').on(t.tenantId, t.studentId)],
);
