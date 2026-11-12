import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDb, type DbHandle } from '../db/client.js';
import { ParametersService } from '../parameters/parameters.service.js';
import { GpaService } from '../grades/gpa.service.js';
import { DocumentsService } from './documents.service.js';
import { PdfService } from './pdf.service.js';

/**
 * FLAGSHIP: public belge doğrulama. verify() kimlik/tenant GEREKTİRMEZ; SECURITY
 * DEFINER fonksiyonu RLS'i güvenli aşarak yalnızca public-güvenli alanları döner.
 */
const MIGRATE_URL =
  process.env.DATABASE_MIGRATE_URL ?? 'postgres://obs:obs_dev_password@localhost:5432/obs';
const APP_URL =
  process.env.DATABASE_URL ?? 'postgres://obs_app:obs_app_dev_password@localhost:5432/obs';

describe('DocumentsService.verify (public doğrulama)', () => {
  const admin = postgres(MIGRATE_URL, { max: 1 });
  const handle: DbHandle = createDb(APP_URL, 2);
  const service = new DocumentsService(
    handle,
    new GpaService(handle, new ParametersService(handle)),
    new PdfService(),
  );
  const tag = `doc_${Date.now()}`;
  const code = `VER-${tag}`;

  let tenantId = '';

  beforeAll(async () => {
    const [t] = await admin<{ id: string }[]>`insert into tenants (slug, name) values (${tag}, ${'T'}) returning id`;
    tenantId = t!.id;
    const [f] = await admin<{ id: string }[]>`insert into faculties (tenant_id, code, name) values (${tenantId}, ${'F'}, ${'F'}) returning id`;
    const [d] = await admin<{ id: string }[]>`insert into departments (tenant_id, faculty_id, code, name) values (${tenantId}, ${f!.id}, ${'D'}, ${'D'}) returning id`;
    const [p] = await admin<{ id: string }[]>`insert into programs (tenant_id, department_id, code, name, level) values (${tenantId}, ${d!.id}, ${'P'}, ${'Tip'}, ${'lisans'}) returning id`;
    const [cv] = await admin<{ id: string }[]>`insert into curriculum_versions (tenant_id, program_id, year, name) values (${tenantId}, ${p!.id}, ${2023}, ${'v'}) returning id`;
    const [u] = await admin<{ id: string }[]>`insert into users (tenant_id, email, password_hash) values (${tenantId}, ${`s@${tag}.t`}, ${'x'}) returning id`;
    const [s] = await admin<{ id: string }[]>`insert into students (tenant_id, user_id, program_id, curriculum_version_id, student_no, status) values (${tenantId}, ${u!.id}, ${p!.id}, ${cv!.id}, ${'2023999'}, ${'aktif'}) returning id`;
    await admin`insert into documents (tenant_id, type, student_id, verification_code, payload)
      values (${tenantId}, ${'transkript'}, ${s!.id}, ${code}, ${'{}'})`;
  }, 30000);

  afterAll(async () => {
    for (const table of ['documents', 'students', 'users', 'curriculum_versions', 'programs', 'departments', 'faculties']) {
      await admin.unsafe(`delete from ${table} where tenant_id = $1`, [tenantId]).catch(() => undefined);
    }
    await admin`delete from tenants where id = ${tenantId}`;
    await admin.end();
    await handle.client.end();
  });

  it('geçerli kodu tenant/kimlik olmadan doğrular (SECURITY DEFINER bypass)', async () => {
    // DİKKAT: runWithTenantStore YOK — public doğrulama tenant bağlamı gerektirmez.
    const r = await service.verify(code);
    expect(r.valid).toBe(true);
    expect(r.studentNo).toBe('2023999');
    expect(r.programName).toBe('Tip');
    expect(r.docType).toBe('transkript');
  });

  it('bilinmeyen kod -> geçersiz', async () => {
    const r = await service.verify('OLMAYAN-KOD');
    expect(r.valid).toBe(false);
  });

  it('iptal edilmiş belge -> geçersiz', async () => {
    await admin`update documents set revoked = true where verification_code = ${code}`;
    const r = await service.verify(code);
    expect(r.valid).toBe(false);
    expect(r.revoked).toBe(true);
    await admin`update documents set revoked = false where verification_code = ${code}`;
  });
});
