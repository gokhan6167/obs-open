-- 0011_double_major: ÇAP (çift anadal) / yandal başvuruları (M1). RLS.

create table double_major_applications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  type text not null,
  target_program_id uuid not null references programs(id) on delete restrict,
  status text not null default 'submitted',
  gpa_snapshot real,
  eligibility jsonb,
  reviewer_user_id uuid references users(id) on delete set null,
  decision_reason text,
  created_at timestamptz not null default now()
);
create index dma_student_idx on double_major_applications (tenant_id, student_id);
create index dma_status_idx on double_major_applications (tenant_id, status);

-- === RLS + yetkiler ===
alter table double_major_applications enable row level security;
create policy tenant_isolation on double_major_applications
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on double_major_applications to obs_app;
