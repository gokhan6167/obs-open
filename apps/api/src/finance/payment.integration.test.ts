import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDb, type DbHandle } from '../db/client.js';
import { runWithTenantStore } from '../db/tenant-context.js';
import { PaymentService } from './payment.service.js';

/**
 * FLAGSHIP: idempotent ödeme callback'i (§4). Aynı idempotency_key ile gelen
 * callback tekrar/eşzamanlı gelse TEK ödeme kaydı, fatura TEK kez güncellenir.
 */
const MIGRATE_URL =
  process.env.DATABASE_MIGRATE_URL ?? 'postgres://obs:obs_dev_password@localhost:5432/obs';
const APP_URL =
  process.env.DATABASE_URL ?? 'postgres://obs_app:obs_app_dev_password@localhost:5432/obs';

describe('PaymentService.recordPayment — idempotency', () => {
  const admin = postgres(MIGRATE_URL, { max: 1 });
  const handle: DbHandle = createDb(APP_URL, 12);
  const service = new PaymentService(handle);
  const tag = `pay_${Date.now()}`;

  let tenantId = '';
  let invoiceId = '';
  const AMOUNT = 100000;

  beforeAll(async () => {
    const [t] = await admin<{ id: string }[]>`insert into tenants (slug, name) values (${tag}, ${'T'}) returning id`;
    tenantId = t!.id;
    const [f] = await admin<{ id: string }[]>`insert into faculties (tenant_id, code, name) values (${tenantId}, ${'F'}, ${'F'}) returning id`;
    const [d] = await admin<{ id: string }[]>`insert into departments (tenant_id, faculty_id, code, name) values (${tenantId}, ${f!.id}, ${'D'}, ${'D'}) returning id`;
    const [p] = await admin<{ id: string }[]>`insert into programs (tenant_id, department_id, code, name, level) values (${tenantId}, ${d!.id}, ${'P'}, ${'P'}, ${'lisans'}) returning id`;
    const [cv] = await admin<{ id: string }[]>`insert into curriculum_versions (tenant_id, program_id, year, name) values (${tenantId}, ${p!.id}, ${2023}, ${'v'}) returning id`;
    const [term] = await admin<{ id: string }[]>`insert into academic_terms (tenant_id, year, term, name, starts_on, ends_on) values (${tenantId}, ${2024}, ${'guz'}, ${'g'}, ${'2024-09-16'}, ${'2025-01-17'}) returning id`;
    const [u] = await admin<{ id: string }[]>`insert into users (tenant_id, email, password_hash) values (${tenantId}, ${`s@${tag}.t`}, ${'x'}) returning id`;
    const [s] = await admin<{ id: string }[]>`insert into students (tenant_id, user_id, program_id, curriculum_version_id, student_no, status) values (${tenantId}, ${u!.id}, ${p!.id}, ${cv!.id}, ${'1'}, ${'aktif'}) returning id`;
    const [inv] = await admin<{ id: string }[]>`insert into invoices (tenant_id, student_id, term_id, amount) values (${tenantId}, ${s!.id}, ${term!.id}, ${AMOUNT}) returning id`;
    invoiceId = inv!.id;
  }, 30000);

  afterAll(async () => {
    for (const table of ['audit_log', 'payments', 'invoices', 'students', 'academic_terms', 'users', 'curriculum_versions', 'programs', 'departments', 'faculties']) {
      await admin.unsafe(`delete from ${table} where tenant_id = $1`, [tenantId]).catch(() => undefined);
    }
    await admin`delete from tenants where id = ${tenantId}`;
    await admin.end();
    await handle.client.end();
  });

  const asCtx = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithTenantStore({ tenantId, roles: ['mali_isler'] }, fn);

  it('aynı key ile ikinci callback idempotent, fatura tek kez ödenir', async () => {
    const first = await asCtx(() => service.recordPayment(invoiceId, AMOUNT, 'CALLBACK-1'));
    expect(first.idempotent).toBe(false);
    expect(first.invoiceStatus).toBe('paid');

    const second = await asCtx(() => service.recordPayment(invoiceId, AMOUNT, 'CALLBACK-1'));
    expect(second.idempotent).toBe(true);

    // DB gerçeği: tek ödeme, paidAmount == AMOUNT (2x değil).
    const pays = await admin<{ n: number }[]>`select count(*)::int as n from payments where invoice_id = ${invoiceId}`;
    expect(pays[0]!.n).toBe(1);
    const [inv] = await admin<{ paid_amount: number }[]>`select paid_amount from invoices where id = ${invoiceId}`;
    expect(Number(inv!.paid_amount)).toBe(AMOUNT);
  });

  it('10 eşzamanlı aynı-key callback -> tek ödeme (yarış güvenli)', async () => {
    const [inv2] = await admin<{ id: string }[]>`
      insert into invoices (tenant_id, student_id, term_id, amount)
      select tenant_id, student_id, term_id, ${AMOUNT} from invoices where id = ${invoiceId} returning id`;

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () =>
        asCtx(() => service.recordPayment(inv2!.id, AMOUNT, 'RACE-KEY')),
      ),
    );
    const nonIdem = results.filter(
      (r) => r.status === 'fulfilled' && !r.value.idempotent,
    ).length;
    expect(nonIdem).toBe(1); // yalnızca biri gerçek ödeme

    const pays = await admin<{ n: number }[]>`select count(*)::int as n from payments where invoice_id = ${inv2!.id}`;
    expect(pays[0]!.n).toBe(1);
    const [inv] = await admin<{ paid_amount: number }[]>`select paid_amount from invoices where id = ${inv2!.id}`;
    expect(Number(inv!.paid_amount)).toBe(AMOUNT);
  });
});
