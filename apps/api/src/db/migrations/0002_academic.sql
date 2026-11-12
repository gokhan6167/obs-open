-- 0002_academic: müfredat hiyerarşisi + öğrenci + akademik takvim (Faz 1 / M1-M2).
-- Tüm tablolar tenant-kapsamlı ve RLS'e tabi. Süper rolle çalışır; obs_app RLS'e tabi.
-- Geri alma: drop table ... cascade (tersten). Faz 1 dev'de reset yeterli.

-- === Müfredat hiyerarşisi ===
create table faculties (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  code text not null,
  name text not null,
  created_at timestamptz not null default now(),
  constraint faculties_tenant_code_uq unique (tenant_id, code)
);

create table departments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  faculty_id uuid not null references faculties(id) on delete restrict,
  code text not null,
  name text not null,
  constraint departments_tenant_code_uq unique (tenant_id, code)
);

create table programs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  department_id uuid not null references departments(id) on delete restrict,
  code text not null,
  name text not null,
  level text not null,
  language text not null default 'tr',
  constraint programs_tenant_code_uq unique (tenant_id, code)
);

create table curriculum_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  program_id uuid not null references programs(id) on delete restrict,
  year smallint not null,
  name text not null,
  is_active boolean not null default true,
  constraint curriculum_versions_uq unique (program_id, year)
);

create table courses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  code text not null,
  name_tr text not null,
  name_en text,
  ects integer not null,
  local_credit integer not null,
  theory_hours smallint not null default 0,
  practice_hours smallint not null default 0,
  lab_hours smallint not null default 0,
  constraint courses_tenant_code_uq unique (tenant_id, code)
);

create table curriculum_courses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  curriculum_version_id uuid not null references curriculum_versions(id) on delete cascade,
  course_id uuid not null references courses(id) on delete restrict,
  semester_no smallint not null,
  is_mandatory boolean not null default true,
  prerequisite jsonb,
  constraint curriculum_courses_uq unique (curriculum_version_id, course_id)
);

-- === Öğrenci ===
create table students (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  user_id uuid not null references users(id) on delete restrict,
  program_id uuid not null references programs(id) on delete restrict,
  curriculum_version_id uuid not null references curriculum_versions(id) on delete restrict,
  student_no text not null,
  status text not null default 'aktif',
  enrolled_at timestamptz not null default now(),
  constraint students_tenant_no_uq unique (tenant_id, student_no)
);
create index students_tenant_status_idx on students (tenant_id, status);

-- === Akademik takvim ===
create table academic_terms (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  year smallint not null,
  term text not null,
  name text not null,
  starts_on date not null,
  ends_on date not null,
  is_active boolean not null default false,
  constraint academic_terms_uq unique (tenant_id, year, term)
);

create table calendar_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  term_id uuid not null references academic_terms(id) on delete cascade,
  type text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null
);
create index calendar_events_term_idx on calendar_events (tenant_id, term_id);

-- === RLS + yetkiler (DRY: her tenant-kapsamlı tabloya aynı politika) ===
do $$
declare
  t text;
  tables text[] := array[
    'faculties','departments','programs','curriculum_versions','courses',
    'curriculum_courses','students','academic_terms','calendar_events'
  ];
begin
  foreach t in array tables loop
    execute format('alter table %I enable row level security', t);
    execute format(
      $f$create policy tenant_isolation on %I
         using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
         with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)$f$,
      t);
    execute format('grant select, insert, update, delete on %I to obs_app', t);
  end loop;
end
$$;
