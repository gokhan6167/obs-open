-- 0003_parameters: versiyonlu + yürürlük tarihli mevzuat parametreleri (Faz 1).
-- Harf notu ölçeği, GNO politikası, akademik kural seti. program_id NULL = tenant geneli.
-- Süper rolle çalışır; obs_app RLS'e tabi.

create table grade_scales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  program_id uuid references programs(id) on delete cascade,
  code text not null,
  name text not null,
  bands jsonb not null,
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  constraint grade_scales_uq unique (tenant_id, code, effective_from)
);

create table gpa_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  program_id uuid references programs(id) on delete cascade,
  repeat_policy text not null,
  rounding_digits smallint not null default 2,
  rounding_mode text not null default 'half-up',
  effective_from date not null,
  effective_to date
);

create table academic_rule_sets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  program_id uuid references programs(id) on delete cascade,
  rules jsonb not null,
  effective_from date not null,
  effective_to date
);

-- RLS + yetkiler (DRY)
do $$
declare
  t text;
  tables text[] := array['grade_scales','gpa_policies','academic_rule_sets'];
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
