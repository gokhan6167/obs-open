-- 0015_backoffice2: backoffice ana modülleri için tablolar. Tümü tenant-kapsamlı,
-- RLS + obs_app grant. Additive (drop yok). Pattern 0013/0014 ile aynı.

-- === Derslik (bina + derslik) ===
create table if not exists buildings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  code text not null,
  name text not null,
  campus text,
  address text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint buildings_code_uq unique (tenant_id, code)
);
create table if not exists classrooms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  building_id uuid not null references buildings(id) on delete cascade,
  code text not null,
  name text,
  kind text not null default 'derslik',   -- derslik / amfi / lab
  capacity integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists classrooms_building_idx on classrooms (tenant_id, building_id);

-- === Öğrenci dosyası: izin / askerlik / gelen belge ===
create table if not exists student_leaves (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  type text not null,                      -- mazeretli / raporlu / gorevli / kayit_dondurma
  starts_on date,
  ends_on date,
  decision_no text,
  decision_date date,
  reason text,
  status text not null default 'aktif',
  created_at timestamptz not null default now()
);
create index if not exists student_leaves_student_idx on student_leaves (tenant_id, student_id);

create table if not exists military_deferrals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  status text not null default 'ertelendi',
  deferral_date date,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists military_deferrals_student_idx on military_deferrals (tenant_id, student_id);

create table if not exists student_documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  kind text not null,                      -- lise diploma / kimlik / askerlik vb.
  description text,
  doc_no text,
  received_on date,
  has_original boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists student_documents_student_idx on student_documents (tenant_id, student_id);

-- === Başvuru yönetimi ===
create table if not exists application_programs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  program_id uuid not null references programs(id) on delete restrict,
  type text not null,                      -- yatay gecis / dgs / cap / yandal / yos ...
  year integer not null,
  term text,
  quota integer not null default 0,
  starts_on date,
  ends_on date,
  min_gpa numeric(4,2),
  status text not null default 'acik',
  created_at timestamptz not null default now()
);
create index if not exists application_programs_prog_idx on application_programs (tenant_id, program_id);

create table if not exists applicants (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  application_program_id uuid not null references application_programs(id) on delete cascade,
  full_name text not null,
  national_id text,
  score numeric(6,2),
  status text not null default 'basvurdu', -- basvurdu / kazandi / kazanamadi / kesin_kayit
  created_at timestamptz not null default now()
);
create index if not exists applicants_program_idx on applicants (tenant_id, application_program_id);

-- === Diploma / mezuniyet defteri ===
create table if not exists diplomas (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  diploma_no text,
  serial_no text,
  graduation_date date,
  degree text,                             -- onlisans / lisans / yl / doktora
  decision_no text,
  decision_date date,
  rank_no integer,
  status text not null default 'hazirlaniyor',  -- hazirlaniyor / hazir / teslim
  created_at timestamptz not null default now(),
  constraint diplomas_student_uq unique (tenant_id, student_id)
);

-- === RLS + grant (hepsi) ===
do $$
declare t text;
begin
  foreach t in array array[
    'buildings','classrooms','student_leaves','military_deferrals',
    'student_documents','application_programs','applicants','diplomas'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t);
    execute format('grant select, insert, update, delete on %I to obs_app', t);
  end loop;
end $$;
