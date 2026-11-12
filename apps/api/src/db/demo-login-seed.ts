import { Algorithm, hash as argonHash } from '@node-rs/argon2';
import postgres from 'postgres';
import { loadEnv } from '../config/env.js';
import { loadEnvFile } from '../config/load-env-file.js';

/**
 * CANLI DEMO login seed'i. db:seed + db:demo SONRASI çalışır. Üç rollü, gerçekten
 * giriş yapılabilen kullanıcı üretir (Argon2id parola) ve rollerini atar; vitrin
 * öğrencisini login'e bağlar; hoca'yı öğrencinin section'larına öğretim elemanı
 * yapar; ÇAP uygunluğu için geçmiş bir dönem + not ekler. GERÇEK VERİ YOK.
 *
 * Ortak parola: Parola123!
 */
const PASSWORD = 'Parola123!';
const USERS: { email: string; roles: string[] }[] = [
  { email: 'ogrenci@example.edu', roles: ['ogrenci'] },
  { email: 'hoca@example.edu', roles: ['ogretim_elemani', 'danisman'] },
  { email: 'yonetim@example.edu', roles: ['oidb', 'sistem_yoneticisi'] },
];

async function main(): Promise<void> {
  loadEnvFile();
  const env = loadEnv();
  const sql = postgres(env.DATABASE_MIGRATE_URL, { max: 1 });
  try {
    const [tenant] = await sql<{ id: string }[]>`select id from tenants where slug = 'demo'`;
    if (!tenant) throw new Error('Önce db:seed çalıştırın (demo tenant yok)');
    const tid = tenant.id;

    const roleId = new Map<string, string>();
    for (const r of await sql<{ id: string; key: string }[]>`select id, key from roles where tenant_id = ${tid}`) {
      roleId.set(r.key, r.id);
    }

    const hash = await argonHash(PASSWORD, { algorithm: Algorithm.Argon2id });
    const userId = new Map<string, string>();
    for (const u of USERS) {
      const [row] = await sql<{ id: string }[]>`
        insert into users (tenant_id, email, password_hash, is_active)
        values (${tid}, ${u.email}, ${hash}, ${true})
        on conflict (tenant_id, email) do update set password_hash = excluded.password_hash, is_active = true
        returning id`;
      userId.set(u.email, row!.id);
      for (const key of u.roles) {
        const rid = roleId.get(key);
        if (!rid) throw new Error(`Rol yok: ${key}`);
        await sql`insert into user_roles (tenant_id, user_id, role_id) values (${tid}, ${row!.id}, ${rid})
          on conflict on constraint user_roles_uq do nothing`;
      }
    }

    // Vitrin öğrencisini (demo@example.edu) ogrenci@ login'ine taşı: student kaydını
    // ogrenci@ kullanıcısına bağla + ogrenci rolü zaten atandı.
    const ogrUserId = userId.get('ogrenci@example.edu')!;
    const [stu] = await sql<{ id: string; program_id: string; curriculum_version_id: string }[]>`
      select id, program_id, curriculum_version_id from students where tenant_id = ${tid} and student_no = 'DEMO-0001'`;
    if (!stu) throw new Error('Vitrin öğrencisi yok (önce db:demo)');
    await sql`update students set user_id = ${ogrUserId} where id = ${stu.id}`;

    // Hoca'yı öğrencinin bu dönemki section'larına öğretim elemanı yap.
    const hocaUserId = userId.get('hoca@example.edu')!;
    await sql`update sections set instructor_user_id = ${hocaUserId}
      where tenant_id = ${tid} and id in (
        select section_id from enrollments where student_id = ${stu.id})`;

    // ÇAP uygunluğu: geçmiş dönem (2023 Güz) + iki ilan notu -> completedTerms >= 2.
    const [pastTerm] = await sql<{ id: string }[]>`
      insert into academic_terms (tenant_id, year, term, name, starts_on, ends_on, is_active)
      values (${tid}, ${2023}, ${'guz'}, ${'2023-2024 Güz'}, ${'2023-09-18'}, ${'2024-01-19'}, ${false})
      on conflict (tenant_id, year, term) do update set name = excluded.name returning id`;
    // Önceki demo tekrarını temizle (idempotent).
    await sql`delete from grades where student_id = ${stu.id} and term_id = ${pastTerm!.id}`;
    const pastCourses = await sql<{ id: string }[]>`
      select id from courses where tenant_id = ${tid} and code in ('ATA101','TDL101')`;
    for (const c of pastCourses) {
      const [sec] = await sql<{ id: string }[]>`
        insert into sections (tenant_id, course_id, term_id, code, quota, filled, instructor_user_id)
        values (${tid}, ${c.id}, ${pastTerm!.id}, ${'01'}, ${60}, ${1}, ${hocaUserId})
        on conflict (tenant_id, course_id, term_id, code) do update set instructor_user_id = ${hocaUserId} returning id`;
      await sql`insert into enrollments (tenant_id, student_id, section_id, term_id, status)
        values (${tid}, ${stu.id}, ${sec!.id}, ${pastTerm!.id}, ${'approved'})
        on conflict (student_id, section_id) do nothing`;
      await sql`insert into grades (tenant_id, student_id, section_id, term_id, raw_score, letter, coefficient, status)
        values (${tid}, ${stu.id}, ${sec!.id}, ${pastTerm!.id}, ${90}, ${'AA'}, ${4.0}, ${'announced'})`;
    }

    // Ders seçme demosu: aktif dönemde 'kayit' penceresini AÇIK yap + öğrencinin
    // kayıtlı OLMADIĞI birkaç şube (şube 02) ekle.
    const [activeTerm] = await sql<{ id: string }[]>`
      select id from academic_terms where tenant_id = ${tid} and is_active = true limit 1`;
    if (activeTerm) {
      await sql`delete from calendar_events where term_id = ${activeTerm.id} and type = 'kayit'`;
      await sql`insert into calendar_events (tenant_id, term_id, type, starts_at, ends_at)
        values (${tid}, ${activeTerm.id}, ${'kayit'}, ${'2024-01-01T00:00:00Z'}, ${'2027-12-31T23:59:59Z'})`;
      const extra = await sql<{ id: string }[]>`
        select id from courses where tenant_id = ${tid} and code in ('ANA101','FIZ101','BIO101')`;
      for (const c of extra) {
        await sql`insert into sections (tenant_id, course_id, term_id, code, quota, filled)
          values (${tid}, ${c.id}, ${activeTerm.id}, ${'02'}, ${40}, ${0})
          on conflict (tenant_id, course_id, term_id, code) do nothing`;
      }
    }

    console.warn('=== CANLI DEMO LOGIN HAZIR ===');
    console.warn(`TENANT(slug)=demo  TENANT_ID=${tid}`);
    for (const u of USERS) console.warn(`  ${u.email} / ${PASSWORD}  roller=${u.roles.join(',')}`);
    console.warn(`  (öğrenci student_no=DEMO-0001, GNO ~3.47, ÇAP uygun: 2 dönem)`);
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error('Demo login seed hatası:', err);
  process.exitCode = 1;
});
