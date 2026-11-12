import { Algorithm, hash as argonHash } from '@node-rs/argon2';
import postgres from 'postgres';
import type { GradeBand } from '@obs/academic-core';
import { loadEnv } from '../config/env.js';
import { loadEnvFile } from '../config/load-env-file.js';

/**
 * Geliştirme seed'i (Faz 1). Örnek tenant Demo + roller + admin + akademik
 * hiyerarşi (3 fakülte / 10 program + müfredat + dersler) + mevzuat parametreleri
 * + akademik takvim + 200 sahte öğrenci. GERÇEK VERİ YOK — sentetik.
 * Süper rolle çalışır (çok tenant'a yazar; RLS bypass). Idempotent.
 *
 * Parametre değerleri (harf ölçeği, GNO, limitler) VARSAYIM'dır — docs/ASSUMPTIONS.md.
 */
const ROLES: { key: string; name: string }[] = [
  { key: 'ogrenci', name: 'Öğrenci' },
  { key: 'ogretim_elemani', name: 'Öğretim Elemanı' },
  { key: 'danisman', name: 'Danışman' },
  { key: 'oidb', name: 'Öğrenci İşleri' },
  { key: 'sistem_yoneticisi', name: 'Sistem Yöneticisi' },
];

// Demo sağlık ağırlıklı: 3 fakülte, 10 program.
const FACULTIES: { code: string; name: string; departments: { code: string; name: string }[] }[] = [
  {
    code: 'TIP',
    name: 'Tıp Fakültesi',
    departments: [{ code: 'TIP-TEM', name: 'Temel Tıp Bilimleri' }],
  },
  {
    code: 'DIS',
    name: 'Diş Hekimliği Fakültesi',
    departments: [{ code: 'DIS-KLN', name: 'Klinik Diş Hekimliği' }],
  },
  {
    code: 'SAG',
    name: 'Sağlık Bilimleri Fakültesi',
    departments: [
      { code: 'SAG-HEM', name: 'Hemşirelik' },
      { code: 'SAG-FTR', name: 'Fizyoterapi ve Rehabilitasyon' },
    ],
  },
];

const PROGRAMS: { code: string; name: string; level: string; dept: string }[] = [
  { code: 'TIP', name: 'Tıp', level: 'lisans', dept: 'TIP-TEM' },
  { code: 'DIS', name: 'Diş Hekimliği', level: 'lisans', dept: 'DIS-KLN' },
  { code: 'HEM', name: 'Hemşirelik', level: 'lisans', dept: 'SAG-HEM' },
  { code: 'FTR', name: 'Fizyoterapi ve Rehabilitasyon', level: 'lisans', dept: 'SAG-FTR' },
  { code: 'BES', name: 'Beslenme ve Diyetetik', level: 'lisans', dept: 'SAG-HEM' },
  { code: 'ECZ', name: 'Eczacılık', level: 'lisans', dept: 'SAG-HEM' },
  { code: 'ODY', name: 'Odyoloji', level: 'lisans', dept: 'SAG-FTR' },
  { code: 'EBE', name: 'Ebelik', level: 'lisans', dept: 'SAG-HEM' },
  { code: 'HEM-YL', name: 'Hemşirelik (Yüksek Lisans)', level: 'yuksek_lisans', dept: 'SAG-HEM' },
  { code: 'FTR-YL', name: 'Fizyoterapi (Yüksek Lisans)', level: 'yuksek_lisans', dept: 'SAG-FTR' },
];

// Ortak zorunlu dersler + örnek program dersleri.
const COURSES: { code: string; nameTr: string; ects: number; local: number }[] = [
  { code: 'ATA101', nameTr: 'Atatürk İlkeleri ve İnkılap Tarihi I', ects: 2, local: 2 },
  { code: 'TDL101', nameTr: 'Türk Dili I', ects: 2, local: 2 },
  { code: 'YDL101', nameTr: 'Yabancı Dil I', ects: 3, local: 3 },
  { code: 'BIY101', nameTr: 'Tıbbi Biyoloji', ects: 6, local: 4 },
  { code: 'ANA101', nameTr: 'Anatomi', ects: 8, local: 6 },
  { code: 'FIZ101', nameTr: 'Fizyoloji', ects: 6, local: 4 },
  { code: 'BIO101', nameTr: 'Biyokimya', ects: 5, local: 4 },
];

// VARSAYIM harf notu ölçeği (docs/ASSUMPTIONS.md).
const GRADE_BANDS: GradeBand[] = [
  { letter: 'AA', minScore: 90, coefficient: 4.0, countsInGpa: true, isPassing: true },
  { letter: 'BA', minScore: 85, coefficient: 3.5, countsInGpa: true, isPassing: true },
  { letter: 'BB', minScore: 80, coefficient: 3.0, countsInGpa: true, isPassing: true },
  { letter: 'CB', minScore: 75, coefficient: 2.5, countsInGpa: true, isPassing: true },
  { letter: 'CC', minScore: 65, coefficient: 2.0, countsInGpa: true, isPassing: true },
  { letter: 'DC', minScore: 58, coefficient: 1.5, countsInGpa: true, isPassing: true },
  { letter: 'DD', minScore: 50, coefficient: 1.0, countsInGpa: true, isPassing: true },
  { letter: 'FF', minScore: 0, coefficient: 0.0, countsInGpa: true, isPassing: false },
];

async function main(): Promise<void> {
  loadEnvFile();
  const env = loadEnv();
  const sql = postgres(env.DATABASE_MIGRATE_URL, { max: 1 });
  try {
    const [tenant] = await sql<{ id: string }[]>`
      insert into tenants (slug, name, deployment_mode)
      values (${'demo'}, ${'Demo Üniversitesi'}, ${env.DEPLOYMENT_MODE})
      on conflict (slug) do update set name = excluded.name returning id`;
    const tid = tenant!.id;

    for (const r of ROLES) {
      await sql`insert into roles (tenant_id, key, name) values (${tid}, ${r.key}, ${r.name})
        on conflict (tenant_id, key) do nothing`;
    }

    // Fakülte/bölüm.
    const deptId = new Map<string, string>();
    for (const f of FACULTIES) {
      const [fac] = await sql<{ id: string }[]>`
        insert into faculties (tenant_id, code, name) values (${tid}, ${f.code}, ${f.name})
        on conflict (tenant_id, code) do update set name = excluded.name returning id`;
      for (const d of f.departments) {
        const [dep] = await sql<{ id: string }[]>`
          insert into departments (tenant_id, faculty_id, code, name)
          values (${tid}, ${fac!.id}, ${d.code}, ${d.name})
          on conflict (tenant_id, code) do update set name = excluded.name returning id`;
        deptId.set(d.code, dep!.id);
      }
    }

    // Program + her programa müfredat versiyonu (2023).
    const programCurriculum: { programId: string; curriculumVersionId: string }[] = [];
    for (const p of PROGRAMS) {
      const [prog] = await sql<{ id: string }[]>`
        insert into programs (tenant_id, department_id, code, name, level)
        values (${tid}, ${deptId.get(p.dept)!}, ${p.code}, ${p.name}, ${p.level})
        on conflict (tenant_id, code) do update set name = excluded.name returning id`;
      const [cv] = await sql<{ id: string }[]>`
        insert into curriculum_versions (tenant_id, program_id, year, name)
        values (${tid}, ${prog!.id}, ${2023}, ${'2023 Müfredatı'})
        on conflict (program_id, year) do update set name = excluded.name returning id`;
      programCurriculum.push({ programId: prog!.id, curriculumVersionId: cv!.id });
    }

    // Ders kataloğu + ilk programın müfredatına bağla (örnek).
    const courseId = new Map<string, { id: string; ects: number }>();
    for (const c of COURSES) {
      const [course] = await sql<{ id: string }[]>`
        insert into courses (tenant_id, code, name_tr, ects, local_credit)
        values (${tid}, ${c.code}, ${c.nameTr}, ${c.ects}, ${c.local})
        on conflict (tenant_id, code) do update set name_tr = excluded.name_tr returning id`;
      courseId.set(c.code, { id: course!.id, ects: c.ects });
    }
    const firstCv = programCurriculum[0]!.curriculumVersionId;
    let sem = 1;
    for (const c of COURSES) {
      await sql`insert into curriculum_courses
        (tenant_id, curriculum_version_id, course_id, semester_no, is_mandatory)
        values (${tid}, ${firstCv}, ${courseId.get(c.code)!.id}, ${sem}, ${true})
        on conflict (curriculum_version_id, course_id) do nothing`;
      sem = sem === 2 ? 1 : sem + 1;
    }

    // Mevzuat parametreleri (tenant geneli, program_id NULL). VARSAYIM değerler.
    await sql`insert into grade_scales (tenant_id, code, name, bands, effective_from)
      values (${tid}, ${'demo-lisans'}, ${'Demo Lisans Harf Ölçeği'}, ${JSON.stringify(
        GRADE_BANDS,
      )}, ${'2023-09-01'})
      on conflict (tenant_id, code, effective_from) do nothing`;
    await sql`insert into gpa_policies (tenant_id, repeat_policy, rounding_digits, rounding_mode, effective_from)
      values (${tid}, ${'last'}, ${2}, ${'half-up'}, ${'2023-09-01'})`.catch(() => undefined);
    await sql`insert into academic_rule_sets (tenant_id, rules, effective_from)
      values (${tid}, ${JSON.stringify({
        minEctsPerTerm: 30,
        maxEctsPerTerm: 45,
        gpaBoostThreshold: 3.0,
        maxEctsWithBoost: 51,
        maxAbsenceTheoryPct: 30,
        maxAbsencePracticePct: 20,
        minGraduationGpa: 2.0,
      })}, ${'2023-09-01'})`.catch(() => undefined);

    // Akademik takvim: aktif dönem + kayıt/ekle-sil pencereleri.
    const [term] = await sql<{ id: string }[]>`
      insert into academic_terms (tenant_id, year, term, name, starts_on, ends_on, is_active)
      values (${tid}, ${2024}, ${'guz'}, ${'2024-2025 Güz'}, ${'2024-09-16'}, ${'2025-01-17'}, ${true})
      on conflict (tenant_id, year, term) do update set is_active = excluded.is_active returning id`;
    await sql`delete from calendar_events where term_id = ${term!.id}`;
    await sql`insert into calendar_events (tenant_id, term_id, type, starts_at, ends_at) values
      (${tid}, ${term!.id}, ${'kayit'}, ${'2024-09-09T06:00:00Z'}, ${'2024-09-14T21:00:00Z'}),
      (${tid}, ${term!.id}, ${'ekle_sil'}, ${'2024-09-16T06:00:00Z'}, ${'2024-09-20T21:00:00Z'})`;

    // Admin + 200 sahte öğrenci (kullanıcı + öğrenci kaydı).
    const hash = await argonHash('Parola123!', { algorithm: Algorithm.Argon2id });
    await sql`insert into users (tenant_id, email, password_hash)
      values (${tid}, ${'admin@example.edu'}, ${hash})
      on conflict (tenant_id, email) do nothing`;

    let students = 0;
    for (let i = 1; i <= 200; i += 1) {
      const email = `ogrenci${String(i).padStart(3, '0')}@example.edu`;
      const [u] = await sql<{ id: string }[]>`
        insert into users (tenant_id, email, password_hash) values (${tid}, ${email}, ${hash})
        on conflict (tenant_id, email) do update set email = excluded.email returning id`;
      const pc = programCurriculum[i % programCurriculum.length]!;
      const studentNo = `2023${String(i).padStart(4, '0')}`;
      const res = await sql`insert into students
        (tenant_id, user_id, program_id, curriculum_version_id, student_no, status)
        values (${tid}, ${u!.id}, ${pc.programId}, ${pc.curriculumVersionId}, ${studentNo}, ${'aktif'})
        on conflict (tenant_id, student_no) do nothing`;
      students += res.count;
    }

    console.warn(
      `Seed tamam: tenant=demo, fakülte=${FACULTIES.length}, program=${PROGRAMS.length}, ` +
        `ders=${COURSES.length}, yeni öğrenci=${students}/200, aktif dönem=2024-2025 Güz`,
    );
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error('Seed hatası:', err);
  process.exitCode = 1;
});
