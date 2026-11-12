-- 0022_graduate_coop: lisansustu tez tam sureci (TIK/juri/savunma/intihal),
-- doktora yeterlilik, staj kayitlari, CO-OP/kariyer. Additive + RLS.

-- Tez izleme komitesi (TIK) uyeleri
create table if not exists thesis_committees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  thesis_id uuid not null references thesis_topics(id) on delete cascade,
  member_user_id uuid references users(id) on delete set null,
  member_name text,
  role text not null default 'uye',        -- danisman / uye / baskan
  created_at timestamptz not null default now()
);
create index if not exists thesis_committees_thesis_idx on thesis_committees (tenant_id, thesis_id);

-- TIK toplanti/izleme raporlari
create table if not exists thesis_progress (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  thesis_id uuid not null references thesis_topics(id) on delete cascade,
  period text,                             -- or. 2025-Guz
  meeting_date date,
  result text not null default 'basarili', -- basarili / basarisiz / beklemede
  note text,
  created_at timestamptz not null default now()
);
create index if not exists thesis_progress_thesis_idx on thesis_progress (tenant_id, thesis_id);

-- Intihal (Turnitin) raporu
create table if not exists plagiarism_reports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  thesis_id uuid not null references thesis_topics(id) on delete cascade,
  similarity_pct numeric(5,2),
  threshold_pct numeric(5,2) default 20,
  passed boolean,
  report_url text,
  created_at timestamptz not null default now()
);
create index if not exists plagiarism_reports_thesis_idx on plagiarism_reports (tenant_id, thesis_id);

-- Tez savunmasi (juri + sonuc)
create table if not exists thesis_defenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  thesis_id uuid not null references thesis_topics(id) on delete cascade,
  defense_date date,
  location text,
  jury jsonb,                              -- [{name, role}]
  result text not null default 'beklemede', -- basarili / duzeltme / red / beklemede
  decision_no text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists thesis_defenses_thesis_idx on thesis_defenses (tenant_id, thesis_id);

-- Doktora yeterlilik sinavi
create table if not exists qualification_exams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  exam_date date,
  written_score numeric(5,2),
  oral_score numeric(5,2),
  result text not null default 'beklemede', -- basarili / basarisiz / beklemede
  attempt_no smallint not null default 1,
  jury jsonb,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists qualification_exams_student_idx on qualification_exams (tenant_id, student_id);

-- Staj kayitlari (genel; saglik modulundeki internships'ten bagimsiz)
create table if not exists internship_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  company text not null,
  position text,
  starts_on date,
  ends_on date,
  days integer,
  insurance_done boolean not null default false,
  logbook_submitted boolean not null default false,
  company_rating smallint,
  grade text,                              -- basarili / basarisiz
  status text not null default 'basvuruldu', -- basvuruldu / onaylandi / devam / tamamlandi / reddedildi
  created_at timestamptz not null default now()
);
create index if not exists internship_records_student_idx on internship_records (tenant_id, student_id);

-- CO-OP / kariyer: firma protokolleri
create table if not exists coop_companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  name text not null,
  sector text,
  contact text,
  protocol_no text,
  scholarship_rate_bps integer,            -- protokol burs orani (0-10000)
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint coop_companies_name_uq unique (tenant_id, name)
);

-- CO-OP yerlestirmeleri
create table if not exists coop_placements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  company_id uuid not null references coop_companies(id) on delete cascade,
  student_id uuid not null references students(id) on delete restrict,
  term text,
  status text not null default 'basvuruldu', -- basvuruldu / short_list / kabul / devam / tamamlandi / red
  note text,
  created_at timestamptz not null default now()
);
create index if not exists coop_placements_company_idx on coop_placements (tenant_id, company_id);
create index if not exists coop_placements_student_idx on coop_placements (tenant_id, student_id);

do $$
declare t text;
begin
  foreach t in array array[
    'thesis_committees','thesis_progress','plagiarism_reports','thesis_defenses',
    'qualification_exams','internship_records','coop_companies','coop_placements'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    execute format('grant select, insert, update, delete on %I to obs_app', t);
  end loop;
end $$;
