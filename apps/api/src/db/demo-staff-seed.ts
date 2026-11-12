import { Algorithm, hash as argonHash } from '@node-rs/argon2';
import postgres from 'postgres';
import { loadEnv } from '../config/env.js';
import { loadEnvFile } from '../config/load-env-file.js';

/**
 * ÇOK-ROLLÜ DEMO staff seed'i. db:seed + db:demo + db:demo-login SONRASI çalışır.
 * demo-login-seed.ts'in kapsamadığı yönetici/personel rollerini (bölüm başkanı,
 * koordinatör, dekanlık, fakülte sekreteri, mali işler, rektörlük vb.) roles
 * tablosuna ekler ve her rol için gerçekten giriş yapılabilen bir kullanıcı
 * (Argon2id parola) üretip rolünü atar. GERÇEK VERİ YOK.
 *
 * Ortak parola: Parola123!
 */
const PASSWORD = 'Parola123!';

/** roles tablosunda olması gereken rol tanımları (key -> görünen ad). */
const ROLE_DEFS: { key: string; name: string }[] = [
  { key: 'bolum_baskani', name: 'Bölüm Başkanı' },
  { key: 'koordinator', name: 'Bologna/Akreditasyon Koordinatörü' },
  { key: 'dekanlik', name: 'Dekanlık' },
  { key: 'fakulte_sekreteri', name: 'Fakülte Sekreteri' },
  { key: 'mali_isler', name: 'Mali İşler' },
  { key: 'rektorluk', name: 'Rektörlük' },
];

/** Her rol için birer demo kullanıcı. */
const USERS: { email: string; roles: string[] }[] = [
  { email: 'danisman@example.edu', roles: ['danisman', 'ogretim_elemani'] },
  { email: 'baskan@example.edu', roles: ['bolum_baskani'] },
  { email: 'koordinator@example.edu', roles: ['koordinator'] },
  { email: 'dekan@example.edu', roles: ['dekanlik'] },
  { email: 'sekreter@example.edu', roles: ['fakulte_sekreteri'] },
  { email: 'mali@example.edu', roles: ['mali_isler'] },
  { email: 'rektor@example.edu', roles: ['rektorluk'] },
  { email: 'sistem@example.edu', roles: ['sistem_yoneticisi'] },
];

async function main(): Promise<void> {
  loadEnvFile();
  const env = loadEnv();
  const sql = postgres(env.DATABASE_MIGRATE_URL, { max: 1 });
  try {
    const [tenant] = await sql<{ id: string }[]>`select id from tenants where slug = 'demo'`;
    if (!tenant) throw new Error('Önce db:seed çalıştırın (demo tenant yok)');
    const tid = tenant.id;

    // Eksik rolleri ekle (idempotent).
    for (const r of ROLE_DEFS) {
      await sql`insert into roles (tenant_id, key, name) values (${tid}, ${r.key}, ${r.name})
        on conflict on constraint roles_tenant_key_uq do update set name = excluded.name`;
    }

    const roleId = new Map<string, string>();
    for (const r of await sql<{ id: string; key: string }[]>`select id, key from roles where tenant_id = ${tid}`) {
      roleId.set(r.key, r.id);
    }

    const hash = await argonHash(PASSWORD, { algorithm: Algorithm.Argon2id });
    for (const u of USERS) {
      const [row] = await sql<{ id: string }[]>`
        insert into users (tenant_id, email, password_hash, is_active)
        values (${tid}, ${u.email}, ${hash}, ${true})
        on conflict (tenant_id, email) do update set password_hash = excluded.password_hash, is_active = true
        returning id`;
      for (const key of u.roles) {
        const rid = roleId.get(key);
        if (!rid) throw new Error(`Rol yok: ${key} (önce db:seed rolleri ekler)`);
        await sql`insert into user_roles (tenant_id, user_id, role_id) values (${tid}, ${row!.id}, ${rid})
          on conflict on constraint user_roles_uq do nothing`;
      }
    }

    console.warn('=== ÇOK-ROLLÜ DEMO STAFF HAZIR ===');
    console.warn(`TENANT(slug)=demo  TENANT_ID=${tid}`);
    for (const u of USERS) console.warn(`  ${u.email} / ${PASSWORD}  roller=${u.roles.join(',')}`);
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error('Demo staff seed hatası:', err);
  process.exitCode = 1;
});
