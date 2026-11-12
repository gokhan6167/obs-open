import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { createDb, type DbHandle } from '../db/client.js';
import { runWithTenantStore } from '../db/tenant-context.js';
import type { MappingConfig } from './mapping.js';
import { MigrationService } from './migration.service.js';

/**
 * FLAGSHIP: göç mutabakatı + canlıya geçiş kilidi (§M11). Çözülmemiş istisna
 * veya karantina varken canlıya geçiş ENGELLENİR.
 */
const MIGRATE_URL =
  process.env.DATABASE_MIGRATE_URL ?? 'postgres://obs:obs_dev_password@localhost:5432/obs';
const APP_URL =
  process.env.DATABASE_URL ?? 'postgres://obs_app:obs_app_dev_password@localhost:5432/obs';

const config: MappingConfig = {
  target: 'student',
  fields: [
    { target: 'studentNo', source: 'OGRENCI_NO', transforms: ['trim'], required: true },
    { target: 'entryYear', source: 'GIRIS_YILI', transforms: ['int'], required: true },
  ],
};

describe('MigrationService (entegrasyon)', () => {
  const admin = postgres(MIGRATE_URL, { max: 1 });
  const handle: DbHandle = createDb(APP_URL, 3);
  const service = new MigrationService(handle);
  const tag = `mig_${Date.now()}`;
  let tenantId = '';
  let runId = '';

  beforeAll(async () => {
    const [t] = await admin<{ id: string }[]>`insert into tenants (slug, name) values (${tag}, ${'T'}) returning id`;
    tenantId = t!.id;
  }, 30000);

  afterAll(async () => {
    for (const table of ['reconciliation_exceptions', 'quarantine_rows', 'staging_rows', 'migration_runs']) {
      await admin.unsafe(`delete from ${table} where tenant_id = $1`, [tenantId]).catch(() => undefined);
    }
    await admin`delete from tenants where id = ${tenantId}`;
    await admin.end();
    await handle.client.end();
  });

  const asOidb = <T>(fn: () => Promise<T>): Promise<T> =>
    runWithTenantStore({ tenantId, roles: ['oidb'] }, fn);

  it('prova koşumu başlar, mapping ile staging + karantina', async () => {
    const { runId: r } = await asOidb(() => service.startRun('dry_run'));
    runId = r;
    const res = await asOidb(() =>
      service.loadRows(
        runId,
        'students',
        [
          { OGRENCI_NO: ' 2023001 ', GIRIS_YILI: '2023' }, // geçerli
          { OGRENCI_NO: '', GIRIS_YILI: 'xyz' }, // kirli -> karantina
        ],
        config,
      ),
    );
    expect(res.loaded).toBe(1);
    expect(res.quarantined).toBe(1);
  });

  it('mutabakat: uyuşmayan transkript istisna üretir', async () => {
    const res = await asOidb(() =>
      service.runReconciliation(runId, [
        {
          ois: { studentNo: '2023001', gpa: 3.5, totalCredit: 240, courseCount: 40, letters: {} },
          next: { studentNo: '2023001', gpa: 2.0, totalCredit: 200, courseCount: 38, letters: {} },
        },
      ]),
    );
    expect(res.totalExceptions).toBeGreaterThan(0);
  });

  it('çözülmemiş istisna/karantina varken canlıya GEÇİLEMEZ', async () => {
    const r = await asOidb(() => service.goLiveReadiness(runId));
    expect(r.canGoLive).toBe(false);
    expect(r.unresolvedExceptions).toBeGreaterThan(0);
    expect(r.unresolvedQuarantine).toBeGreaterThan(0);
  });

  it('istisna + karantina çözülünce canlıya geçilebilir', async () => {
    await admin`update reconciliation_exceptions set resolved = true where migration_run_id = ${runId}`;
    await admin`update quarantine_rows set resolved = true where migration_run_id = ${runId}`;
    const r = await asOidb(() => service.goLiveReadiness(runId));
    expect(r.canGoLive).toBe(true);
    expect(r.unresolvedExceptions).toBe(0);
    expect(r.unresolvedQuarantine).toBe(0);
  });
});
