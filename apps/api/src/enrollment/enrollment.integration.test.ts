import { ConflictException } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDb, type DbHandle } from '../db/client.js';
import { runWithTenantStore } from '../db/tenant-context.js';
import { GpaService } from '../grades/gpa.service.js';
import { ParametersService } from '../parameters/parameters.service.js';
import { EnrollmentService } from './enrollment.service.js';

/**
 * FLAGSHIP: kontenjan yarış durumu testi (master prompt §M3, §6.4).
 * QUOTA öğrenciden AZ; hepsi EŞZAMANLI kaydolmaya çalışır. Değişmez:
 * kontenjan asla aşılmaz, asla negatife düşmez, tam QUOTA kadar kayıt olur.
 */
const MIGRATE_URL =
  process.env.DATABASE_MIGRATE_URL ?? 'postgres://obs:obs_dev_password@localhost:5432/obs';
const APP_URL =
  process.env.DATABASE_URL ?? 'postgres://obs_app:obs_app_dev_password@localhost:5432/obs';

const QUOTA = 30;
const STUDENTS = 120;

describe('EnrollmentService.enroll — kontenjan yarışı', () => {
  const admin = postgres(MIGRATE_URL, { max: 1 });
  const handle: DbHandle = createDb(APP_URL, 20);
  const params = new ParametersService(handle);
  const service = new EnrollmentService(handle, new GpaService(handle, params), params);
  const tag = `enr_${Date.now()}`;

  let tenantId = '';
  let sectionId = '';
  const studentIds: string[] = [];

  beforeAll(async () => {
    const [t] = await admin<{ id: string }[]>`insert into tenants (slug, name) values (${tag}, ${'T'}) returning id`;
    tenantId = t!.id;
    const [f] = await admin<{ id: string }[]>`insert into faculties (tenant_id, code, name) values (${tenantId}, ${'F'}, ${'F'}) returning id`;
    const [d] = await admin<{ id: string }[]>`insert into departments (tenant_id, faculty_id, code, name) values (${tenantId}, ${f!.id}, ${'D'}, ${'D'}) returning id`;
    const [p] = await admin<{ id: string }[]>`insert into programs (tenant_id, department_id, code, name, level) values (${tenantId}, ${d!.id}, ${'P'}, ${'P'}, ${'lisans'}) returning id`;
    const [cv] = await admin<{ id: string }[]>`insert into curriculum_versions (tenant_id, program_id, year, name) values (${tenantId}, ${p!.id}, ${2023}, ${'v'}) returning id`;
    const [c] = await admin<{ id: string }[]>`insert into courses (tenant_id, code, name_tr, ects, local_credit) values (${tenantId}, ${'C1'}, ${'Ders'}, ${6}, ${4}) returning id`;
    const [term] = await admin<{ id: string }[]>`insert into academic_terms (tenant_id, year, term, name, starts_on, ends_on) values (${tenantId}, ${2024}, ${'guz'}, ${'g'}, ${'2024-09-16'}, ${'2025-01-17'}) returning id`;
    const [sec] = await admin<{ id: string }[]>`
      insert into sections (tenant_id, course_id, term_id, code, quota) values (${tenantId}, ${c!.id}, ${term!.id}, ${'01'}, ${QUOTA}) returning id`;
    sectionId = sec!.id;

    for (let i = 0; i < STUDENTS; i += 1) {
      const [u] = await admin<{ id: string }[]>`insert into users (tenant_id, email, password_hash) values (${tenantId}, ${`u${i}@${tag}.t`}, ${'x'}) returning id`;
      const [s] = await admin<{ id: string }[]>`
        insert into students (tenant_id, user_id, program_id, curriculum_version_id, student_no, status)
        values (${tenantId}, ${u!.id}, ${p!.id}, ${cv!.id}, ${`${tag}-${i}`}, ${'aktif'}) returning id`;
      studentIds.push(s!.id);
    }
  }, 60000);

  afterAll(async () => {
    await admin`delete from enrollments where tenant_id = ${tenantId}`;
    await admin`delete from sections where tenant_id = ${tenantId}`;
    await admin`delete from students where tenant_id = ${tenantId}`;
    await admin`delete from courses where tenant_id = ${tenantId}`;
    await admin`delete from calendar_events where tenant_id = ${tenantId}`;
    await admin`delete from academic_terms where tenant_id = ${tenantId}`;
    await admin`delete from users where tenant_id = ${tenantId}`;
    await admin`delete from curriculum_versions where tenant_id = ${tenantId}`;
    await admin`delete from programs where tenant_id = ${tenantId}`;
    await admin`delete from departments where tenant_id = ${tenantId}`;
    await admin`delete from faculties where tenant_id = ${tenantId}`;
    await admin`delete from tenants where id = ${tenantId}`;
    await admin.end();
    await handle.client.end();
  });

  it(`${STUDENTS} eşzamanlı istek -> tam ${QUOTA} kayıt, kontenjan aşılmaz`, async () => {
    // ÖİDB toplu kayıt bağlamı (yetki: başka öğrenci adına kayıt için oidb gerekir).
    const results = await Promise.allSettled(
      studentIds.map((sid) =>
        runWithTenantStore({ tenantId, roles: ['oidb'] }, () => service.enroll(sid, sectionId)),
      ),
    );

    const success = results.filter((r) => r.status === 'fulfilled').length;
    const rejected = results.filter(
      (r) => r.status === 'rejected' && r.reason instanceof ConflictException,
    ).length;

    expect(success).toBe(QUOTA);
    expect(rejected).toBe(STUDENTS - QUOTA);

    // DB gerçeği: filled == quota, kayıt sayısı == quota, asla aşım.
    const [sec] = await admin<{ filled: number; quota: number }[]>`
      select filled, quota from sections where id = ${sectionId}`;
    expect(sec!.filled).toBe(QUOTA);
    expect(sec!.filled).toBeLessThanOrEqual(sec!.quota);

    const counts = await admin<{ count: number }[]>`
      select count(*)::int as count from enrollments where section_id = ${sectionId}`;
    expect(counts[0]?.count).toBe(QUOTA);
  }, 60000);
});
