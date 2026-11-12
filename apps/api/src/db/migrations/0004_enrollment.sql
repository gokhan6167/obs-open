-- 0004_enrollment: ders kayıt (şube/kontenjan + kayıt + bekleme listesi). Faz 2 / M3.
-- KONTENJAN DOĞRULUĞU: filled 0..quota CHECK + atomik UPDATE...WHERE filled<quota.
-- Süper rolle çalışır; obs_app RLS'e tabi.

create table sections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  course_id uuid not null references courses(id) on delete restrict,
  term_id uuid not null references academic_terms(id) on delete restrict,
  program_id uuid references programs(id) on delete set null,
  instructor_user_id uuid references users(id) on delete set null,
  code text not null,
  quota integer not null,
  filled integer not null default 0,
  created_at timestamptz not null default now(),
  constraint sections_uq unique (tenant_id, course_id, term_id, code),
  -- Savunma derinliği: kontenjan asla aşılamaz/negatife düşemez.
  constraint sections_filled_ck check (filled >= 0 and filled <= quota),
  constraint sections_quota_ck check (quota >= 0)
);

create table enrollments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  section_id uuid not null references sections(id) on delete restrict,
  term_id uuid not null references academic_terms(id) on delete restrict,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  constraint enrollments_student_section_uq unique (student_id, section_id)
);
create index enrollments_section_idx on enrollments (tenant_id, section_id);
create index enrollments_student_idx on enrollments (tenant_id, student_id);

create table enrollment_waitlist (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  section_id uuid not null references sections(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  position smallint not null,
  created_at timestamptz not null default now(),
  constraint waitlist_uq unique (section_id, student_id)
);

-- RLS + yetkiler (DRY)
do $$
declare
  t text;
  tables text[] := array['sections','enrollments','enrollment_waitlist'];
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
