-- 0009_health: sağlık programları (Faz 7 / M7). Kurul modeli + rotasyon + staj.
-- programs.education_model eklenir (semester|committee). RLS DRY.

alter table programs add column education_model text not null default 'semester';

create table clinical_sites (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  code text not null,
  name text not null,
  capacity integer not null default 0,
  constraint clinical_sites_uq unique (tenant_id, code)
);

create table rotations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  program_id uuid not null references programs(id) on delete restrict,
  term_id uuid not null references academic_terms(id) on delete restrict,
  name text not null,
  group_count smallint not null,
  weeks_per_group smallint not null
);

create table rotation_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  rotation_id uuid not null references rotations(id) on delete cascade,
  clinical_site_id uuid not null references clinical_sites(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  group_no smallint not null,
  starts_on date not null,
  ends_on date not null,
  evaluation_score real,
  constraint rotation_assignments_uq unique (rotation_id, student_id)
);

create table committees (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  program_id uuid not null references programs(id) on delete restrict,
  term_id uuid not null references academic_terms(id) on delete restrict,
  name text not null,
  order_no smallint not null,
  weight_bps integer not null,
  constraint committees_uq unique (term_id, order_no)
);

create table committee_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  committee_id uuid not null references committees(id) on delete cascade,
  student_id uuid not null references students(id) on delete restrict,
  score real not null,
  constraint committee_scores_uq unique (committee_id, student_id)
);

create table internships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  clinical_site_id uuid not null references clinical_sites(id) on delete restrict,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'planned',
  logbook_approved boolean not null default false
);

-- === RLS + yetkiler (DRY) ===
do $$
declare
  t text;
  tables text[] := array['clinical_sites','rotations','rotation_assignments','committees','committee_scores','internships'];
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
