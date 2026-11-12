-- 0016_backoffice3: sınav/yoklama, intibak-muaf-transfer, mesajlaşma, anket.
-- Additive, tenant-kapsamlı, RLS + obs_app grant. Pattern 0015 ile aynı.

create table if not exists exam_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  section_id uuid not null references sections(id) on delete cascade,
  exam_type text not null,                 -- vize / final / butunleme / mazeret / quiz
  exam_date date,
  start_time text,
  location text,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists exam_schedules_section_idx on exam_schedules (tenant_id, section_id);

create table if not exists makeup_exams (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  section_id uuid not null references sections(id) on delete cascade,
  exam_type text not null,
  decision_no text,
  status text not null default 'atandi',
  created_at timestamptz not null default now()
);
create index if not exists makeup_exams_student_idx on makeup_exams (tenant_id, student_id);

create table if not exists course_adaptations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  type text not null,                      -- intibak / muaf / transfer
  source_course text not null,             -- kaynak ders (dış/eski) adı-kodu
  target_curriculum_course_id uuid references curriculum_courses(id) on delete set null,
  letter text,                             -- harf notu (muaf/transfer)
  decision_no text,
  status text not null default 'onayli',
  created_at timestamptz not null default now()
);
create index if not exists course_adaptations_student_idx on course_adaptations (tenant_id, student_id);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  from_user_id uuid not null references users(id) on delete restrict,
  to_user_id uuid not null references users(id) on delete restrict,
  subject text not null,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists messages_to_idx on messages (tenant_id, to_user_id);
create index if not exists messages_from_idx on messages (tenant_id, from_user_id);

create table if not exists surveys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  title text not null,
  description text,
  kind text not null default 'anket',      -- anket / degerlendirme
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists survey_responses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  survey_id uuid not null references surveys(id) on delete cascade,
  user_id uuid not null references users(id) on delete restrict,
  answers jsonb,
  created_at timestamptz not null default now(),
  constraint survey_responses_uq unique (survey_id, user_id)
);
create index if not exists survey_responses_survey_idx on survey_responses (tenant_id, survey_id);

do $$
declare t text;
begin
  foreach t in array array[
    'exam_schedules','makeup_exams','course_adaptations','messages','surveys','survey_responses'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)',
      t);
    execute format('grant select, insert, update, delete on %I to obs_app', t);
  end loop;
end $$;
