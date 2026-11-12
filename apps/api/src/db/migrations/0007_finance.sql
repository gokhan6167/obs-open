-- 0007_finance: ücret/burs/fatura/ödeme/mutabakat (Faz 5 / M6). Para KURUŞ (bigint).
-- İDEMPOTENT ÖDEME: (tenant_id, idempotency_key) benzersiz -> aynı callback 2x tek ödeme.

create table fee_schedules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  program_id uuid not null references programs(id) on delete cascade,
  year smallint not null,
  base_amount bigint not null,
  constraint fee_schedules_uq unique (program_id, year)
);

create table scholarships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  type text not null,
  rate_bps integer not null,
  effective_from date not null,
  effective_to date,
  constraint scholarships_rate_ck check (rate_bps >= 0 and rate_bps <= 10000)
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  term_id uuid not null references academic_terms(id) on delete restrict,
  amount bigint not null,
  paid_amount bigint not null default 0,
  status text not null default 'unpaid',
  created_at timestamptz not null default now(),
  constraint invoices_paid_ck check (paid_amount >= 0)
);
create index invoices_student_idx on invoices (tenant_id, student_id);

create table payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  invoice_id uuid not null references invoices(id) on delete restrict,
  amount bigint not null,
  provider text not null,
  idempotency_key text not null,
  provider_ref text,
  status text not null default 'success',
  created_at timestamptz not null default now(),
  constraint payments_idempotency_uq unique (tenant_id, idempotency_key)
);

create table reconciliation_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  bank_ref text not null,
  amount bigint not null,
  matched_payment_id uuid references payments(id) on delete set null,
  imported_at timestamptz not null default now()
);

-- === RLS + yetkiler (DRY) ===
do $$
declare
  t text;
  tables text[] := array['fee_schedules','scholarships','invoices','payments','reconciliation_records'];
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
