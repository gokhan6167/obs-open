import postgres from 'postgres';
import { loadEnv } from '../config/env.js';
import { loadEnvFile } from '../config/load-env-file.js';

/**
 * VİTRİN demo verisi (Faz-demo). db:seed SONRASI bir kez çalışır. Demo'de bir
 * showcase öğrenci oluşturur ve ekranların dolu görünmesi için not/GNO, ders
 * kaydı, fatura/tahsilat, doğrulanabilir belge ve duyurular ekler. GERÇEK VERİ YOK.
 *
 * Çıktı olarak demo linkine gömülecek kimlikleri (tenant/öğrenci/belge kodu) yazar.
 */
const DEMO_STUDENT_NO = 'DEMO-0001';
const DEMO_DOC_CODE = 'DEMO-DEMO-0001';
const GRADES: { code: string; letter: string; coef: number }[] = [
  { code: 'ATA101', letter: 'AA', coef: 4.0 },
  { code: 'TDL101', letter: 'BA', coef: 3.5 },
  { code: 'YDL101', letter: 'BB', coef: 3.0 },
  { code: 'BIY101', letter: 'AA', coef: 4.0 },
  { code: 'ANA101', letter: 'BA', coef: 3.5 },
  { code: 'FIZ101', letter: 'CB', coef: 2.5 },
  { code: 'BIO101', letter: 'AA', coef: 4.0 },
];

async function main(): Promise<void> {
  loadEnvFile();
  const env = loadEnv();
  const sql = postgres(env.DATABASE_MIGRATE_URL, { max: 1 });
  try {
    const [tenant] = await sql<{ id: string }[]>`select id from tenants where slug = 'demo'`;
    if (!tenant) throw new Error('Önce db:seed çalıştırın (demo tenant yok)');
    const tid = tenant.id;

    // TIP programı + müfredatı (seed curriculum_courses'u buraya ekler) + aktif dönem.
    const [prog] = await sql<{ id: string }[]>`select id from programs where tenant_id = ${tid} and code = 'TIP'`;
    const [cv] = await sql<{ id: string }[]>`select id from curriculum_versions where tenant_id = ${tid} and program_id = ${prog!.id}`;
    const [term] = await sql<{ id: string }[]>`select id from academic_terms where tenant_id = ${tid} and is_active = true limit 1`;

    // Vitrin öğrencisi.
    const [u] = await sql<{ id: string }[]>`
      insert into users (tenant_id, email, password_hash)
      values (${tid}, ${'demo@example.edu'}, ${'x'})
      on conflict (tenant_id, email) do update set email = excluded.email returning id`;
    const [stu] = await sql<{ id: string }[]>`
      insert into students (tenant_id, user_id, program_id, curriculum_version_id, student_no, status)
      values (${tid}, ${u!.id}, ${prog!.id}, ${cv!.id}, ${DEMO_STUDENT_NO}, ${'aktif'})
      on conflict (tenant_id, student_no) do update set status = 'aktif' returning id`;
    const sid = stu!.id;

    // Temiz tekrar için demo öğrencinin önceki not/kaydını sil.
    await sql`delete from grades where student_id = ${sid}`;
    await sql`delete from enrollments where student_id = ${sid}`;

    // Her ders için section + kayıt + ilan notu.
    for (const g of GRADES) {
      const [course] = await sql<{ id: string; ects: number }[]>`select id, ects from courses where tenant_id = ${tid} and code = ${g.code}`;
      const [sec] = await sql<{ id: string }[]>`
        insert into sections (tenant_id, course_id, term_id, code, quota, filled)
        values (${tid}, ${course!.id}, ${term!.id}, ${'01'}, ${60}, ${0})
        on conflict (tenant_id, course_id, term_id, code) do update set quota = 60 returning id`;
      await sql`insert into enrollments (tenant_id, student_id, section_id, term_id, status)
        values (${tid}, ${sid}, ${sec!.id}, ${term!.id}, ${'approved'})
        on conflict (student_id, section_id) do nothing`;
      await sql`insert into grades (tenant_id, student_id, section_id, term_id, raw_score, letter, coefficient, status)
        values (${tid}, ${sid}, ${sec!.id}, ${term!.id}, ${88}, ${g.letter}, ${g.coef}, ${'announced'})`;
    }

    // Ders kayıt doluluğu: ilk section'a ~45 öğrenci (dashboard/canlı izleme için).
    const first = await sql<{ id: string }[]>`select id from sections where tenant_id = ${tid} order by created_at limit 1`;
    if (first[0]) {
      await sql`update sections set filled = 47 where id = ${first[0].id}`;
    }

    // Mali: ücret tarifesi + fatura + kısmi ödeme (tahsilat için).
    await sql`insert into fee_schedules (tenant_id, program_id, year, base_amount)
      values (${tid}, ${prog!.id}, ${2024}, ${5000000})
      on conflict (program_id, year) do update set base_amount = 5000000`;
    const [inv] = await sql<{ id: string }[]>`
      insert into invoices (tenant_id, student_id, term_id, amount, paid_amount, status)
      values (${tid}, ${sid}, ${term!.id}, ${5000000}, ${3000000}, ${'partial'}) returning id`;
    await sql`insert into payments (tenant_id, invoice_id, amount, provider, idempotency_key, status)
      values (${tid}, ${inv!.id}, ${3000000}, ${'mock'}, ${'demo-pay-1'}, ${'success'})
      on conflict (tenant_id, idempotency_key) do nothing`;

    // Doğrulanabilir belge (transkript).
    await sql`insert into documents (tenant_id, type, student_id, verification_code, payload)
      values (${tid}, ${'transkript'}, ${sid}, ${DEMO_DOC_CODE}, ${'{"demo":true}'})
      on conflict (verification_code) do nothing`;

    // Duyurular.
    await sql`delete from announcements where tenant_id = ${tid} and scope = 'university'`;
    for (const a of [
      { t: 'Bahar Dönemi Ders Kayıtları', b: 'Ders kayıtları 9-14 Eylül tarihleri arasında yapılacaktır.' },
      { t: 'Bütünleme Sınav Takvimi', b: 'Bütünleme sınavları ilan edilmiştir. Öğrenci panelinden görüntüleyebilirsiniz.' },
      { t: 'Yaz Stajı Başvuruları', b: 'Sağlık programları için yaz stajı başvuruları başlamıştır.' },
    ]) {
      await sql`insert into announcements (tenant_id, title, body, scope) values (${tid}, ${a.t}, ${a.b}, ${'university'})`;
    }

    console.warn('=== VİTRİN DEMO HAZIR ===');
    console.warn(`DEMO_TENANT_ID=${tid}`);
    console.warn(`DEMO_STUDENT_ID=${sid}`);
    console.warn(`DEMO_STUDENT_USER_ID=${u!.id}`);
    console.warn(`DEMO_TERM_ID=${term!.id}`);
    console.warn(`DEMO_DOC_CODE=${DEMO_DOC_CODE}`);
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error('Demo seed hatası:', err);
  process.exitCode = 1;
});
