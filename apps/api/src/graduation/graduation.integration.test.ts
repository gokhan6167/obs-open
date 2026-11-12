import { ForbiddenException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDb, type DbHandle } from '../db/client.js';
import { runWithTenantStore } from '../db/tenant-context.js';
import { GpaService } from '../grades/gpa.service.js';
import { ParametersService } from '../parameters/parameters.service.js';
import { GraduationService } from './graduation.service.js';

/** Mezuniyet motoru: "ne kaldı" + onay -> mezun + diploma no. */
const MIGRATE_URL =
  process.env.DATABASE_MIGRATE_URL ?? 'postgres://obs:obs_dev_password@localhost:5432/obs';
const APP_URL =
  process.env.DATABASE_URL ?? 'postgres://obs_app:obs_app_dev_password@localhost:5432/obs';

describe('GraduationService (entegrasyon)', () => {
  const admin = postgres(MIGRATE_URL, { max: 1 });
  const handle: DbHandle = createDb(APP_URL, 3);
  const params = new ParametersService(handle);
  const service = new GraduationService(handle, new GpaService(handle, params), params);
  const tag = `grad_${Date.now()}`;

  let tenantId = '';
  let studentId = '';

  beforeAll(async () => {
    const [t] = await admin<{ id: string }[]>`insert into tenants (slug, name) values (${tag}, ${'T'}) returning id`;
    tenantId = t!.id;
    const [f] = await admin<{ id: string }[]>`insert into faculties (tenant_id, code, name) values (${tenantId}, ${'F'}, ${'F'}) returning id`;
    const [d] = await admin<{ id: string }[]>`insert into departments (tenant_id, faculty_id, code, name) values (${tenantId}, ${f!.id}, ${'D'}, ${'D'}) returning id`;
    const [p] = await admin<{ id: string }[]>`insert into programs (tenant_id, department_id, code, name, level) values (${tenantId}, ${d!.id}, ${'HEM'}, ${'Hemsirelik'}, ${'lisans'}) returning id`;
    const [cv] = await admin<{ id: string }[]>`insert into curriculum_versions (tenant_id, program_id, year, name) values (${tenantId}, ${p!.id}, ${2023}, ${'v'}) returning id`;
    const [term] = await admin<{ id: string }[]>`insert into academic_terms (tenant_id, year, term, name, starts_on, ends_on) values (${tenantId}, ${2024}, ${'guz'}, ${'g'}, ${'2024-09-16'}, ${'2025-01-17'}) returning id`;
    const [u] = await admin<{ id: string }[]>`insert into users (tenant_id, email, password_hash) values (${tenantId}, ${`s@${tag}.t`}, ${'x'}) returning id`;
    const [s] = await admin<{ id: string }[]>`insert into students (tenant_id, user_id, program_id, curriculum_version_id, student_no, status) values (${tenantId}, ${u!.id}, ${p!.id}, ${cv!.id}, ${'1'}, ${'aktif'}) returning id`;
    studentId = s!.id;

    await admin`insert into gpa_policies (tenant_id, repeat_policy, rounding_digits, rounding_mode, effective_from) values (${tenantId}, ${'last'}, ${2}, ${'half-up'}, ${'2023-09-01'})`;
    await admin`insert into academic_rule_sets (tenant_id, rules, effective_from) values (${tenantId}, ${JSON.stringify({ minEctsPerTerm: 30, maxEctsPerTerm: 45, maxAbsenceTheoryPct: 30, maxAbsencePracticePct: 20, minGraduationGpa: 2.0 })}, ${'2023-09-01'})`;

    // 2 zorunlu ders (AKTS 6+4=10) müfredatta.
    for (const c of [
      { code: 'HEM101', ects: 6 },
      { code: 'HEM102', ects: 4 },
    ]) {
      const [course] = await admin<{ id: string }[]>`insert into courses (tenant_id, code, name_tr, ects, local_credit) values (${tenantId}, ${c.code}, ${c.code}, ${c.ects}, ${c.ects}) returning id`;
      await admin`insert into curriculum_courses (tenant_id, curriculum_version_id, course_id, semester_no, is_mandatory) values (${tenantId}, ${cv!.id}, ${course!.id}, ${1}, ${true})`;
      await admin`insert into sections (tenant_id, course_id, term_id, code, quota) values (${tenantId}, ${course!.id}, ${term!.id}, ${'01'}, ${50})`;
    }
  }, 30000);

  afterAll(async () => {
    for (const table of ['audit_log', 'grades', 'sections', 'curriculum_courses', 'courses', 'academic_rule_sets', 'gpa_policies', 'document_counters', 'students', 'academic_terms', 'users', 'curriculum_versions', 'programs', 'departments', 'faculties']) {
      await admin.unsafe(`delete from ${table} where tenant_id = $1`, [tenantId]).catch(() => undefined);
    }
    await admin`delete from tenants where id = ${tenantId}`;
    await admin.end();
    await handle.client.end();
  });

  const asOidb = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithTenantStore({ tenantId, roles: ['oidb'] }, fn);

  it('notsuz öğrenci -> tamamlanmamış, eksik zorunlu dersler listelenir', async () => {
    const st = await asOidb(() => service.checkGraduation(studentId, '2025-06-01'));
    expect(st.completion.isComplete).toBe(false);
    expect(st.completion.missingMandatory.sort()).toEqual(['HEM101', 'HEM102']);
  });

  it('başka öğrenci mezuniyet durumunu göremez (IDOR -> 403)', async () => {
    await expect(
      runWithTenantStore({ tenantId, actorUserId: crypto.randomUUID(), roles: ['ogrenci'] }, () =>
        service.checkGraduation(studentId, '2025-06-01'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('onay koşul sağlanmadan reddedilir (409)', async () => {
    await expect(asOidb(() => service.approveGraduation(studentId, '2025-06-01'))).rejects.toThrow();
  });

  it('tüm zorunlular geçilince mezun + diploma no', async () => {
    // AA notları ekle (announced).
    const secRows = await admin<{ id: string }[]>`select id from sections where tenant_id = ${tenantId}`;
    const [term] = await admin<{ id: string }[]>`select id from academic_terms where tenant_id = ${tenantId}`;
    for (const sec of secRows) {
      await admin`insert into grades (tenant_id, student_id, section_id, term_id, raw_score, letter, coefficient, status) values (${tenantId}, ${studentId}, ${sec.id}, ${term!.id}, ${95}, ${'AA'}, ${4.0}, ${'announced'})`;
    }

    const st = await asOidb(() => service.checkGraduation(studentId, '2025-06-01'));
    expect(st.completion.isComplete).toBe(true);

    const res = await asOidb(() => service.approveGraduation(studentId, '2025-06-01'));
    expect(res.status).toBe('mezun');
    expect(res.diplomaNo).toMatch(/^HEM-2025-\d{5}$/);

    const [row] = await admin<{ status: string }[]>`select status from students where id = ${studentId}`;
    expect(row!.status).toBe('mezun');
  });
});
