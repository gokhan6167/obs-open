-- 0010_migration: veri göçü (Faz 8 / M11). Staging + karantina + mutabakat. RLS DRY.

create table migration_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  mode text not null,
  status text not null default 'running',
  stats jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

create table staging_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  migration_run_id uuid not null references migration_runs(id) on delete cascade,
  source_table text not null,
  record jsonb not null
);
create index staging_rows_run_idx on staging_rows (tenant_id, migration_run_id);

create table quarantine_rows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  migration_run_id uuid not null references migration_runs(id) on delete cascade,
  source_table text not null,
  raw jsonb not null,
  reason text not null,
  resolved boolean not null default false
);
create index quarantine_run_idx on quarantine_rows (tenant_id, migration_run_id, resolved);

create table reconciliation_exceptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  migration_run_id uuid not null references migration_runs(id) on delete cascade,
  student_no text not null,
  field text not null,
  ois_value text not null,
  new_value text not null,
  resolved boolean not null default false
);
create index reconciliation_run_idx on reconciliation_exceptions (tenant_id, migration_run_id, resolved);

-- === RLS + yetkiler (DRY) ===
do $$
declare
  t text;
  tables text[] := array['migration_runs','staging_rows','quarantine_rows','reconciliation_exceptions'];
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
