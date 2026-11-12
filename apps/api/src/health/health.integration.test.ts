import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDb, type DbHandle } from '../db/client.js';
import { runWithTenantStore } from '../db/tenant-context.js';
import { HealthService } from './health.service.js';
import { MockSgkProvider } from './sgk.provider.js';

/** Sağlık modülü: kurul yıl notu (eğitim modeli) + grup dönüşümlü rotasyon. */
const MIGRATE_URL =
  process.env.DATABASE_MIGRATE_URL ?? 'postgres://obs:obs_dev_password@localhost:5432/obs';
const APP_URL =
  process.env.DATABASE_URL ?? 'postgres://obs_app:obs_app_dev_password@localhost:5432/obs';

describe('HealthService (entegrasyon)', () => {
  const admin = postgres(MIGRATE_URL, { max: 1 });
  const handle: DbHandle = createDb(APP_URL, 3);
  const service = new HealthService(handle, new MockSgkProvider());
  const tag = `hlt_${Date.now()}`;

  let tenantId = '';
  let termId = '';
  let programId = '';
  const studentIds: string[] = [];

  beforeAll(async () => {
    const [t] = await admin<{ id: string }[]>`insert into tenants (slug, name) values (${tag}, ${'T'}) returning id`;
    tenantId = t!.id;
    const [f] = await admin<{ id: string }[]>`insert into faculties (tenant_id, code, name) values (${tenantId}, ${'TIP'}, ${'Tip'}) returning id`;
    const [d] = await admin<{ id: string }[]>`insert into departments (tenant_id, faculty_id, code, name) values (${tenantId}, ${f!.id}, ${'D'}, ${'D'}) returning id`;
    const [p] = await admin<{ id: string }[]>`insert into programs (tenant_id, department_id, code, name, level, education_model) values (${tenantId}, ${d!.id}, ${'TIP'}, ${'Tip'}, ${'lisans'}, ${'committee'}) returning id`;
    programId = p!.id;
    const [cv] = await admin<{ id: string }[]>`insert into curriculum_versions (tenant_id, program_id, year, name) values (${tenantId}, ${p!.id}, ${2023}, ${'v'}) returning id`;
    const [term] = await admin<{ id: string }[]>`insert into academic_terms (tenant_id, year, term, name, starts_on, ends_on) values (${tenantId}, ${2024}, ${'guz'}, ${'Donem 1'}, ${'2024-09-16'}, ${'2025-06-30'}) returning id`;
    termId = term!.id;
    for (let i = 0; i < 4; i += 1) {
      const [u] = await admin<{ id: string }[]>`insert into users (tenant_id, email, password_hash) values (${tenantId}, ${`s${i}@${tag}.t`}, ${'x'}) returning id`;
      const [s] = await admin<{ id: string }[]>`insert into students (tenant_id, user_id, program_id, curriculum_version_id, student_no, status) values (${tenantId}, ${u!.id}, ${p!.id}, ${cv!.id}, ${`n${i}`}, ${'aktif'}) returning id`;
      studentIds.push(s!.id);
    }
  }, 30000);

  afterAll(async () => {
    for (const table of ['rotation_assignments', 'rotations', 'clinical_sites', 'committee_scores', 'committees', 'students', 'academic_terms', 'users', 'curriculum_versions', 'programs', 'departments', 'faculties']) {
      await admin.unsafe(`delete from ${table} where tenant_id = $1`, [tenantId]).catch(() => undefined);
    }
    await admin`delete from tenants where id = ${tenantId}`;
    await admin.end();
    await handle.client.end();
  });

  const asOidb = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithTenantStore({ tenantId, roles: ['oidb'] }, fn);

  it('kurul yıl notu: 2 kurul (70,80) + genel 60 -> 69, geçer', async () => {
    const [k1] = await admin<{ id: string }[]>`insert into committees (tenant_id, program_id, term_id, name, order_no, weight_bps) values (${tenantId}, ${programId}, ${termId}, ${'Kurul 1'}, ${1}, ${5000}) returning id`;
    const [k2] = await admin<{ id: string }[]>`insert into committees (tenant_id, program_id, term_id, name, order_no, weight_bps) values (${tenantId}, ${programId}, ${termId}, ${'Kurul 2'}, ${2}, ${5000}) returning id`;
    const stu = studentIds[0]!;
    await admin`insert into committee_scores (tenant_id, committee_id, student_id, score) values (${tenantId}, ${k1!.id}, ${stu}, ${70})`;
    await admin`insert into committee_scores (tenant_id, committee_id, student_id, score) values (${tenantId}, ${k2!.id}, ${stu}, ${80})`;

    const r = await asOidb(() =>
      service.computeCommitteeYearForStudent(stu, termId, {
        generalExamScore: 60,
        committeesWeightInYear: 0.6,
        generalExamWeightInYear: 0.4,
        passingThreshold: 60,
      }),
    );
    expect(r.committeesAverage).toBe(75);
    expect(r.yearScore).toBeCloseTo(69, 6);
    expect(r.passed).toBe(true);
  });

  it('rotasyon planı: 4 öğrenci / 2 grup / 3 klinik -> 4 atama', async () => {
    for (const c of ['A', 'B', 'C']) {
      await admin`insert into clinical_sites (tenant_id, code, name, capacity) values (${tenantId}, ${c}, ${`Hastane ${c}`}, ${10})`;
    }
    const [rot] = await admin<{ id: string }[]>`insert into rotations (tenant_id, program_id, term_id, name, group_count, weeks_per_group) values (${tenantId}, ${programId}, ${termId}, ${'Staj'}, ${2}, ${4}) returning id`;

    const res = await asOidb(() =>
      service.generateRotationPlan(rot!.id, studentIds, '2025-02-01'),
    );
    expect(res.assigned).toBe(4);

    const rows = await admin<{ group_no: number }[]>`select group_no from rotation_assignments where rotation_id = ${rot!.id}`;
    expect(rows).toHaveLength(4);
    // gruplar 0 ve 1 dönüşümlü
    expect(new Set(rows.map((r) => r.group_no))).toEqual(new Set([0, 1]));
  });
});
