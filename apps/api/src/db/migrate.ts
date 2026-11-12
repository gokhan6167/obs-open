import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { loadEnv } from '../config/env.js';
import { loadEnvFile } from '../config/load-env-file.js';

/**
 * Basit, ileriye-dönük migration runner. Migration'lar
 * src/db/migrations/*.sql, ada göre sıralı çalışır ve _migrations tablosuna
 * kaydedilir. DDL süper rolle (DATABASE_MIGRATE_URL) yapılır (RLS bypass).
 *
 * Not: expand-contract / geri-alma disiplini Faz 9'da olgunlaşacak; şimdilik
 * dev için idempotent "uygulanmamışları uygula" yeterli.
 */
async function main(): Promise<void> {
  loadEnvFile();
  const env = loadEnv();
  const here = dirname(fileURLToPath(import.meta.url));
  const dir = join(here, 'migrations');

  const client = postgres(env.DATABASE_MIGRATE_URL, { max: 1 });
  try {
    await client.unsafe(
      `create table if not exists _migrations (
         name text primary key,
         applied_at timestamptz not null default now()
       )`,
    );

    const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
    const applied = new Set(
      (await client<{ name: string }[]>`select name from _migrations`).map((r) => r.name),
    );

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) continue;
      const path = join(dir, file);
      const text = await readFile(path, 'utf8');
      await client.begin(async (tx) => {
        // text = repo içi güvenilir statik .sql dosyası (kullanıcı girdisi DEĞİL);
        // DDL çok-ifadeli çalıştırma için unsafe zorunlu.
        // nosemgrep: javascript.postgres.security.postgres-sqli.postgres-sqli
        await tx.unsafe(text);
        await tx`insert into _migrations (name) values (${file})`;
      });
      console.warn(`✓ migrate: ${file}`);
      count += 1;
    }

    console.warn(count === 0 ? 'Migration yok, güncel.' : `${count} migration uygulandı.`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error('Migration hatası:', err);
  process.exitCode = 1;
});
