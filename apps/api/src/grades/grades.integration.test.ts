import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDb, type DbHandle } from '../db/client.js';
import { runWithTenantStore } from '../db/tenant-context.js';
import { GradesService } from './grades.service.js';

/**
 * FLAGSHIP: "sessiz not değişikliği teknik olarak imkânsız" (§M4).
 * İlan sonrası doğrudan içerik değişimi DB trigger'ıyla reddedilir; değişim
 * yalnızca düzeltme akışıyla (karar no + gerekçe + audit) mümkün.
 */
const MIGRATE_URL =
  process.env.DATABASE_MIGRATE_URL ?? 'postgres://obs:obs_dev_password@localhost:5432/obs';
const APP_URL =
  process.env.DATABASE_URL ?? 'postgres://obs_app:obs_app_dev_password@localhost:5432/obs';

describe('GradesService — sessiz değişiklik imkânsız', () => {
  const admin = postgres(MIGRATE_URL, { max: 1 });
  const app = postgres(APP_URL, { max: 1 });
  const handle: DbHandle = createDb(APP_URL, 3);
  const service = new GradesService(handle);
  const tag = `grd_${Date.now()}`;

  let tenantId = '';
  let sectionId = '';
  let termId = '';
  let studentId = '';

  beforeAll(async () => {
    const [t] = await admin<{ id: string }[]>`insert into tenants (slug, name) values (${tag}, ${'T'}) returning id`;
    tenantId = t!.id;
    const [f] = await admin<{ id: string }[]>`insert into faculties (tenant_id, code, name) values (${tenantId}, ${'F'}, ${'F'}) returning id`;
    const [d] = await admin<{ id: string }[]>`insert into departments (tenant_id, faculty_id, code, name) values (${tenantId}, ${f!.id}, ${'D'}, ${'D'}) returning id`;
    const [p] = await admin<{ id: string }[]>`insert into programs (tenant_id, department_id, code, name, level) values (${tenantId}, ${d!.id}, ${'P'}, ${'P'}, ${'lisans'}) returning id`;
    const [cv] = await admin<{ id: string }[]>`insert into curriculum_versions (tenant_id, program_id, year, name) values (${tenantId}, ${p!.id}, ${2023}, ${'v'}) returning id`;
    const [c] = await admin<{ id: string }[]>`insert into courses (tenant_id, code, name_tr, ects, local_credit) values (${tenantId}, ${'C'}, ${'D'}, ${6}, ${4}) returning id`;
    const [term] = await admin<{ id: string }[]>`insert into academic_terms (tenant_id, year, term, name, starts_on, ends_on) values (${tenantId}, ${2024}, ${'guz'}, ${'g'}, ${'2024-09-16'}, ${'2025-01-17'}) returning id`;
    termId = term!.id;
    const [sec] = await admin<{ id: string }[]>`insert into sections (tenant_id, course_id, term_id, code, quota) values (${tenantId}, ${c!.id}, ${term!.id}, ${'01'}, ${5}) returning id`;
    sectionId = sec!.id;
    const [u] = await admin<{ id: string }[]>`insert into users (tenant_id, email, password_hash) values (${tenantId}, ${`s@${tag}.t`}, ${'x'}) returning id`;
    const [s] = await admin<{ id: string }[]>`insert into students (tenant_id, user_id, program_id, curriculum_version_id, student_no, status) values (${tenantId}, ${u!.id}, ${p!.id}, ${cv!.id}, ${'1'}, ${'aktif'}) returning id`;
    studentId = s!.id;
  }, 30000);

  afterAll(async () => {
    for (const table of [
      'audit_log',
      'grade_corrections',
      'grades',
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
    await app.end();
    await handle.client.end();
  });

  const asOidb = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithTenantStore({ tenantId, roles: ['oidb'] }, fn);

  let gradeId = '';

  it('taslak not gir + ilan et', async () => {
    const g = await asOidb(() =>
      service.setDraftGrade({
        studentId,
        sectionId,
        termId,
        rawScore: 55,
        letter: 'DD',
        coefficient: 1.0,
      }),
    );
    gradeId = g.id;
    await asOidb(() => service.transition(gradeId, 'announced'));
    const [row] = await admin<{ status: string; letter: string }[]>`select status, letter from grades where id = ${gradeId}`;
    expect(row!.status).toBe('announced');
    expect(row!.letter).toBe('DD');
  });

  it('ilan sonrası taslak yazımı reddedilir (409)', async () => {
    await expect(
      asOidb(() =>
        service.setDraftGrade({ studentId, sectionId, termId, rawScore: 95, letter: 'AA', coefficient: 4 }),
      ),
    ).rejects.toThrow();
  });

  it('DOĞRUDAN DB güncellemesi trigger ile reddedilir (sessiz değişiklik yasak)', async () => {
    await expect(
      app.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenantId}, true)`;
        await tx`update grades set letter = ${'AA'} where id = ${gradeId}`;
      }),
    ).rejects.toThrow();
    // Not değişmedi.
    const [row] = await admin<{ letter: string }[]>`select letter from grades where id = ${gradeId}`;
    expect(row!.letter).toBe('DD');
  });

  it('düzeltme akışı: karar no + gerekçe ile değişir + audit', async () => {
    await asOidb(() =>
      service.applyCorrection({
        gradeId,
        newLetter: 'CC',
        newRaw: 65,
        newCoefficient: 2.0,
        reason: 'maddi hata',
        decisionNo: 'YK-2025/42',
      }),
    );
    const [row] = await admin<{ letter: string }[]>`select letter from grades where id = ${gradeId}`;
    expect(row!.letter).toBe('CC');

    const [corr] = await admin<{ decision_no: string }[]>`select decision_no from grade_corrections where grade_id = ${gradeId}`;
    expect(corr!.decision_no).toBe('YK-2025/42');

    const audit = await admin<{ action: string }[]>`select action from audit_log where resource_id = ${gradeId}`;
    expect(audit.map((a) => a.action)).toContain('grade.duzeltme');
  });

  it('gerekçesiz düzeltme reddedilir', async () => {
    await expect(
      asOidb(() =>
        service.applyCorrection({
          gradeId,
          newLetter: 'BB',
          newRaw: 80,
          newCoefficient: 3,
          reason: '  ',
          decisionNo: '',
        }),
      ),
    ).rejects.toThrow();
  });
});
