import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDb, type DbHandle } from '../db/client.js';
import { runWithTenantStore } from '../db/tenant-context.js';
import { NotificationService } from '../notifications/notification.service.js';
import { RequestService } from './request.service.js';

/** Talep akışı: oluştur -> incele -> onayla; audit + öğrenci bildirimi. */
const MIGRATE_URL =
  process.env.DATABASE_MIGRATE_URL ?? 'postgres://obs:obs_dev_password@localhost:5432/obs';
const APP_URL =
  process.env.DATABASE_URL ?? 'postgres://obs_app:obs_app_dev_password@localhost:5432/obs';

describe('RequestService (entegrasyon)', () => {
  const admin = postgres(MIGRATE_URL, { max: 1 });
  const handle: DbHandle = createDb(APP_URL, 3);
  const service = new RequestService(handle, new NotificationService(handle, []));
  const tag = `req_${Date.now()}`;

  let tenantId = '';
  const student = { id: '', userId: '' };

  beforeAll(async () => {
    const [t] = await admin<{ id: string }[]>`insert into tenants (slug, name) values (${tag}, ${'T'}) returning id`;
    tenantId = t!.id;
    const [f] = await admin<{ id: string }[]>`insert into faculties (tenant_id, code, name) values (${tenantId}, ${'F'}, ${'F'}) returning id`;
    const [d] = await admin<{ id: string }[]>`insert into departments (tenant_id, faculty_id, code, name) values (${tenantId}, ${f!.id}, ${'D'}, ${'D'}) returning id`;
    const [p] = await admin<{ id: string }[]>`insert into programs (tenant_id, department_id, code, name, level) values (${tenantId}, ${d!.id}, ${'P'}, ${'P'}, ${'lisans'}) returning id`;
    const [cv] = await admin<{ id: string }[]>`insert into curriculum_versions (tenant_id, program_id, year, name) values (${tenantId}, ${p!.id}, ${2023}, ${'v'}) returning id`;
    const [u] = await admin<{ id: string }[]>`insert into users (tenant_id, email, password_hash) values (${tenantId}, ${`s@${tag}.t`}, ${'x'}) returning id`;
    student.userId = u!.id;
    const [s] = await admin<{ id: string }[]>`insert into students (tenant_id, user_id, program_id, curriculum_version_id, student_no, status) values (${tenantId}, ${u!.id}, ${p!.id}, ${cv!.id}, ${'1'}, ${'aktif'}) returning id`;
    student.id = s!.id;
  }, 30000);

  afterAll(async () => {
    for (const table of ['audit_log', 'notifications', 'requests', 'students', 'users', 'curriculum_versions', 'programs', 'departments', 'faculties']) {
      await admin.unsafe(`delete from ${table} where tenant_id = $1`, [tenantId]).catch(() => undefined);
    }
    await admin`delete from tenants where id = ${tenantId}`;
    await admin.end();
    await handle.client.end();
  });

  const asStudent = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithTenantStore({ tenantId, actorUserId: student.userId, roles: ['ogrenci'] }, fn);
  const asOidb = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithTenantStore({ tenantId, roles: ['oidb'] }, fn);

  it('öğrenci talep açar -> ÖİDB inceler -> onaylar; audit + bildirim', async () => {
    const { requestId } = await asStudent(() =>
      service.create(student.id, 'kayit_dondurma', { reason: 'askerlik' }),
    );
    await asOidb(() => service.transition(requestId, 'in_review'));
    const { status } = await asOidb(() => service.transition(requestId, 'approved', 'uygun'));
    expect(status).toBe('approved');

    const audit = await admin<{ action: string }[]>`select action from audit_log where resource_id = ${requestId}`;
    expect(audit.map((a) => a.action)).toContain('request.onayla');

    const notif = await admin<{ n: number }[]>`select count(*)::int as n from notifications where user_id = ${student.userId}`;
    expect(notif[0]!.n).toBeGreaterThan(0);
  });

  it('geçersiz geçiş (submitted->approved) 409', async () => {
    const { requestId } = await asStudent(() => service.create(student.id, 'belge', null));
    await expect(asOidb(() => service.transition(requestId, 'approved'))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('öğrenci kendi talebini iptal edebilir', async () => {
    const { requestId } = await asStudent(() => service.create(student.id, 'diger', null));
    const { status } = await asStudent(() => service.transition(requestId, 'cancelled'));
    expect(status).toBe('cancelled');
  });
});
