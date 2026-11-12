import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';

/**
 * ADR-0003 zorunlu izolasyon testi: "tenant A kullanıcısı tenant B verisini
 * çekemez". obs_app (RLS'e tabi rol) ile bağlanıp RLS'i gerçek Postgres'e karşı
 * doğrular. CI'da bloklayıcı.
 */
const MIGRATE_URL =
  process.env.DATABASE_MIGRATE_URL ?? 'postgres://obs:obs_dev_password@localhost:5432/obs';
const APP_URL =
  process.env.DATABASE_URL ?? 'postgres://obs_app:obs_app_dev_password@localhost:5432/obs';

describe('Tenant izolasyonu (RLS)', () => {
  const admin = postgres(MIGRATE_URL, { max: 1 });
  const app = postgres(APP_URL, { max: 1 });
  const tag = `iso_${Date.now()}`;
  let tenantA = '';
  let tenantB = '';

  beforeAll(async () => {
    // Süper rolle (RLS bypass) iki tenant + birer kullanıcı hazırla.
    const [a] = await admin<{ id: string }[]>`
      insert into tenants (slug, name) values (${`${tag}_a`}, ${'Tenant A'}) returning id`;
    const [b] = await admin<{ id: string }[]>`
      insert into tenants (slug, name) values (${`${tag}_b`}, ${'Tenant B'}) returning id`;
    tenantA = a!.id;
    tenantB = b!.id;
    await admin`insert into users (tenant_id, email, password_hash)
      values (${tenantA}, ${`a@${tag}.test`}, ${'x'})`;
    await admin`insert into users (tenant_id, email, password_hash)
      values (${tenantB}, ${`b@${tag}.test`}, ${'x'})`;
  });

  afterAll(async () => {
    await admin`delete from users where tenant_id in (${tenantA}, ${tenantB})`;
    await admin`delete from tenants where id in (${tenantA}, ${tenantB})`;
    await admin.end();
    await app.end();
  });

  it('app.tenant_id = A iken yalnızca A kullanıcıları görünür', async () => {
    const rows = await app.begin(async (tx) => {
      await tx`select set_config('app.tenant_id', ${tenantA}, true)`;
      return tx<{ tenant_id: string }[]>`select tenant_id from users`;
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenant_id === tenantA)).toBe(true);
  });

  it('app.tenant_id = B iken A verisi görünmez', async () => {
    const rows = await app.begin(async (tx) => {
      await tx`select set_config('app.tenant_id', ${tenantB}, true)`;
      return tx<{ tenant_id: string }[]>`select tenant_id from users`;
    });
    expect(rows.every((r) => r.tenant_id === tenantB)).toBe(true);
    expect(rows.some((r) => r.tenant_id === tenantA)).toBe(false);
  });

  it('tenant set edilmemişse hiçbir satır görünmez (güvenli varsayılan)', async () => {
    const rows = await app<{ id: string }[]>`select id from users`;
    expect(rows.length).toBe(0);
  });

  it('A bağlamında B tenantına satır eklenemez (WITH CHECK)', async () => {
    await expect(
      app.begin(async (tx) => {
        await tx`select set_config('app.tenant_id', ${tenantA}, true)`;
        await tx`insert into users (tenant_id, email, password_hash)
          values (${tenantB}, ${`hack@${tag}.test`}, ${'x'})`;
      }),
    ).rejects.toThrow();
  });

  it('audit_log append-only: UPDATE reddedilir', async () => {
    await admin`insert into audit_log (tenant_id, action, resource_type)
      values (${tenantA}, ${'test'}, ${'unit'})`;
    await expect(
      admin`update audit_log set action = ${'tamper'} where tenant_id = ${tenantA}`,
    ).rejects.toThrow();
    await admin`delete from audit_log where tenant_id = ${tenantA}`.catch(() => undefined);
  });
});
