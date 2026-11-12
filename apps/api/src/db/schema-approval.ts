import { boolean, index, pgTable, smallint, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { tenants, users } from './schema.js';
import { students } from './schema-academic.js';

/** Çok-birimli onay motoru (0020). Talep → birim1 → birim2 → … → karar. */

export const approvalFlows = pgTable('approval_flows', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  key: text('key').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('approval_flows_key_uq').on(t.tenantId, t.key)]);

export const approvalFlowSteps = pgTable('approval_flow_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  flowId: uuid('flow_id').notNull().references(() => approvalFlows.id, { onDelete: 'cascade' }),
  stepNo: smallint('step_no').notNull(),
  unit: text('unit').notNull(),
  roleKey: text('role_key'),
  name: text('name').notNull(),
  slaDays: smallint('sla_days'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [unique('approval_flow_steps_uq').on(t.flowId, t.stepNo), index('approval_flow_steps_flow_idx').on(t.tenantId, t.flowId)]);

export const approvalInstances = pgTable('approval_instances', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  flowId: uuid('flow_id').notNull().references(() => approvalFlows.id, { onDelete: 'restrict' }),
  subjectType: text('subject_type').notNull(),
  subjectId: uuid('subject_id').notNull(),
  studentId: uuid('student_id').references(() => students.id, { onDelete: 'set null' }),
  currentStep: smallint('current_step').notNull().default(1),
  status: text('status').notNull().default('devam'),
  startedByUserId: uuid('started_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  closedAt: timestamp('closed_at', { withTimezone: true }),
}, (t) => [index('approval_instances_subject_idx').on(t.tenantId, t.subjectType, t.subjectId), index('approval_instances_status_idx').on(t.tenantId, t.status, t.currentStep)]);

export const approvalActions = pgTable('approval_actions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull().references(() => tenants.id, { onDelete: 'restrict' }),
  instanceId: uuid('instance_id').notNull().references(() => approvalInstances.id, { onDelete: 'cascade' }),
  stepNo: smallint('step_no').notNull(),
  unit: text('unit'),
  action: text('action').notNull(),
  note: text('note'),
  actedByUserId: uuid('acted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('approval_actions_instance_idx').on(t.tenantId, t.instanceId)]);
