import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDb, type DbHandle } from '../db/client.js';
import { runWithTenantStore } from '../db/tenant-context.js';
import { AuthService } from './auth.service.js';
import { PasswordService } from './password.service.js';

const MIGRATE_URL =
  process.env.DATABASE_MIGRATE_URL ?? 'postgres://obs:obs_dev_password@localhost:5432/obs';
const APP_URL =
  process.env.DATABASE_URL ?? 'postgres://obs_app:obs_app_dev_password@localhost:5432/obs';

describe('AuthService.login (entegrasyon)', () => {
  const admin = postgres(MIGRATE_URL, { max: 1 });
  const handle: DbHandle = createDb(APP_URL, 2);
  const jwt = new JwtService({ secret: 'test-secret', signOptions: { expiresIn: '1h' } });
  const service = new AuthService(handle, jwt, new PasswordService());
  const tag = `auth_${Date.now()}`;
  let tenantId = '';
  const email = `hoca@${tag}.test`;

  beforeAll(async () => {
    const hash = await new PasswordService().hash('Parola123!');
    const [t] = await admin<{ id: string }[]>`insert into tenants (slug, name) values (${tag}, ${'T'}) returning id`;
    tenantId = t!.id;
    const [u] = await admin<{ id: string }[]>`insert into users (tenant_id, email, password_hash) values (${tenantId}, ${email}, ${hash}) returning id`;
    const [r] = await admin<{ id: string }[]>`insert into roles (tenant_id, key, name) values (${tenantId}, ${'ogretim_elemani'}, ${'Öğretim Elemanı'}) returning id`;
    await admin`insert into user_roles (tenant_id, user_id, role_id) values (${tenantId}, ${u!.id}, ${r!.id})`;
  }, 30000);

  afterAll(async () => {
    await admin`delete from user_roles where tenant_id = ${tenantId}`;
    await admin`delete from roles where tenant_id = ${tenantId}`;
    await admin`delete from users where tenant_id = ${tenantId}`;
    await admin`delete from tenants where id = ${tenantId}`;
    await admin.end();
    await handle.client.end();
  });

  it('doğru parola -> JWT + roller', async () => {
    const res = await runWithTenantStore({ tenantId }, () => service.login(email, 'Parola123!'));
    expect(res.roles).toContain('ogretim_elemani');
    expect(res.accessToken).toBeTruthy();
    // JWT çözülünce tenant + rol claim'i doğru.
    const claims = jwt.verify<{ tenant: string; roles: string[] }>(res.accessToken);
    expect(claims.tenant).toBe(tenantId);
    expect(claims.roles).toContain('ogretim_elemani');
  });

  it('yanlış parola -> 401', async () => {
    await expect(
      runWithTenantStore({ tenantId }, () => service.login(email, 'yanlis')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('olmayan kullanıcı -> 401', async () => {
    await expect(
      runWithTenantStore({ tenantId }, () => service.login('yok@x.test', 'Parola123!')),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
