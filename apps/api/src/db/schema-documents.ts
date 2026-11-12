import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { students } from './schema-academic.js';
import { tenants, users } from './schema.js';

/**
 * Belge şeması (Faz 4 / M5). Her resmi belgede benzersiz doğrulama kodu; herkese
 * açık verify sayfası (verify/{kod}) belgenin gerçekliğini teyit eder.
 *
 * verification_code GLOBAL benzersiz (public doğrulama tenant bilmeden kod ile
 * yapılır). Public erişim RLS'i SECURITY DEFINER fonksiyonuyla güvenli aşar (0006);
 * yalnızca public-güvenli alanlar döner.
 */
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  type: text('type').notNull(), // transkript | ogrenci_belgesi | diploma | ...
  studentId: uuid('student_id')
    .notNull()
    .references(() => students.id, { onDelete: 'restrict' }),
  verificationCode: text('verification_code').notNull().unique(),
  /** Belge içeriğinin anlık görüntüsü (üretildiği andaki veri). */
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull(),
  issuedByUserId: uuid('issued_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  issuedAt: timestamp('issued_at', { withTimezone: true }).notNull().defaultNow(),
  revoked: boolean('revoked').notNull().default(false),
  revokedReason: text('revoked_reason'),
});

/** Diploma numarası serisi — atomik sıra (program bazlı). */
export const documentCounters = pgTable('document_counters', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'restrict' }),
  key: text('key').notNull(), // örn. 'diploma:PROG'
  nextValue: text('next_value').notNull().default('1'),
});

export const DOCUMENT_TENANT_TABLES = ['documents', 'document_counters'] as const;
