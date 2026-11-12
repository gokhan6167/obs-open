-- 0018_missing: secmeli ders havuzu, hafta tanimlama, fotograf onayi. Additive + RLS.

create table if not exists elective_pools (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  code text not null,
  name text not null,
  kind text not null default 'secmeli',
  status text not null default 'aktif',    -- aktif / pasif / kapali
  created_at timestamptz not null default now(),
  constraint elective_pools_code_uq unique (tenant_id, code)
);
create table if not exists elective_pool_courses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  pool_id uuid not null references elective_pools(id) on delete cascade,
  course_id uuid not null references courses(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint elective_pool_courses_uq unique (pool_id, course_id)
);
create index if not exists elective_pool_courses_pool_idx on elective_pool_courses (tenant_id, pool_id);

create table if not exists academic_weeks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  year integer not null,
  term text not null,
  week_no smallint not null,
  starts_on date,
  note text,
  created_at timestamptz not null default now(),
  constraint academic_weeks_uq unique (tenant_id, year, term, week_no)
);

create table if not exists photo_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  user_id uuid not null references users(id) on delete restrict,
  photo_url text,
  status text not null default 'beklemede',  -- beklemede / onayli / reddedildi
  reviewed_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists photo_requests_status_idx on photo_requests (tenant_id, status);

do $$
declare t text;
begin
  foreach t in array array['elective_pools','elective_pool_courses','academic_weeks','photo_requests'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    execute format('grant select, insert, update, delete on %I to obs_app', t);
  end loop;
end $$;
