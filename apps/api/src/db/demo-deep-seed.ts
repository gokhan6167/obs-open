import { Algorithm, hash as argonHash } from '@node-rs/argon2';
import postgres from 'postgres';
import type { GradeBand } from '@obs/academic-core';
import { loadEnv } from '../config/env.js';
import { loadEnvFile } from '../config/load-env-file.js';

/**
 * DERİN VİTRİN demo verisi. Çalışma sırası:
 *   db:seed -> db:demo -> db:demo-login -> db:demo-staff -> db:demo-deep
 *
 * Amaç: HER rol panelinde ekranlar dolu görünsün diye MEVCUT şemayı (yeni tablo
 * gerektirmeden) gerçek örüntülerle zenginleştirir. Migration GEREKTİRMEZ — tüm
 * kolonlar hâlihazırda migration'larda mevcut (advisor_user_id 0012_portal ile).
 *
 * Bu seed idempotenttir (on conflict do nothing / delete-then-insert). GERÇEK VERİ YOK.
 *
 * Zenginleştirdiği alanlar:
 *  - Danışman ↔ öğrenci eşlemesi (advisor_user_id), farklı risk profilleri.
 *  - Bölüm başkanı ↔ bölüm eşlemesi (department_heads), 2 başkan.
 *  - Aktif dönem şubeleri + instructor ataması (bazıları null = hoca atanmamış).
 *  - Enrollments: approved / submitted (bazıları kota/önkoşul ihlali) / withdrawn.
 *  - grade_components (Vize/Ödev/Final = %100) + kısmen dolu component_scores.
 *  - grades: draft + announced karışık (Not Düzeltme demosu).
 *  - attendance: theory+practice, bir derste NA riski (eşiğe yakın devamsızlık).
 *  - invoices: paid + partial + unpaid; payments (kısmi ödeme makbuz geçmişi).
 *  - notifications: giriş öğrencisine 4 örnek bildirim.
 *  - requests: submitted (İptal butonu demosu) + sonuçlanmış.
 *  - double_major_applications: submitted + karışık durum/tür.
 *  - advisor_notes: danışan görüşme geçmişi.
 *  - governance_sessions/decisions: kapanmış kurul + karar defteri arşivi.
 *  - program_outcomes / course_outcomes / outcome_relations + course_bologna.
 *  - grade_scales: bağıl (relative) ölçek örneği (mutlak zaten seed.ts'te).
 *  - health: rotations / rotation_assignments / internships (TIP/HEM/FTR öğrencileri).
 */

const PASSWORD = 'Parola123!';
const DANISMAN_EMAIL = 'danisman@example.edu';
const HOCA_EMAIL = 'hoca@example.edu';
const BASKAN_EMAIL = 'baskan@example.edu';

/** Harf notu bantları (mutlak) — component/grade türetimi için. */
const BANDS: { letter: string; min: number; coef: number }[] = [
  { letter: 'AA', min: 90, coef: 4.0 },
  { letter: 'BA', min: 85, coef: 3.5 },
  { letter: 'BB', min: 80, coef: 3.0 },
  { letter: 'CB', min: 75, coef: 2.5 },
  { letter: 'CC', min: 65, coef: 2.0 },
  { letter: 'DC', min: 58, coef: 1.5 },
  { letter: 'DD', min: 50, coef: 1.0 },
  { letter: 'FF', min: 0, coef: 0.0 },
];

function letterFor(score: number): { letter: string; coef: number } {
  for (const b of BANDS) if (score >= b.min) return { letter: b.letter, coef: b.coef };
  return { letter: 'FF', coef: 0 };
}

/** Bağıl (relative) ölçek örneği — evaluationType farkı demoda görülsün. */
const RELATIVE_BANDS: GradeBand[] = [
  { letter: 'AA', minScore: 80, coefficient: 4.0, countsInGpa: true, isPassing: true },
  { letter: 'BA', minScore: 72, coefficient: 3.5, countsInGpa: true, isPassing: true },
  { letter: 'BB', minScore: 64, coefficient: 3.0, countsInGpa: true, isPassing: true },
  { letter: 'CB', minScore: 56, coefficient: 2.5, countsInGpa: true, isPassing: true },
  { letter: 'CC', minScore: 48, coefficient: 2.0, countsInGpa: true, isPassing: true },
  { letter: 'DC', minScore: 40, coefficient: 1.5, countsInGpa: true, isPassing: true },
  { letter: 'DD', minScore: 32, coefficient: 1.0, countsInGpa: true, isPassing: true },
  { letter: 'FF', minScore: 0, coefficient: 0.0, countsInGpa: true, isPassing: false },
];

/**
 * Danışan kohortu: seed.ts'in ürettiği 200 öğrenciden farklı risk profillerine
 * yayılmış 12 öğrenci. avg = tüm derslerin ortalama ham puanı (GNO'yu sürükler).
 * status: aktif hariç birkaçı 'mezun'/'kayit_dondurdu' (pano oran kartları için).
 */
const COHORT: { no: string; avg: number; status: string; note?: string }[] = [
  { no: '20230010', avg: 45, status: 'aktif', note: 'GNO<1.80 riskli' },
  { no: '20230020', avg: 52, status: 'aktif', note: 'GNO<1.80 riskli' },
  { no: '20230030', avg: 58, status: 'aktif', note: 'GNO<1.80 riskli' },
  { no: '20230040', avg: 68, status: 'aktif', note: '1.80-2.00 izlemede' },
  { no: '20230050', avg: 70, status: 'aktif', note: '1.80-2.00 izlemede' },
  { no: '20230060', avg: 82, status: 'aktif', note: 'normal' },
  { no: '20230070', avg: 85, status: 'aktif', note: 'normal' },
  { no: '20230080', avg: 88, status: 'aktif', note: 'normal' },
  { no: '20230090', avg: 91, status: 'aktif', note: 'onur' },
  { no: '20230100', avg: 93, status: 'aktif', note: 'mezuniyete uygun (onur)' },
  { no: '20230110', avg: 78, status: 'kayit_dondurdu', note: 'kayıt donduran' },
  { no: '20230120', avg: 89, status: 'mezun', note: 'mezun' },
];

/** Ortak dersler (seed.ts COURSES ile aynı kod seti). */
const COURSE_CODES = ['ATA101', 'TDL101', 'YDL101', 'BIY101', 'ANA101', 'FIZ101', 'BIO101'] as const;

interface Ctx {
  sql: postgres.Sql;
  tid: string;
  termId: string;
  pastTermId: string;
}

async function userIdByEmail(c: Ctx, email: string): Promise<string | null> {
  const [row] = await c.sql<{ id: string }[]>`
    select id from users where tenant_id = ${c.tid} and email = ${email}`;
  return row?.id ?? null;
}

async function studentByNo(
  c: Ctx,
  no: string,
): Promise<{ id: string; userId: string; programId: string } | null> {
  const [row] = await c.sql<{ id: string; user_id: string; program_id: string }[]>`
    select id, user_id, program_id from students where tenant_id = ${c.tid} and student_no = ${no}`;
  return row ? { id: row.id, userId: row.user_id, programId: row.program_id } : null;
}

/** Aktif dönemde bir kurs için şube (idempotent). instructor null bırakılabilir. */
async function ensureSection(
  c: Ctx,
  courseId: string,
  code: string,
  quota: number,
  filled: number,
  instructorUserId: string | null,
  termId = c.termId,
): Promise<string> {
  const safeFilled = Math.min(filled, quota); // sections_filled_ck: filled <= quota
  const [sec] = await c.sql<{ id: string }[]>`
    insert into sections (tenant_id, course_id, term_id, code, quota, filled, instructor_user_id)
    values (${c.tid}, ${courseId}, ${termId}, ${code}, ${quota}, ${safeFilled}, ${instructorUserId})
    on conflict (tenant_id, course_id, term_id, code) do update
      set quota = excluded.quota, filled = excluded.filled,
          instructor_user_id = excluded.instructor_user_id
    returning id`;
  return sec!.id;
}

async function main(): Promise<void> {
  loadEnvFile();
  const env = loadEnv();
  const sql = postgres(env.DATABASE_MIGRATE_URL, { max: 1 });
  try {
    const [tenant] = await sql<{ id: string }[]>`select id from tenants where slug = 'demo'`;
    if (!tenant) throw new Error('Önce db:seed çalıştırın (demo tenant yok)');
    const tid = tenant.id;

    const [term] = await sql<{ id: string }[]>`
      select id from academic_terms where tenant_id = ${tid} and is_active = true limit 1`;
    if (!term) throw new Error('Aktif dönem yok (önce db:seed)');

    // Geçmiş dönem (demo-login-seed 2023 Güz'ü ekler; yoksa oluştur).
    const [pastTerm] = await sql<{ id: string }[]>`
      insert into academic_terms (tenant_id, year, term, name, starts_on, ends_on, is_active)
      values (${tid}, ${2023}, ${'guz'}, ${'2023-2024 Güz'}, ${'2023-09-18'}, ${'2024-01-19'}, ${false})
      on conflict (tenant_id, year, term) do update set name = excluded.name returning id`;

    const c: Ctx = { sql, tid, termId: term.id, pastTermId: pastTerm!.id };

    // Kurs id + ects haritası.
    const courseMap = new Map<string, { id: string; ects: number }>();
    for (const row of await sql<{ id: string; code: string; ects: number }[]>`
      select id, code, ects from courses where tenant_id = ${tid} and code in ${sql(
        COURSE_CODES as unknown as string[],
      )}`) {
      courseMap.set(row.code, { id: row.id, ects: row.ects });
    }

    const danismanId = await userIdByEmail(c, DANISMAN_EMAIL);
    const hocaId = await userIdByEmail(c, HOCA_EMAIL);
    const baskanId = await userIdByEmail(c, BASKAN_EMAIL);
    if (!danismanId) throw new Error('danisman@ yok (önce db:demo-staff)');

    // İkinci danışman: hoca@ (izolasyon testi için 2 farklı danışman).
    const advisor2 = hocaId ?? danismanId;

    // === 1) Bağıl ölçek örneği (evaluationType farkı) ===
    await sql`insert into grade_scales (tenant_id, code, name, bands, effective_from, is_active)
      values (${tid}, ${'demo-bagil'}, ${'Demo Bağıl (Relative) Ölçek'}, ${JSON.stringify(
        RELATIVE_BANDS,
      )}, ${'2023-09-01'}, ${false})
      on conflict (tenant_id, code, effective_from) do nothing`;

    // === 2) Bölüm başkanı eşlemesi (department_heads) ===
    if (baskanId) {
      const depts = await sql<{ id: string; code: string }[]>`
        select id, code from departments where tenant_id = ${tid} and code in ('SAG-HEM','SAG-FTR')`;
      for (const d of depts) {
        await sql`insert into department_heads (tenant_id, user_id, department_id)
          values (${tid}, ${baskanId}, ${d.id})
          on conflict on constraint department_heads_uq do nothing`;
      }
      // İkinci başkan: dekan@ varsa TIP-TEM'e bağla.
      const dekanId = await userIdByEmail(c, 'dekan@example.edu');
      if (dekanId) {
        const [tip] = await sql<{ id: string }[]>`
          select id from departments where tenant_id = ${tid} and code = 'TIP-TEM'`;
        if (tip) {
          await sql`insert into department_heads (tenant_id, user_id, department_id)
            values (${tid}, ${dekanId}, ${tip.id})
            on conflict on constraint department_heads_uq do nothing`;
        }
      }
    }

    // === 3) Aktif dönem şubeleri (instructor karışık: bazıları null) ===
    // Doluluk çeşitliliği: bazıları %100+ (danger), bazıları düşük, biri hocasız.
    const secATA = await ensureSection(c, courseMap.get('ATA101')!.id, 'D1', 60, 62, hocaId); // %103 danger
    const secBIY = await ensureSection(c, courseMap.get('BIY101')!.id, 'D1', 40, 18, hocaId); // düşük
    const secANA = await ensureSection(c, courseMap.get('ANA101')!.id, 'D1', 50, 50, danismanId); // %100 dolu (kota ihlali senaryosu)
    const secFIZ = await ensureSection(c, courseMap.get('FIZ101')!.id, 'D1', 45, 30, null); // hocasız (aksiyon sinyali)
    const secBIO = await ensureSection(c, courseMap.get('BIO101')!.id, 'D1', 45, 12, hocaId);

    // === 4) Danışan kohortu: advisor ata + not/enrollment/grade/attendance/invoice ===
    const cohortStudents: { id: string; userId: string; no: string; avg: number }[] = [];
    for (const [i, spec] of COHORT.entries()) {
      const stu = await studentByNo(c, spec.no);
      if (!stu) continue; // seed.ts 200 öğrenci üretmemişse atla.
      const advisor = i < 8 ? danismanId : advisor2; // ilk 8 danisman@, kalanı 2. danışman.
      await sql`update students set advisor_user_id = ${advisor}, status = ${spec.status}
        where id = ${stu.id}`;
      cohortStudents.push({ id: stu.id, userId: stu.userId, no: spec.no, avg: spec.avg });

      // Geçmiş dönem: tüm ortak derslere announced not (GNO tabanı).
      await sql`delete from grades where student_id = ${stu.id} and term_id = ${c.pastTermId}`;
      await sql`delete from enrollments where student_id = ${stu.id} and term_id = ${c.pastTermId}`;
      for (const code of COURSE_CODES) {
        const course = courseMap.get(code);
        if (!course) continue;
        const secId = await ensureSection(c, course.id, 'P1', 80, 1, hocaId, c.pastTermId);
        await sql`insert into enrollments (tenant_id, student_id, section_id, term_id, status)
          values (${tid}, ${stu.id}, ${secId}, ${c.pastTermId}, ${'approved'})
          on conflict (student_id, section_id) do nothing`;
        // avg etrafında ±4 puan salınım -> gerçekçi harf dağılımı.
        const score = Math.max(0, Math.min(100, spec.avg + ((code.charCodeAt(3) % 9) - 4)));
        const lg = letterFor(score);
        await sql`insert into grades (tenant_id, student_id, section_id, term_id, raw_score, letter, coefficient, status)
          values (${tid}, ${stu.id}, ${secId}, ${c.pastTermId}, ${score}, ${lg.letter}, ${lg.coef}, ${'announced'})
          on conflict (student_id, section_id) do nothing`;
      }
    }

    // === 5) Aktif dönem enrollments (approved / submitted-sorunlu / withdrawn) ===
    // Danışan öğrencilerin ilk 4'ü için aktif dönem kayıtları.
    const activeCohort = cohortStudents.slice(0, 4);
    for (const [i, stu] of activeCohort.entries()) {
      // approved: ATA101 (Not Düzeltme / not-girişi demosu buradan beslenir).
      await sql`insert into enrollments (tenant_id, student_id, section_id, term_id, status)
        values (${tid}, ${stu.id}, ${secATA}, ${c.termId}, ${'approved'})
        on conflict (student_id, section_id) do nothing`;
      // approved: BIY101.
      await sql`insert into enrollments (tenant_id, student_id, section_id, term_id, status)
        values (${tid}, ${stu.id}, ${secBIY}, ${c.termId}, ${'approved'})
        on conflict (student_id, section_id) do nothing`;
      // submitted (onay kuyruğu): ANA101 kota dolu -> flagged.
      if (i < 3) {
        await sql`insert into enrollments (tenant_id, student_id, section_id, term_id, status)
          values (${tid}, ${stu.id}, ${secANA}, ${c.termId}, ${'submitted'})
          on conflict (student_id, section_id) do nothing`;
      }
      // submitted temiz: BIO101.
      if (i < 2) {
        await sql`insert into enrollments (tenant_id, student_id, section_id, term_id, status)
          values (${tid}, ${stu.id}, ${secBIO}, ${c.termId}, ${'submitted'})
          on conflict (student_id, section_id) do nothing`;
      }
      // withdrawn örneği (Ders Bırak akışı geçmişi): FIZ101.
      if (i === 0) {
        await sql`insert into enrollments (tenant_id, student_id, section_id, term_id, status)
          values (${tid}, ${stu.id}, ${secFIZ}, ${c.termId}, ${'withdrawn'})
          on conflict (student_id, section_id) do nothing`;
      }
    }

    // === 6) grade_components (Vize %40 / Ödev %20 / Final %40) + kısmi scores ===
    const compDefs: { name: string; weight: number }[] = [
      { name: 'Vize', weight: 40 },
      { name: 'Ödev', weight: 20 },
      { name: 'Final', weight: 40 },
    ];
    const compTargets = [secATA, secBIY];
    for (const secId of compTargets) {
      const compIds = new Map<string, string>();
      for (const cd of compDefs) {
        const [comp] = await sql<{ id: string }[]>`
          insert into grade_components (tenant_id, section_id, name, weight, locked)
          values (${tid}, ${secId}, ${cd.name}, ${cd.weight}, ${true})
          on conflict (section_id, name) do update set weight = excluded.weight returning id`;
        compIds.set(cd.name, comp!.id);
      }
      // Bu şubeye approved öğrenciler için component_scores: bir kısmı dolu, bir kısmı boş.
      const enrolled = await sql<{ student_id: string }[]>`
        select student_id from enrollments
        where section_id = ${secId} and status = 'approved'`;
      for (const [idx, e] of enrolled.entries()) {
        // Öğrencilerin yarısına Vize+Ödev girilir, Final boş (bileşen bazlı giriş demosu).
        if (idx % 2 === 0) {
          await sql`insert into component_scores (tenant_id, component_id, student_id, score)
            values (${tid}, ${compIds.get('Vize')!}, ${e.student_id}, ${65 + (idx % 30)})
            on conflict (component_id, student_id) do nothing`;
          await sql`insert into component_scores (tenant_id, component_id, student_id, score)
            values (${tid}, ${compIds.get('Ödev')!}, ${e.student_id}, ${70 + (idx % 25)})
            on conflict (component_id, student_id) do nothing`;
        }
      }
    }

    // === 7) grades aktif dönem: draft + announced karışık (Not Düzeltme demosu) ===
    // secATA'daki approved öğrencilerden bazıları draft, bazıları announced;
    // ayrıca not HENÜZ girilmemiş satırlar (grade yok) da kalsın (ilk giriş demosu).
    {
      const enrolled = await sql<{ student_id: string }[]>`
        select student_id from enrollments where section_id = ${secATA} and status = 'approved'`;
      for (const [idx, e] of enrolled.entries()) {
        if (idx % 3 === 2) continue; // 1/3'ünde not YOK (ilk giriş demosu).
        const score = 60 + (idx * 7) % 40;
        const lg = letterFor(score);
        const status = idx % 3 === 0 ? 'announced' : 'draft';
        await sql`insert into grades (tenant_id, student_id, section_id, term_id, raw_score, letter, coefficient, status, evaluation_type)
          values (${tid}, ${e.student_id}, ${secATA}, ${c.termId}, ${score}, ${lg.letter}, ${lg.coef}, ${status}, ${'absolute'})
          on conflict (student_id, section_id) do nothing`;
      }
    }

    // === 8) attendance: theory + practice; secBIO'da NA riski senaryosu ===
    // Devamsızlık eşiği: theory %30, practice %20 (academic_rule_sets).
    // secATA: hafif devamsızlık (present çoğunlukla true).
    // secBIO: bir öğrenci eşiğe yakın (NA riski) -> devamsizlik sayfası gerçek oran.
    {
      const dates = [
        '2024-09-23', '2024-09-30', '2024-10-07', '2024-10-14',
        '2024-10-21', '2024-10-28', '2024-11-04', '2024-11-11',
        '2024-11-18', '2024-11-25',
      ];
      // secATA approved öğrencileri: her hafta theory; birkaç absent.
      const ataStu = await sql<{ student_id: string }[]>`
        select student_id from enrollments where section_id = ${secATA} and status = 'approved'`;
      for (const [si, e] of ataStu.entries()) {
        for (const [di, d] of dates.entries()) {
          // İlk öğrenci 4/10 absent (theory %40 > %30 -> NA riski/kaldı).
          const absent = si === 0 ? di < 4 : (di + si) % 6 === 0;
          await sql`insert into attendance (tenant_id, section_id, student_id, session_date, kind, present)
            values (${tid}, ${secATA}, ${e.student_id}, ${d}, ${'theory'}, ${!absent})
            on conflict (section_id, student_id, session_date, kind) do nothing`;
        }
      }
      // secBIO approved öğrencileri: theory + practice; bir öğrenci practice eşiğine yakın.
      const bioStu = await sql<{ student_id: string }[]>`
        select student_id from enrollments where section_id = ${secBIO} and status = 'approved'`;
      for (const [si, e] of bioStu.entries()) {
        for (const [di, d] of dates.entries()) {
          const theoryAbsent = (di + si) % 7 === 0;
          await sql`insert into attendance (tenant_id, section_id, student_id, session_date, kind, present)
            values (${tid}, ${secBIO}, ${e.student_id}, ${d}, ${'theory'}, ${!theoryAbsent})
            on conflict (section_id, student_id, session_date, kind) do nothing`;
          // practice: ilk öğrenci 2/10 absent (%20 = eşikte, NA riski).
          const practiceAbsent = si === 0 ? di < 2 : di === 0 && si % 3 === 0;
          await sql`insert into attendance (tenant_id, section_id, student_id, session_date, kind, present)
            values (${tid}, ${secBIO}, ${e.student_id}, ${d}, ${'practice'}, ${!practiceAbsent})
            on conflict (section_id, student_id, session_date, kind) do nothing`;
        }
      }
    }

    // === 9) invoices + payments (paid / partial / unpaid) ===
    // fee_schedule: her danışan programı × 2024. burs (scholarship) net'i düşürür.
    for (const [i, stu] of cohortStudents.entries()) {
      const s = await studentByNo(c, stu.no);
      if (!s) continue;
      // fee schedule (program×2024) — idempotent.
      await sql`insert into fee_schedules (tenant_id, program_id, year, base_amount)
        values (${tid}, ${s.programId}, ${2024}, ${6000000})
        on conflict (program_id, year) do nothing`;
      // burs: her 4. öğrenciye %50 (rate_bps 5000).
      if (i % 4 === 0) {
        await sql`insert into scholarships (tenant_id, student_id, type, rate_bps, effective_from)
          values (${tid}, ${stu.id}, ${'basari'}, ${5000}, ${'2024-09-01'})`.catch(() => undefined);
      }
      const gross = 6000000;
      const net = i % 4 === 0 ? 3000000 : gross;
      // İlk öğrenciye unpaid (mali engel rozeti), ikinciye partial, üçüncüye paid; kalan döngü.
      const kind = i % 3; // 0 unpaid, 1 partial, 2 paid
      const paid = kind === 0 ? 0 : kind === 1 ? Math.floor(net / 3) : net;
      const status = kind === 0 ? 'unpaid' : kind === 1 ? 'partial' : 'paid';
      // Idempotent: bu öğrencinin 2024 dönemine ait faturayı sil-yeniden yaz.
      await sql`delete from payments where invoice_id in (
        select id from invoices where student_id = ${stu.id} and term_id = ${c.termId})`;
      await sql`delete from invoices where student_id = ${stu.id} and term_id = ${c.termId}`;
      const [inv] = await sql<{ id: string }[]>`
        insert into invoices (tenant_id, student_id, term_id, amount, paid_amount, status)
        values (${tid}, ${stu.id}, ${c.termId}, ${net}, ${paid}, ${status}) returning id`;
      if (paid > 0) {
        // Kısmi/tam ödeme: 1-2 makbuz (dekont geçmişi).
        await sql`insert into payments (tenant_id, invoice_id, amount, provider, idempotency_key, provider_ref, status)
          values (${tid}, ${inv!.id}, ${paid}, ${'mock'}, ${`deep-pay-${stu.no}-1`}, ${`DEKONT-${stu.no}`}, ${'success'})
          on conflict (tenant_id, idempotency_key) do nothing`;
      }
    }

    // === 10) notifications: giriş öğrencisine (DEMO-0001) 4 örnek bildirim ===
    const [demoStu] = await sql<{ user_id: string }[]>`
      select user_id from students where tenant_id = ${tid} and student_no = 'DEMO-0001'`;
    if (demoStu) {
      await sql`delete from notifications where user_id = ${demoStu.user_id} and type like 'demo_%'`;
      const notifs: { type: string; title: string; body: string; read: boolean }[] = [
        {
          type: 'demo_request',
          title: 'Talebiniz Yanıtlandı',
          body: 'Kayıt dondurma talebiniz öğrenci işleri tarafından onaylanmıştır.',
          read: false,
        },
        {
          type: 'demo_enrollment',
          title: 'Ders Kaydınız Onaylandı',
          body: '2024-2025 Güz dönemi ders kaydınız danışmanınız tarafından onaylandı.',
          read: false,
        },
        {
          type: 'demo_finance',
          title: 'Borç Hatırlatma',
          body: 'Güz dönemi öğrenim ücretinizin kalan kısmı için son ödeme tarihi yaklaşıyor.',
          read: false,
        },
        {
          type: 'demo_graduation',
          title: 'Mezuniyet Ön Kontrol',
          body: 'Mezuniyet koşullarınızı sağlıyorsunuz; ön kontrol sonucunuz panelinizde.',
          read: true,
        },
      ];
      for (const n of notifs) {
        await sql`insert into notifications (tenant_id, user_id, type, title, body, read)
          values (${tid}, ${demoStu.user_id}, ${n.type}, ${n.title}, ${n.body}, ${n.read})`;
      }
    }

    // === 11) requests: submitted (İptal butonu) + sonuçlanmış + SLA gecikmiş ===
    if (cohortStudents[0]) {
      const rid = cohortStudents[0].id;
      await sql`delete from requests where student_id = ${rid} and type like 'demo_%'`;
      // (payload demo işaretiyle idempotent temizlik yapamıyoruz; type bazlı sil.)
    }
    // Kohorttan çeşitli talepler.
    {
      // Idempotent: kohort öğrencilerinin bu seed'ce üretilen taleplerini işaretle/sil.
      const ids = cohortStudents.map((s) => s.id);
      if (ids.length) {
        await sql`delete from requests where student_id in ${sql(ids)} and reviewer_user_id is null and payload->>'seed' = 'deep'`;
      }
      const reqSpecs: {
        stuIdx: number;
        type: string;
        payload: Record<string, unknown>;
        status: string;
        daysAgo: number;
        decisionReason?: string;
      }[] = [
        {
          stuIdx: 0,
          type: 'kayit_dondurma',
          payload: { seed: 'deep', sebep: 'Sağlık raporu nedeniyle bir dönem kayıt dondurma' },
          status: 'submitted',
          daysAgo: 1,
        },
        {
          stuIdx: 1,
          type: 'mazeret_sinavi',
          payload: { seed: 'deep', ders: 'ANA101', tarih: '2024-11-20', sebep: 'Rapor' },
          status: 'submitted',
          daysAgo: 4, // SLA gecikmiş rozeti (>3 gün).
        },
        {
          stuIdx: 2,
          type: 'belge',
          payload: { seed: 'deep', belgeTuru: 'Öğrenci Belgesi', adet: 2 },
          status: 'in_review',
          daysAgo: 2,
        },
        {
          stuIdx: 3,
          type: 'diger',
          payload: { seed: 'deep', konu: 'Ders muafiyeti', aciklama: 'Yatay geçiş ders muafiyeti' },
          status: 'approved',
          daysAgo: 6,
          decisionReason: 'Komisyon uygun görmüştür (Karar 2024/45).',
        },
      ];
      for (const r of reqSpecs) {
        const stu = cohortStudents[r.stuIdx];
        if (!stu) continue;
        const reviewer = r.status === 'submitted' ? null : (danismanId ?? null);
        await sql`insert into requests (tenant_id, student_id, type, payload, status, reviewer_user_id, decision_reason, created_at)
          values (${tid}, ${stu.id}, ${r.type}, ${JSON.stringify(r.payload)}, ${r.status}, ${reviewer}, ${
            r.decisionReason ?? null
          }, now() - (${r.daysAgo} || ' days')::interval)`;
      }
    }

    // === 12) double_major_applications: submitted (İptal) + karışık durum/tür ===
    {
      const targets = await sql<{ id: string; code: string }[]>`
        select id, code from programs where tenant_id = ${tid} and code in ('HEM','FTR','BES','ODY')`;
      const targetByCode = new Map(targets.map((t) => [t.code, t.id]));
      const ids = cohortStudents.map((s) => s.id);
      if (ids.length) {
        await sql`delete from double_major_applications where student_id in ${sql(ids)} and (eligibility->>'seed') = 'deep'`;
      }
      const capSpecs: {
        stuIdx: number;
        type: string;
        target: string;
        status: string;
        gpa: number;
      }[] = [
        { stuIdx: 5, type: 'cap', target: 'FTR', status: 'submitted', gpa: 3.4 }, // İptal edilebilir.
        { stuIdx: 6, type: 'yandal', target: 'HEM', status: 'submitted', gpa: 3.1 },
        { stuIdx: 7, type: 'cap', target: 'BES', status: 'in_review', gpa: 3.2 },
        { stuIdx: 8, type: 'cap', target: 'ODY', status: 'approved', gpa: 3.6 },
        { stuIdx: 0, type: 'cap', target: 'FTR', status: 'rejected', gpa: 1.7 }, // eşik altı = ret.
        { stuIdx: 4, type: 'yandal', target: 'HEM', status: 'in_review', gpa: 2.9 },
      ];
      for (const a of capSpecs) {
        const stu = cohortStudents[a.stuIdx];
        const targetId = targetByCode.get(a.target);
        if (!stu || !targetId) continue;
        const reviewer = a.status === 'submitted' ? null : (baskanId ?? danismanId ?? null);
        const reason =
          a.status === 'rejected'
            ? 'GNO eşiği (3.00) sağlanmıyor.'
            : a.status === 'approved'
              ? 'Uygun; kurul onayı verilmiştir.'
              : null;
        await sql`insert into double_major_applications
          (tenant_id, student_id, type, target_program_id, status, gpa_snapshot, eligibility, reviewer_user_id, decision_reason)
          values (${tid}, ${stu.id}, ${a.type}, ${targetId}, ${a.status}, ${a.gpa}, ${JSON.stringify(
            { seed: 'deep', gpaOk: a.gpa >= 3.0 },
          )}, ${reviewer}, ${reason})`;
      }
    }

    // === 13) advisor_notes: danışan görüşme geçmişi (zaman-çizelgesi dolu) ===
    if (danismanId) {
      const noteTargets = cohortStudents.slice(0, 3);
      for (const [i, stu] of noteTargets.entries()) {
        await sql`delete from advisor_notes where student_id = ${stu.id} and author_user_id = ${danismanId}`;
        const notes: { category: string; body: string; daysAgo: number }[] = [
          {
            category: 'gorusme',
            body: 'Dönem başı danışmanlık görüşmesi yapıldı; ders programı birlikte gözden geçirildi.',
            daysAgo: 30,
          },
          {
            category: i === 0 ? 'uyari' : 'yonlendirme',
            body:
              i === 0
                ? 'GNO düşüklüğü nedeniyle akademik uyarı görüşmesi; çalışma planı önerildi.'
                : 'Kariyer yönlendirmesi: ilgili seçmeli havuzu ve staj olanakları paylaşıldı.',
            daysAgo: 7,
          },
        ];
        for (const n of notes) {
          await sql`insert into advisor_notes (tenant_id, student_id, author_user_id, category, body, created_at)
            values (${tid}, ${stu.id}, ${danismanId}, ${n.category}, ${n.body}, now() - (${n.daysAgo} || ' days')::interval)`;
        }
      }
    }

    // === 14) governance: kapanmış kurul + karar defteri arşivi ===
    if (baskanId || danismanId) {
      const author = baskanId ?? danismanId;
      const [sess] = await sql<{ id: string }[]>`
        insert into governance_sessions (tenant_id, session_no, date, status, created_by_user_id)
        values (${tid}, ${'2024/12'}, ${'2024-11-05'}, ${'closed'}, ${author})
        on conflict on constraint governance_sessions_no_uq do update set status = 'closed' returning id`;
      const decisions: { no: string; subject: string; outcome: string; reason: string }[] = [
        {
          no: '2024/12-1',
          subject: 'Yatay geçiş ders muafiyeti başvurularının değerlendirilmesi',
          outcome: 'kabul',
          reason: 'Muafiyet komisyonu raporu doğrultusunda uygun görülmüştür.',
        },
        {
          no: '2024/12-2',
          subject: 'ÇAP başvurularının GNO eşiği açısından incelenmesi',
          outcome: 'kabul',
          reason: 'Eşiği sağlayan başvurular onaylanmıştır.',
        },
        {
          no: '2024/12-3',
          subject: 'Mazeret sınavı taleplerinin görüşülmesi',
          outcome: 'erteleme',
          reason: 'Ek belge talep edilmesine karar verilmiştir.',
        },
      ];
      for (const d of decisions) {
        await sql`insert into governance_decisions
          (tenant_id, session_id, decision_no, subject, outcome, reason, created_by_user_id)
          values (${tid}, ${sess!.id}, ${d.no}, ${d.subject}, ${d.outcome}, ${d.reason}, ${author})
          on conflict do nothing`;
      }
    }

    // === 15) Bologna: program_outcomes + course_outcomes + outcome_relations + course_bologna ===
    // TIP programının 2023 müfredatına (curriculum_courses) bağla.
    {
      const [tipProg] = await sql<{ id: string }[]>`
        select id from programs where tenant_id = ${tid} and code = 'TIP'`;
      if (tipProg) {
        const poDefs: { code: string; tr: string; tyyc: string }[] = [
          { code: 'PÇ1', tr: 'Temel tıp bilimleri alanındaki güncel bilgiye sahip olur.', tyyc: '1' },
          { code: 'PÇ2', tr: 'Klinik problemleri analiz eder ve kanıta dayalı çözüm üretir.', tyyc: '2' },
          { code: 'PÇ3', tr: 'Hasta ve toplum sağlığını gözeten uygulamalar yapar.', tyyc: '3' },
          { code: 'PÇ4', tr: 'Etik ilkelere ve mesleki sorumluluğa uygun davranır.', tyyc: '4' },
          { code: 'PÇ5', tr: 'Ekip içinde etkin iletişim kurar ve iş birliği yapar.', tyyc: '5' },
          { code: 'PÇ6', tr: 'Yaşam boyu öğrenme ve mesleki gelişim becerisi kazanır.', tyyc: '6' },
        ];
        const poIds = new Map<string, string>();
        for (const [i, po] of poDefs.entries()) {
          const [row] = await sql<{ id: string }[]>`
            insert into program_outcomes (tenant_id, program_id, code, text_tr, tyyc_dimension, sort_no)
            values (${tid}, ${tipProg.id}, ${po.code}, ${po.tr}, ${po.tyyc}, ${i})
            on conflict (program_id, code) do update set text_tr = excluded.text_tr returning id`;
          poIds.set(po.code, row!.id);
        }
        // TIP müfredat-dersleri.
        const ccs = await sql<{ id: string; code: string }[]>`
          select cc.id, co.code from curriculum_courses cc
          join courses co on co.id = cc.course_id
          join curriculum_versions cv on cv.id = cc.curriculum_version_id
          where cv.program_id = ${tipProg.id} and cc.tenant_id = ${tid}`;
        for (const cc of ccs) {
          // 4 öğrenme çıktısı (course_outcomes).
          for (let k = 1; k <= 4; k += 1) {
            await sql`insert into course_outcomes (tenant_id, curriculum_course_id, code, text_tr, sort_no)
              values (${tid}, ${cc.id}, ${`DÇ${k}`}, ${`${cc.code} dersine ait ${k}. öğrenme çıktısı.`}, ${k})
              on conflict (curriculum_course_id, code) do nothing`;
          }
          // PÇ-DÇ matrisi: gerçekçi dağılım (0-3), bazı PÇ yüksek bazı orta.
          const levels = [3, 2, 1, 0, 2, 1];
          for (const [pi, po] of poDefs.entries()) {
            const level = levels[(pi + cc.code.charCodeAt(0)) % levels.length]!;
            await sql`insert into outcome_relations (tenant_id, curriculum_course_id, program_outcome_id, level)
              values (${tid}, ${cc.id}, ${poIds.get(po.code)!}, ${level})
              on conflict (curriculum_course_id, program_outcome_id) do update set level = excluded.level`;
          }
          // course_bologna (dersin Bologna öğrenme çıktıları özeti).
          const [course] = await sql<{ id: string }[]>`
            select course_id as id from curriculum_courses where id = ${cc.id}`;
          if (course) {
            await sql`insert into course_bologna (tenant_id, course_id, learning_outcomes, order_no)
              values (${tid}, ${course.id}, ${JSON.stringify([
                `${cc.code} temel kavramlarını tanımlar.`,
                `${cc.code} yöntemlerini uygular.`,
                `${cc.code} bulgularını yorumlar.`,
              ])}, ${0})
              on conflict (tenant_id, course_id) do nothing`;
          }
        }
      }
    }

    // === 16) health: rotations / rotation_assignments / internships ===
    {
      const healthProgs = await sql<{ id: string; code: string }[]>`
        select id, code from programs where tenant_id = ${tid} and code in ('TIP','HEM','FTR')`;
      // Klinik siteler.
      const siteDefs: { code: string; name: string; cap: number }[] = [
        { code: 'EAH', name: 'Eğitim ve Araştırma Hastanesi', cap: 40 },
        { code: 'DEV', name: 'Devlet Hastanesi', cap: 25 },
        { code: 'ASM', name: 'Aile Sağlığı Merkezi', cap: 15 },
      ];
      const siteIds: string[] = [];
      for (const s of siteDefs) {
        const [row] = await sql<{ id: string }[]>`
          insert into clinical_sites (tenant_id, code, name, capacity)
          values (${tid}, ${s.code}, ${s.name}, ${s.cap})
          on conflict (tenant_id, code) do update set name = excluded.name returning id`;
        siteIds.push(row!.id);
      }
      for (const prog of healthProgs) {
        // Bu programın öğrencileri (rotasyon/staj için).
        const progStudents = await sql<{ id: string }[]>`
          select id from students where tenant_id = ${tid} and program_id = ${prog.id} limit 6`;
        if (!progStudents.length) continue;
        // Rotasyon tanımı.
        const [rot] = await sql<{ id: string }[]>`
          insert into rotations (tenant_id, program_id, term_id, name, group_count, weeks_per_group)
          values (${tid}, ${prog.id}, ${term.id}, ${`${prog.code} Klinik Rotasyonu`}, ${3}, ${4})
          returning id`.catch(() => [undefined as unknown as { id: string }]);
        if (rot?.id) {
          for (const [i, stu] of progStudents.entries()) {
            const site = siteIds[i % siteIds.length]!;
            await sql`insert into rotation_assignments
              (tenant_id, rotation_id, clinical_site_id, student_id, group_no, starts_on, ends_on, evaluation_score)
              values (${tid}, ${rot.id}, ${site}, ${stu.id}, ${(i % 3) + 1}, ${'2024-10-01'}, ${'2024-10-28'}, ${
                i % 2 === 0 ? 85 : null
              })
              on conflict (rotation_id, student_id) do nothing`;
          }
        }
        // Staj/intörnlük: ilk 3 öğrenciye karışık durum.
        const statuses = ['planned', 'ongoing', 'completed'];
        for (const [i, stu] of progStudents.slice(0, 3).entries()) {
          await sql`insert into internships
            (tenant_id, student_id, clinical_site_id, starts_on, ends_on, status, logbook_approved)
            values (${tid}, ${stu.id}, ${siteIds[i % siteIds.length]!}, ${'2024-11-01'}, ${'2024-12-13'}, ${
              statuses[i]!
            }, ${i === 2})`.catch(() => undefined);
        }
      }
    }

    // === Ortak parola'yı danışan kullanıcılarına ata (giriş test edilebilsin) ===
    const hash = await argonHash(PASSWORD, { algorithm: Algorithm.Argon2id });
    for (const stu of cohortStudents) {
      await sql`update users set password_hash = ${hash}, is_active = true where id = ${stu.userId}`;
    }
    // Danışan kullanıcılarına ogrenci rolü (giriş sonrası rol gerekiyorsa).
    const [ogrRole] = await sql<{ id: string }[]>`
      select id from roles where tenant_id = ${tid} and key = 'ogrenci'`;
    if (ogrRole) {
      for (const stu of cohortStudents) {
        await sql`insert into user_roles (tenant_id, user_id, role_id) values (${tid}, ${stu.userId}, ${ogrRole.id})
          on conflict on constraint user_roles_uq do nothing`;
      }
    }

    console.warn('=== DERİN VİTRİN DEMO HAZIR ===');
    console.warn(`TENANT_ID=${tid}  AKTİF_DÖNEM=${term.id}`);
    console.warn(`Danışan kohortu (advisor=${DANISMAN_EMAIL}, parola=${PASSWORD}):`);
    for (const stu of cohortStudents) console.warn(`  student_no=${stu.no} (avg~${stu.avg})`);
    console.warn('Şubeler: ATA101(D1 dolu/danger), BIY101(D1), ANA101(D1 kota-dolu), FIZ101(D1 hocasız), BIO101(D1 NA-riski)');
    console.warn('Doldu: enrollments(approved/submitted/withdrawn), grades(draft/announced), attendance(NA riski),');
    console.warn('       invoices(paid/partial/unpaid)+payments, notifications, requests(SLA), ÇAP, advisor_notes,');
    console.warn('       governance(kapalı kurul+karar), program/course outcomes+matris, health rotasyon/staj.');
  } finally {
    await sql.end();
  }
}

main().catch((err: unknown) => {
  console.error('Derin demo seed hatası:', err);
  process.exitCode = 1;
});
