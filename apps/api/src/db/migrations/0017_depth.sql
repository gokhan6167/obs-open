-- 0017_depth: ders acma derinligi (haftalik program + ogretim elemani), ogrenci
-- dosyasi ek sekmeleri (gecmis egitim, odul), harc borc tipleri. Additive + RLS.

create table if not exists section_meetings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  section_id uuid not null references sections(id) on delete cascade,
  day_of_week smallint,                    -- 1=Pzt .. 7=Paz
  start_time text,
  end_time text,
  kind text not null default 'teorik',     -- teorik / uygulama / lab
  classroom_id uuid references classrooms(id) on delete set null,
  instructor_user_id uuid references users(id) on delete set null,
  is_makeup boolean not null default false,
  ykk_no text,
  week_no smallint,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists section_meetings_section_idx on section_meetings (tenant_id, section_id);

create table if not exists section_instructors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  section_id uuid not null references sections(id) on delete cascade,
  user_id uuid not null references users(id) on delete restrict,
  role text not null default 'veren',      -- sorumlu / veren
  created_at timestamptz not null default now(),
  constraint section_instructors_uq unique (section_id, user_id)
);
create index if not exists section_instructors_section_idx on section_instructors (tenant_id, section_id);

create table if not exists prior_educations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  school_name text not null,
  degree text,
  graduation_year integer,
  gpa numeric(4,2),
  note text,
  created_at timestamptz not null default now()
);
create index if not exists prior_educations_student_idx on prior_educations (tenant_id, student_id);

create table if not exists student_awards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  title text not null,
  award_date date,
  description text,
  created_at timestamptz not null default now()
);
create index if not exists student_awards_student_idx on student_awards (tenant_id, student_id);

create table if not exists debt_types (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  code text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint debt_types_code_uq unique (tenant_id, code)
);

do $$
declare t text;
begin
  foreach t in array array['section_meetings','section_instructors','prior_educations','student_awards','debt_types'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    execute format('grant select, insert, update, delete on %I to obs_app', t);
  end loop;
end $$;
