-- 0023_student_life: kismi zamanli calisma, PDR randevu/seans, engelli destek,
-- oryantasyon, saglik (mediko), kutuphane odunc/borc. Additive + RLS.

create table if not exists part_time_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  title text not null,
  unit text,
  description text,
  hourly_rate integer,                     -- kurus
  quota smallint default 1,
  status text not null default 'acik',     -- acik / kapali
  created_at timestamptz not null default now()
);

create table if not exists part_time_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  job_id uuid not null references part_time_jobs(id) on delete cascade,
  student_id uuid not null references students(id) on delete restrict,
  status text not null default 'basvuruldu', -- basvuruldu / kabul / devam / bitti / red
  started_on date,
  ended_on date,
  created_at timestamptz not null default now(),
  constraint part_time_assignments_uq unique (job_id, student_id)
);
create index if not exists part_time_assignments_student_idx on part_time_assignments (tenant_id, student_id);

create table if not exists part_time_timesheets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  assignment_id uuid not null references part_time_assignments(id) on delete cascade,
  period text not null,                    -- 2025-09
  hours numeric(6,2) not null default 0,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists part_time_timesheets_assignment_idx on part_time_timesheets (tenant_id, assignment_id);

-- PDR (psikolojik danismanlik) — GIZLI: erisim dar rol seti
create table if not exists counseling_appointments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  counselor_user_id uuid references users(id) on delete set null,
  requested_at timestamptz not null default now(),
  appointment_at timestamptz,
  kind text not null default 'bireysel',   -- bireysel / grup / atolye
  status text not null default 'talep',    -- talep / planlandi / tamamlandi / iptal / gelmedi
  note text,                               -- gizli not
  rating smallint,
  created_at timestamptz not null default now()
);
create index if not exists counseling_appointments_student_idx on counseling_appointments (tenant_id, student_id);

create table if not exists disability_supports (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  disability_type text,
  needs text,
  accommodations text,                     -- ek sure, erisilebilir materyal ...
  exam_extra_time_pct smallint,
  status text not null default 'aktif',
  created_at timestamptz not null default now()
);
create index if not exists disability_supports_student_idx on disability_supports (tenant_id, student_id);

create table if not exists orientation_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  title text not null,
  event_date date,
  location text,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists orientation_attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  event_id uuid not null references orientation_events(id) on delete cascade,
  student_id uuid not null references students(id) on delete restrict,
  attended boolean not null default false,
  feedback smallint,
  created_at timestamptz not null default now(),
  constraint orientation_attendance_uq unique (event_id, student_id)
);
create index if not exists orientation_attendance_event_idx on orientation_attendance (tenant_id, event_id);

create table if not exists health_visits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  visit_date date,
  complaint text,
  treatment text,
  referred_to text,
  created_at timestamptz not null default now()
);
create index if not exists health_visits_student_idx on health_visits (tenant_id, student_id);

create table if not exists library_loans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  item_title text not null,
  loaned_on date,
  due_on date,
  returned_on date,
  fine_amount integer not null default 0,   -- kurus
  status text not null default 'odunc',     -- odunc / iade / gecikmis
  created_at timestamptz not null default now()
);
create index if not exists library_loans_student_idx on library_loans (tenant_id, student_id);

do $$
declare t text;
begin
  foreach t in array array[
    'part_time_jobs','part_time_assignments','part_time_timesheets','counseling_appointments',
    'disability_supports','orientation_events','orientation_attendance','health_visits','library_loans'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    execute format('grant select, insert, update, delete on %I to obs_app', t);
  end loop;
end $$;
