import { AsyncLocalStorage } from 'node:async_hooks';
import { sql } from 'drizzle-orm';
import type { Db } from './client.js';

/**
 * İstek yaşam döngüsü boyunca aktif tenant'ı taşır. Middleware set eder,
 * servisler okur. ASIL izolasyon DB seviyesinde withTenant + RLS iledir;
 * bu store yalnızca uygulama katmanı kolaylığıdır (çift kilidin üst yarısı).
 */
export interface TenantStore {
  tenantId: string;
  actorUserId?: string;
  /** Aktör rolleri (RBAC). Faz 1: başlıktan; ileride JWT claim'inden. */
  roles?: readonly string[];
}

const als = new AsyncLocalStorage<TenantStore>();

export function runWithTenantStore<T>(store: TenantStore, fn: () => T): T {
  return als.run(store, fn);
}

export function currentTenant(): TenantStore | undefined {
  return als.getStore();
}

export function requireTenant(): TenantStore {
  const store = als.getStore();
  if (!store) {
    throw new Error('Tenant bağlamı yok: istek tenant çözümlenmeden servise ulaştı');
  }
  return store;
}

/**
 * Verilen tenant kapsamında bir transaction açar ve `app.tenant_id`'yi
 * transaction-local set eder. İçerideki tüm sorgular RLS ile o tenant'a kısıtlı.
 *
 * KULLANIM ZORUNLU: tenant-kapsamlı her DB erişimi bu sarmalayıcıdan geçmeli.
 */
export async function withTenant<T>(
  db: Db,
  tenantId: string,
  fn: (tx: Parameters<Parameters<Db['transaction']>[0]>[0]) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // set_config(key, value, is_local=true): transaction sonunda otomatik sıfırlanır.
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
    return fn(tx);
  });
}
