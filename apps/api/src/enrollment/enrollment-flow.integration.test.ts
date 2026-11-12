import { ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDb, type DbHandle } from '../db/client.js';
import { runWithTenantStore } from '../db/tenant-context.js';
import { GpaService } from '../grades/gpa.service.js';
import { ParametersService } from '../parameters/parameters.service.js';
import { EnrollmentService } from './enrollment.service.js';

/** Danışman onay akışı + koltuk iadesi entegrasyon testi. */
const MIGRATE_URL =
  process.env.DATABASE_MIGRATE_URL ?? 'postgres://obs:obs_dev_password@localhost:5432/obs';
const APP_URL =
  process.env.DATABASE_URL ?? 'postgres://obs_app:obs_app_dev_password@localhost:5432/obs';

describe('Kayıt onay akışı (entegrasyon)', () => {
  const admin = postgres(MIGRATE_URL, { max: 1 });
  const handle: DbHandle = createDb(APP_URL, 3);
  const params = new ParametersService(handle);
  const service = new EnrollmentService(handle, new GpaService(handle, params), params);
  const tag = `flow_${Date.now()}`;

  let tenantId = '';
  let sectionId = '';
  const student = { id: '', userId: '' };

  beforeAll(async () => {
    const [t] = await admin<{ id: string }[]>`insert into tenants (slug, name) values (${tag}, ${'T'}) returning id`;
    tenantId = t!.id;
    const [f] = await admin<{ id: string }[]>`insert into faculties (tenant_id, code, name) values (${tenantId}, ${'F'}, ${'F'}) returning id`;
    const [d] = await admin<{ id: string }[]>`insert into departments (tenant_id, faculty_id, code, name) values (${tenantId}, ${f!.id}, ${'D'}, ${'D'}) returning id`;
    const [p] = await admin<{ id: string }[]>`insert into programs (tenant_id, department_id, code, name, level) values (${tenantId}, ${d!.id}, ${'P'}, ${'P'}, ${'lisans'}) returning id`;
    const [cv] = await admin<{ id: string }[]>`insert into curriculum_versions (tenant_id, program_id, year, name) values (${tenantId}, ${p!.id}, ${2023}, ${'v'}) returning id`;
    const [c] = await admin<{ id: string }[]>`insert into courses (tenant_id, code, name_tr, ects, local_credit) values (${tenantId}, ${'C'}, ${'D'}, ${6}, ${4}) returning id`;
    const [term] = await admin<{ id: string }[]>`insert into academic_terms (tenant_id, year, term, name, starts_on, ends_on) values (${tenantId}, ${2024}, ${'guz'}, ${'g'}, ${'2024-09-16'}, ${'2025-01-17'}) returning id`;
    const [sec] = await admin<{ id: string }[]>`insert into sections (tenant_id, course_id, term_id, code, quota) values (${tenantId}, ${c!.id}, ${term!.id}, ${'01'}, ${5}) returning id`;
    sectionId = sec!.id;
    const [u] = await admin<{ id: string }[]>`insert into users (tenant_id, email, password_hash) values (${tenantId}, ${`s@${tag}.t`}, ${'x'}) returning id`;
    student.userId = u!.id;
    const [s] = await admin<{ id: string }[]>`insert into students (tenant_id, user_id, program_id, curriculum_version_id, student_no, status) values (${tenantId}, ${u!.id}, ${p!.id}, ${cv!.id}, ${'1'}, ${'aktif'}) returning id`;
    student.id = s!.id;
  }, 30000);

  afterAll(async () => {
    for (const table of [
      'audit_log',
      'enrollments',
      'sections',
      'students',
      'courses',
      'academic_terms',
      'users',
      'curriculum_versions',
      'programs',
      'departments',
      'faculties',
    ]) {
      await admin.unsafe(`delete from ${table} where tenant_id = $1`, [tenantId]).catch(() => undefined);
    }
    await admin`delete from tenants where id = ${tenantId}`;
    await admin.end();
    await handle.client.end();
  });

  const asOidb = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithTenantStore({ tenantId, actorUserId: student.userId, roles: ['oidb'] }, fn);
  const asStudent = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithTenantStore({ tenantId, actorUserId: student.userId, roles: ['ogrenci'] }, fn);

  it('enroll(draft) -> gönder -> danışman onay + audit', async () => {
    const { enrollmentId } = await asOidb(() => service.enroll(student.id, sectionId));

    await asStudent(() => service.transition(enrollmentId, 'submitted'));
    const approved = await asOidb(() => service.transition(enrollmentId, 'approved'));
    expect(approved.action).toBe('danisman_onayla');

    const audit = await admin<{ action: string }[]>`
      select action from audit_log where resource_id = ${enrollmentId} order by at`;
    expect(audit.map((a) => a.action)).toContain('enrollment.danisman_onayla');
  });

  it('başka öğrenci adına kayıt engellenir (IDOR -> 403)', async () => {
    await expect(
      runWithTenantStore({ tenantId, actorUserId: crypto.randomUUID(), roles: ['ogrenci'] }, () =>
        service.enroll(student.id, sectionId),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ret koltuğu iade eder (filled azalır)', async () => {
    const [u2] = await admin<{ id: string }[]>`insert into users (tenant_id, email, password_hash) values (${tenantId}, ${`s2@${tag}.t`}, ${'x'}) returning id`;
    const [s2] = await admin<{ id: string }[]>`insert into students (tenant_id, user_id, program_id, curriculum_version_id, student_no, status) select ${tenantId}, ${u2!.id}, program_id, curriculum_version_id, ${'2'}, ${'aktif'} from students where id = ${student.id} returning id`;

    const before = await admin<{ filled: number }[]>`select filled from sections where id = ${sectionId}`;
    const { enrollmentId } = await asOidb(() => service.enroll(s2!.id, sectionId));
    const afterEnroll = await admin<{ filled: number }[]>`select filled from sections where id = ${sectionId}`;
    expect(afterEnroll[0]!.filled).toBe(before[0]!.filled + 1);

    await asOidb(() => service.transition(enrollmentId, 'submitted'));
    await asOidb(() => service.transition(enrollmentId, 'rejected', 'ön koşul yok'));
    const afterReject = await admin<{ filled: number }[]>`select filled from sections where id = ${sectionId}`;
    expect(afterReject[0]!.filled).toBe(before[0]!.filled);
  });
});
