-- 0024_finance_quality: cari derinlik (odeme plani/taksit/iade/kart), program izleme
-- & akreditasyon dosyasi, disiplin sorusturma akisi. Additive + RLS.

create table if not exists payment_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  year integer not null,
  term text,
  total_amount integer not null,            -- kurus
  installment_count smallint not null default 1,
  status text not null default 'aktif',     -- aktif / tamamlandi / iptal
  created_at timestamptz not null default now()
);
create index if not exists payment_plans_student_idx on payment_plans (tenant_id, student_id);

create table if not exists payment_installments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  plan_id uuid not null references payment_plans(id) on delete cascade,
  seq smallint not null,
  due_on date,
  amount integer not null,                  -- kurus
  paid_amount integer not null default 0,
  paid_on date,
  method text,                              -- havale / kart / nakit
  status text not null default 'bekliyor',  -- bekliyor / odendi / kismi / gecikmis
  created_at timestamptz not null default now(),
  constraint payment_installments_uq unique (plan_id, seq)
);
create index if not exists payment_installments_plan_idx on payment_installments (tenant_id, plan_id);

create table if not exists refund_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  amount integer not null,                  -- kurus
  iban text,
  account_holder text,
  bank text,
  reason text,
  status text not null default 'talep',     -- talep / onaylandi / odendi / reddedildi
  decided_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists refund_requests_student_idx on refund_requests (tenant_id, student_id);

-- Program izleme & akreditasyon
create table if not exists program_reviews (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  program_id uuid not null references programs(id) on delete cascade,
  year integer not null,
  student_count integer,
  graduate_count integer,
  avg_gpa numeric(4,2),
  employment_rate numeric(5,2),
  satisfaction numeric(5,2),
  note text,
  created_at timestamptz not null default now(),
  constraint program_reviews_uq unique (tenant_id, program_id, year)
);

create table if not exists accreditation_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  program_id uuid not null references programs(id) on delete cascade,
  body text not null,                       -- MUDEK / FEDEK / ABET ...
  cycle text,                               -- 2026-2031
  status text not null default 'hazirlik',  -- hazirlik / basvuru / saha_ziyareti / akredite / red
  visit_date date,
  note text,
  created_at timestamptz not null default now()
);
create index if not exists accreditation_files_program_idx on accreditation_files (tenant_id, program_id);

create table if not exists corrective_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  accreditation_id uuid not null references accreditation_files(id) on delete cascade,
  finding text not null,
  action text,
  due_on date,
  status text not null default 'acik',      -- acik / devam / kapali
  created_at timestamptz not null default now()
);
create index if not exists corrective_actions_acc_idx on corrective_actions (tenant_id, accreditation_id);

-- Disiplin sorusturma akisi (mevcut disciplinary_actions'a ek sureç katmani)
create table if not exists disciplinary_investigations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  complaint text not null,
  stage text not null default 'ihbar',      -- ihbar / on_inceleme / sorusturma / karar / itiraz / kapali
  investigator_user_id uuid references users(id) on delete set null,
  evidence text,
  decision text,
  decision_no text,
  decision_date date,
  action_id uuid references disciplinary_actions(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists disciplinary_investigations_student_idx on disciplinary_investigations (tenant_id, student_id);

do $$
declare t text;
begin
  foreach t in array array[
    'payment_plans','payment_installments','refund_requests','program_reviews',
    'accreditation_files','corrective_actions','disciplinary_investigations'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    execute format('grant select, insert, update, delete on %I to obs_app', t);
  end loop;
end $$;
