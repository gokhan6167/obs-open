-- 0020_approval_engine: konfigure edilebilir cok-birimli onay motoru.
-- Talep -> birim1 -> birim2 -> ... -> karar deseni. Kayit dondurma, ilisik kesme,
-- basvuru, burs, disiplin gibi tum akislar bu motora baglanabilir. Additive + RLS.

-- Akis tanimi (or. "kayit_dondurma": Cozum Merkezi -> Cari -> Akademik Birim -> OIDB)
create table if not exists approval_flows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  key text not null,                       -- kayit_dondurma / ilisik_kesme / burs / ...
  name text not null,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint approval_flows_key_uq unique (tenant_id, key)
);

-- Akisin adimlari (sirali)
create table if not exists approval_flow_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  flow_id uuid not null references approval_flows(id) on delete cascade,
  step_no smallint not null,
  unit text not null,                      -- cozum_merkezi / cari / akademik_birim / oidb ...
  role_key text,                           -- gereken rol (oidb, mali_isler, dekanlik ...)
  name text not null,
  sla_days smallint,                       -- hedef cozum suresi (gun)
  created_at timestamptz not null default now(),
  constraint approval_flow_steps_uq unique (flow_id, step_no)
);
create index if not exists approval_flow_steps_flow_idx on approval_flow_steps (tenant_id, flow_id);

-- Calisan akis ornegi (bir talebe bagli)
create table if not exists approval_instances (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  flow_id uuid not null references approval_flows(id) on delete restrict,
  subject_type text not null,              -- student_request / scholarship / discipline ...
  subject_id uuid not null,                -- ilgili kaydin id'si
  student_id uuid references students(id) on delete set null,
  current_step smallint not null default 1,
  status text not null default 'devam',    -- devam / onaylandi / reddedildi / iptal
  started_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now(),
  closed_at timestamptz
);
create index if not exists approval_instances_subject_idx on approval_instances (tenant_id, subject_type, subject_id);
create index if not exists approval_instances_status_idx on approval_instances (tenant_id, status, current_step);

-- Adim aksiyonlari (onay/red gecmisi)
create table if not exists approval_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  instance_id uuid not null references approval_instances(id) on delete cascade,
  step_no smallint not null,
  unit text,
  action text not null,                    -- onay / red / iade / not
  note text,
  acted_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists approval_actions_instance_idx on approval_actions (tenant_id, instance_id);

do $$
declare t text;
begin
  foreach t in array array['approval_flows','approval_flow_steps','approval_instances','approval_actions'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    execute format('grant select, insert, update, delete on %I to obs_app', t);
  end loop;
end $$;
