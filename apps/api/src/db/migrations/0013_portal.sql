-- 0012_portal: portal domain (danışmanlık + yönetişim + operasyon). RLS.
-- Danışman-öğrenci eşlemesi (students.advisor_user_id), danışman notu, bölüm
-- başkanı eşlemesi, özellik bayrağı, fakülte yönetim kurulu, Bologna içeriği.

-- === students.advisor_user_id: danışman-öğrenci eşlemesi ===
alter table students
  add column if not exists advisor_user_id uuid references users(id) on delete set null;
create index if not exists students_advisor_idx on students (tenant_id, advisor_user_id);

-- === advisor_notes ===
create table advisor_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  author_user_id uuid not null references users(id) on delete restrict,
  category text not null default 'gorusme',
  body text not null,
  created_at timestamptz not null default now()
);
create index advisor_notes_student_idx on advisor_notes (tenant_id, student_id);

-- === department_heads ===
create table department_heads (
  tenant_id uuid not null references tenants(id) on delete restrict,
  user_id uuid not null references users(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  constraint department_heads_uq unique (user_id, department_id)
);
create index department_heads_user_idx on department_heads (tenant_id, user_id);

-- === feature_flags ===
create table feature_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  key text not null,
  label text not null,
  description text,
  enabled boolean not null default false,
  updated_by_user_id uuid references users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint feature_flags_key_uq unique (tenant_id, key)
);

-- === governance_sessions ===
create table governance_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  session_no text not null,
  date date not null,
  status text not null default 'open',
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint governance_sessions_no_uq unique (tenant_id, session_no)
);

-- === governance_decisions ===
create table governance_decisions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  session_id uuid not null references governance_sessions(id) on delete cascade,
  decision_no text not null,
  subject text not null,
  outcome text not null,
  reason text,
  linked_request_id uuid references requests(id) on delete set null,
  linked_double_major_id uuid references double_major_applications(id) on delete set null,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index governance_decisions_session_idx on governance_decisions (tenant_id, session_id);

-- === course_bologna ===
create table course_bologna (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  course_id uuid not null references courses(id) on delete cascade,
  learning_outcomes jsonb not null default '[]'::jsonb,
  order_no smallint not null default 0,
  constraint course_bologna_uq unique (tenant_id, course_id)
);

-- === RLS + yetkiler ===
alter table advisor_notes enable row level security;
alter table department_heads enable row level security;
alter table feature_flags enable row level security;
alter table governance_sessions enable row level security;
alter table governance_decisions enable row level security;
alter table course_bologna enable row level security;

create policy tenant_isolation on advisor_notes
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
create policy tenant_isolation on department_heads
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
create policy tenant_isolation on feature_flags
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
create policy tenant_isolation on governance_sessions
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
create policy tenant_isolation on governance_decisions
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
create policy tenant_isolation on course_bologna
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

grant select, insert, update, delete on advisor_notes to obs_app;
grant select, insert, update, delete on department_heads to obs_app;
grant select, insert, update, delete on feature_flags to obs_app;
grant select, insert, update, delete on governance_sessions to obs_app;
grant select, insert, update, delete on governance_decisions to obs_app;
grant select, insert, update, delete on course_bologna to obs_app;
