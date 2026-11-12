import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDb, type DbHandle } from '../db/client.js';
import { runWithTenantStore } from '../db/tenant-context.js';
import { ParametersService } from '../parameters/parameters.service.js';
import { GpaService } from './gpa.service.js';

/** GNO bağlama: ilan notlarından ağırlıklı ortalama (parametre DB'den). */
const MIGRATE_URL =
  process.env.DATABASE_MIGRATE_URL ?? 'postgres://obs:obs_dev_password@localhost:5432/obs';
const APP_URL =
  process.env.DATABASE_URL ?? 'postgres://obs_app:obs_app_dev_password@localhost:5432/obs';

describe('GpaService.computeStudentGpa (entegrasyon)', () => {
  const admin = postgres(MIGRATE_URL, { max: 1 });
  const handle: DbHandle = createDb(APP_URL, 3);
  const service = new GpaService(handle, new ParametersService(handle));
  const tag = `gpa_${Date.now()}`;

  let tenantId = '';
  let programId = '';
  let studentId = '';

  beforeAll(async () => {
    const [t] = await admin<{ id: string }[]>`insert into tenants (slug, name) values (${tag}, ${'T'}) returning id`;
    tenantId = t!.id;
    const [f] = await admin<{ id: string }[]>`insert into faculties (tenant_id, code, name) values (${tenantId}, ${'F'}, ${'F'}) returning id`;
    const [d] = await admin<{ id: string }[]>`insert into departments (tenant_id, faculty_id, code, name) values (${tenantId}, ${f!.id}, ${'D'}, ${'D'}) returning id`;
    const [p] = await admin<{ id: string }[]>`insert into programs (tenant_id, department_id, code, name, level) values (${tenantId}, ${d!.id}, ${'P'}, ${'P'}, ${'lisans'}) returning id`;
    programId = p!.id;
    const [cv] = await admin<{ id: string }[]>`insert into curriculum_versions (tenant_id, program_id, year, name) values (${tenantId}, ${p!.id}, ${2023}, ${'v'}) returning id`;
    const [term] = await admin<{ id: string }[]>`insert into academic_terms (tenant_id, year, term, name, starts_on, ends_on) values (${tenantId}, ${2024}, ${'guz'}, ${'g'}, ${'2024-09-16'}, ${'2025-01-17'}) returning id`;
    const [u] = await admin<{ id: string }[]>`insert into users (tenant_id, email, password_hash) values (${tenantId}, ${`s@${tag}.t`}, ${'x'}) returning id`;
    const [s] = await admin<{ id: string }[]>`insert into students (tenant_id, user_id, program_id, curriculum_version_id, student_no, status) values (${tenantId}, ${u!.id}, ${p!.id}, ${cv!.id}, ${'1'}, ${'aktif'}) returning id`;
    studentId = s!.id;

    // GNO politikası (son not / 2 hane half-up).
    await admin`insert into gpa_policies (tenant_id, repeat_policy, rounding_digits, rounding_mode, effective_from)
      values (${tenantId}, ${'last'}, ${2}, ${'half-up'}, ${'2023-09-01'})`;

    // İki ders + şube + ilan notu: (4.0*6 + 3.0*4)/10 = 3.6
    const grades = [
      { code: 'A', ects: 6, coef: 4.0, letter: 'AA' },
      { code: 'B', ects: 4, coef: 3.0, letter: 'BB' },
    ];
    for (const g of grades) {
      const [c] = await admin<{ id: string }[]>`insert into courses (tenant_id, code, name_tr, ects, local_credit) values (${tenantId}, ${g.code}, ${g.code}, ${g.ects}, ${g.ects}) returning id`;
      const [sec] = await admin<{ id: string }[]>`insert into sections (tenant_id, course_id, term_id, code, quota) values (${tenantId}, ${c!.id}, ${term!.id}, ${'01'}, ${50}) returning id`;
      await admin`insert into grades (tenant_id, student_id, section_id, term_id, raw_score, letter, coefficient, status)
        values (${tenantId}, ${studentId}, ${sec!.id}, ${term!.id}, ${90}, ${g.letter}, ${g.coef}, ${'announced'})`;
    }
  }, 30000);

  afterAll(async () => {
    for (const table of [
      'grades',
      'sections',
      'courses',
      'gpa_policies',
      'students',
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

  it('ilan notlarından GNO = 3.6', async () => {
    const result = await runWithTenantStore({ tenantId, roles: ['oidb'] }, () =>
      service.computeStudentGpa(studentId, programId, '2024-10-01'),
    );
    expect(result.gpa).toBe(3.6);
    expect(result.totalCredit).toBe(10);
  });
});
