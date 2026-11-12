import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDb, type DbHandle } from '../db/client.js';
import { runWithTenantStore } from '../db/tenant-context.js';
import { GpaService } from '../grades/gpa.service.js';
import { ParametersService } from '../parameters/parameters.service.js';
import { DoubleMajorService } from './double-major.service.js';

/** ÇAP/yandal: uygunluk (sunucu-türetimli dönem) + komisyon durum makinesi. */
const MIGRATE_URL =
  process.env.DATABASE_MIGRATE_URL ?? 'postgres://obs:obs_dev_password@localhost:5432/obs';
const APP_URL =
  process.env.DATABASE_URL ?? 'postgres://obs_app:obs_app_dev_password@localhost:5432/obs';

describe('DoubleMajorService (entegrasyon)', () => {
  const admin = postgres(MIGRATE_URL, { max: 1 });
  const handle: DbHandle = createDb(APP_URL, 3);
  const params = new ParametersService(handle);
  const service = new DoubleMajorService(handle, new GpaService(handle, params));
  const tag = `dm_${Date.now()}`;
  let tenantId = '';
  let eligibleStudent = '';
  let freshStudent = '';
  let targetProgramId = '';

  beforeAll(async () => {
    const [t] = await admin<{ id: string }[]>`insert into tenants (slug, name) values (${tag}, ${'T'}) returning id`;
    tenantId = t!.id;
    const [f] = await admin<{ id: string }[]>`insert into faculties (tenant_id, code, name) values (${tenantId}, ${'F'}, ${'F'}) returning id`;
    const [d] = await admin<{ id: string }[]>`insert into departments (tenant_id, faculty_id, code, name) values (${tenantId}, ${f!.id}, ${'D'}, ${'D'}) returning id`;
    const [p] = await admin<{ id: string }[]>`insert into programs (tenant_id, department_id, code, name, level) values (${tenantId}, ${d!.id}, ${'P1'}, ${'Ana'}, ${'lisans'}) returning id`;
    const [p2] = await admin<{ id: string }[]>`insert into programs (tenant_id, department_id, code, name, level) values (${tenantId}, ${d!.id}, ${'P2'}, ${'Hedef'}, ${'lisans'}) returning id`;
    targetProgramId = p2!.id;
    const [cv] = await admin<{ id: string }[]>`insert into curriculum_versions (tenant_id, program_id, year, name) values (${tenantId}, ${p!.id}, ${2023}, ${'v'}) returning id`;
    await admin`insert into gpa_policies (tenant_id, repeat_policy, rounding_digits, rounding_mode, effective_from) values (${tenantId}, ${'last'}, ${2}, ${'half-up'}, ${'2023-09-01'})`;
    const [c] = await admin<{ id: string }[]>`insert into courses (tenant_id, code, name_tr, ects, local_credit) values (${tenantId}, ${'C'}, ${'C'}, ${6}, ${4}) returning id`;

    // İki dönem (uygun öğrenci ikisinde de not alır -> 2 tamamlanmış dönem).
    const [term1] = await admin<{ id: string }[]>`insert into academic_terms (tenant_id, year, term, name, starts_on, ends_on) values (${tenantId}, ${2023}, ${'guz'}, ${'g23'}, ${'2023-09-16'}, ${'2024-01-17'}) returning id`;
    const [term2] = await admin<{ id: string }[]>`insert into academic_terms (tenant_id, year, term, name, starts_on, ends_on) values (${tenantId}, ${2024}, ${'guz'}, ${'g24'}, ${'2024-09-16'}, ${'2025-01-17'}) returning id`;
    const [sec1] = await admin<{ id: string }[]>`insert into sections (tenant_id, course_id, term_id, code, quota) values (${tenantId}, ${c!.id}, ${term1!.id}, ${'01'}, ${50}) returning id`;
    const [sec2] = await admin<{ id: string }[]>`insert into sections (tenant_id, course_id, term_id, code, quota) values (${tenantId}, ${c!.id}, ${term2!.id}, ${'01'}, ${50}) returning id`;

    // Uygun öğrenci: 2 dönemde AA (GNO 4.0, tamamlanan dönem 2/8 = %25).
    const [u1] = await admin<{ id: string }[]>`insert into users (tenant_id, email, password_hash) values (${tenantId}, ${`a@${tag}.t`}, ${'x'}) returning id`;
    const [s1] = await admin<{ id: string }[]>`insert into students (tenant_id, user_id, program_id, curriculum_version_id, student_no, status) values (${tenantId}, ${u1!.id}, ${p!.id}, ${cv!.id}, ${'1'}, ${'aktif'}) returning id`;
    eligibleStudent = s1!.id;
    await admin`insert into grades (tenant_id, student_id, section_id, term_id, raw_score, letter, coefficient, status) values (${tenantId}, ${eligibleStudent}, ${sec1!.id}, ${term1!.id}, ${95}, ${'AA'}, ${4.0}, ${'announced'})`;
    await admin`insert into grades (tenant_id, student_id, section_id, term_id, raw_score, letter, coefficient, status) values (${tenantId}, ${eligibleStudent}, ${sec2!.id}, ${term2!.id}, ${95}, ${'AA'}, ${4.0}, ${'announced'})`;

    // Uygunsuz öğrenci: notsuz (0 dönem -> çok erken + GNO 0).
    const [u2] = await admin<{ id: string }[]>`insert into users (tenant_id, email, password_hash) values (${tenantId}, ${`b@${tag}.t`}, ${'x'}) returning id`;
    const [s2] = await admin<{ id: string }[]>`insert into students (tenant_id, user_id, program_id, curriculum_version_id, student_no, status) values (${tenantId}, ${u2!.id}, ${p!.id}, ${cv!.id}, ${'2'}, ${'aktif'}) returning id`;
    freshStudent = s2!.id;
  }, 30000);

  afterAll(async () => {
    for (const table of ['audit_log', 'double_major_applications', 'grades', 'sections', 'gpa_policies', 'courses', 'students', 'academic_terms', 'users', 'curriculum_versions', 'programs', 'departments', 'faculties']) {
      await admin.unsafe(`delete from ${table} where tenant_id = $1`, [tenantId]).catch(() => undefined);
    }
    await admin`delete from tenants where id = ${tenantId}`;
    await admin.end();
    await handle.client.end();
  });

  const asOidb = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithTenantStore({ tenantId, roles: ['oidb'] }, fn);

  let appId = '';

  it('uygun öğrenci ÇAP başvurusu -> submitted', async () => {
    const r = await asOidb(() => service.apply(eligibleStudent, 'cap', targetProgramId, '2025-06-01'));
    appId = r.applicationId;
    expect(r.status).toBe('submitted');
  });

  it('uygunsuz öğrenci (notsuz) -> 409', async () => {
    await expect(
      asOidb(() => service.apply(freshStudent, 'cap', targetProgramId, '2025-06-01')),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('komisyon: incele -> onayla + audit', async () => {
    await asOidb(() => service.transition(appId, 'in_review'));
    const r = await asOidb(() => service.transition(appId, 'approved', 'uygun'));
    expect(r.status).toBe('approved');
    const audit = await admin<{ action: string }[]>`select action from audit_log where resource_id = ${appId}`;
    expect(audit.map((a) => a.action)).toContain('double_major.onayla');
  });
});
