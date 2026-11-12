-- 0021_admissions_deep: basvuru/kabul motoru derinligi. Aday PIN takibi, belge
-- yukleme, dis servis (MERNIS/OSYM/YOKSIS) cagri logu, dil yeterlilik/hazirlik,
-- uluslararasi kabul (depozito/vize). Additive + RLS.

-- Aday PIN + takip (kayitli olmayan adaylar icin self-servis durum sorgulama)
alter table applicants add column if not exists pin_code text;
alter table applicants add column if not exists email text;
alter table applicants add column if not exists phone text;
alter table applicants add column if not exists preference_no smallint;
create index if not exists applicants_pin_idx on applicants (tenant_id, pin_code);

-- Basvuru belgeleri
create table if not exists application_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  applicant_id uuid not null references applicants(id) on delete cascade,
  kind text not null,                      -- transkript / diploma / dil_belgesi / kimlik ...
  file_name text,
  file_url text,
  verified boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists application_documents_applicant_idx on application_documents (tenant_id, applicant_id);

-- Dis servis cagri logu (MERNIS / OSYM / YOKSIS / SGK — mock adaptor)
create table if not exists external_service_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  service text not null,                   -- mernis / osym / yoksis / sgk / ebys
  operation text not null,
  subject_ref text,                        -- tc / ogrenci no / aday id
  status text not null default 'basarili', -- basarili / hata
  response jsonb,
  created_at timestamptz not null default now()
);
create index if not exists external_service_logs_svc_idx on external_service_logs (tenant_id, service, created_at);

-- Dil yeterlilik / hazirlik
create table if not exists language_proficiencies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid references students(id) on delete set null,
  applicant_id uuid references applicants(id) on delete set null,
  exam_type text not null,                 -- toefl / pte / yds / yokdil / kurum_ici
  score numeric(6,2),
  exam_date date,
  result text not null default 'beklemede', -- muaf / hazirlik / beklemede
  note text,
  created_at timestamptz not null default now()
);
create index if not exists language_proficiencies_student_idx on language_proficiencies (tenant_id, student_id);

-- Uluslararasi kabul (depozito / vize / resmi kabul belgesi)
create table if not exists international_admissions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  applicant_id uuid not null references applicants(id) on delete cascade,
  country text,
  deposit_amount integer,                  -- kurus
  deposit_paid boolean not null default false,
  acceptance_letter_no text,
  visa_status text not null default 'beklemede', -- beklemede / basvuruldu / alindi / red
  status text not null default 'on_kabul', -- on_kabul / kabul / kayit / iptal
  note text,
  created_at timestamptz not null default now()
);
create index if not exists international_admissions_applicant_idx on international_admissions (tenant_id, applicant_id);

do $$
declare t text;
begin
  foreach t in array array['application_documents','external_service_logs','language_proficiencies','international_admissions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    execute format('grant select, insert, update, delete on %I to obs_app', t);
  end loop;
end $$;
