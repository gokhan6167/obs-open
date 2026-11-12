import { ConflictException, ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDb, type DbHandle } from '../db/client.js';
import { runWithTenantStore } from '../db/tenant-context.js';
import { GpaService } from '../grades/gpa.service.js';
import { ParametersService } from '../parameters/parameters.service.js';
import { StudentsService } from './students.service.js';

/**
 * Amiral gemisi entegrasyon testi: öğrenci durum geçişi tüm yığını doğrular —
 * durum makinesi (academic-core) + RBAC (authorize) + audit + tenant/RLS.
 */
const MIGRATE_URL =
  process.env.DATABASE_MIGRATE_URL ?? 'postgres://obs:obs_dev_password@localhost:5432/obs';
const APP_URL =
  process.env.DATABASE_URL ?? 'postgres://obs_app:obs_app_dev_password@localhost:5432/obs';

describe('StudentsService.changeStatus (entegrasyon)', () => {
  const admin = postgres(MIGRATE_URL, { max: 1 });
  const handle: DbHandle = createDb(APP_URL, 2);
  const gpa = new GpaService(handle, new ParametersService(handle));
  const service = new StudentsService(handle, gpa);
  const tag = `st_${Date.now()}`;

  let tenantId = '';
  let studentId = '';
  const oidbUserId = crypto.randomUUID();

  beforeAll(async () => {
    const [t] = await admin<{ id: string }[]>`
      insert into tenants (slug, name) values (${tag}, ${'T'}) returning id`;
    tenantId = t!.id;
    const [f] = await admin<{ id: string }[]>`
      insert into faculties (tenant_id, code, name) values (${tenantId}, ${'F1'}, ${'Fak'}) returning id`;
    const [d] = await admin<{ id: string }[]>`
      insert into departments (tenant_id, faculty_id, code, name)
      values (${tenantId}, ${f!.id}, ${'D1'}, ${'Böl'}) returning id`;
    const [p] = await admin<{ id: string }[]>`
      insert into programs (tenant_id, department_id, code, name, level)
      values (${tenantId}, ${d!.id}, ${'P1'}, ${'Prog'}, ${'lisans'}) returning id`;
    const [cv] = await admin<{ id: string }[]>`
      insert into curriculum_versions (tenant_id, program_id, year, name)
      values (${tenantId}, ${p!.id}, ${2023}, ${'2023'}) returning id`;
    const [u] = await admin<{ id: string }[]>`
      insert into users (tenant_id, email, password_hash)
      values (${tenantId}, ${`s@${tag}.test`}, ${'x'}) returning id`;
    const [s] = await admin<{ id: string }[]>`
      insert into students (tenant_id, user_id, program_id, curriculum_version_id, student_no, status)
      values (${tenantId}, ${u!.id}, ${p!.id}, ${cv!.id}, ${'2023001'}, ${'aktif'}) returning id`;
    studentId = s!.id;
  });

  afterAll(async () => {
    await admin`delete from audit_log where tenant_id = ${tenantId}`.catch(() => undefined);
    await admin`delete from students where tenant_id = ${tenantId}`;
    await admin`delete from users where tenant_id = ${tenantId}`;
    await admin`delete from curriculum_versions where tenant_id = ${tenantId}`;
    await admin`delete from programs where tenant_id = ${tenantId}`;
    await admin`delete from departments where tenant_id = ${tenantId}`;
    await admin`delete from faculties where tenant_id = ${tenantId}`;
    await admin`delete from tenants where id = ${tenantId}`;
    await admin.end();
    await handle.client.end();
  });

  function asOidb<T>(fn: () => Promise<T>): Promise<T> {
    return runWithTenantStore({ tenantId, actorUserId: oidbUserId, roles: ['oidb'] }, fn);
  }

  it('ÖİDB geçerli geçişi uygular ve audit yazar', async () => {
    const res = await asOidb(() => service.changeStatus(studentId, 'kayit_dondurma', 'askerlik'));
    expect(res.status).toBe('kayit_dondurma');

    const audit = await admin<{ action: string; diff: unknown }[]>`
      select action, diff from audit_log where resource_id = ${studentId} order by at desc limit 1`;
    expect(audit[0]?.action).toBe('student.kayit_dondur');
  });

  it('geçersiz geçiş ConflictException', async () => {
    // kayit_dondurma -> af_ogrencisi tanımsız
    await expect(asOidb(() => service.changeStatus(studentId, 'af_ogrencisi'))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('yetkisiz rol (öğrenci) ForbiddenException', async () => {
    await expect(
      runWithTenantStore({ tenantId, actorUserId: oidbUserId, roles: ['ogrenci'] }, () =>
        service.changeStatus(studentId, 'aktif'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
