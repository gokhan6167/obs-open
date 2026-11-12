-- 0012_curriculum_outcomes: Bologna/akreditasyon çekirdeği — program çıktıları (PÇ),
-- ders öğrenme çıktıları (DÇ) ve PÇ-DÇ ilişki matrisi. Tümü tenant-kapsamlı ve
-- RLS'e tabi (0002 deseni birebir). DDL süper rolle; obs_app RLS altında.
-- Geri alma: drop table ... cascade (tersten). Dev'de reset yeterli.

-- Program çıktısı (PÇ): programın kazanım hedefi + TYYÇ boyutu.
create table program_outcomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  program_id uuid not null references programs(id) on delete cascade,
  code text not null,
  text_tr text not null,
  text_en text,
  tyyc_dimension text,
  sort_no smallint not null default 0,
  constraint program_outcomes_uq unique (program_id, code)
);
create index program_outcomes_tenant_program_idx on program_outcomes (tenant_id, program_id);

-- Ders öğrenme çıktısı (DÇ): bir müfredat-dersinin (curriculum_courses) kazanımı.
create table course_outcomes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  curriculum_course_id uuid not null references curriculum_courses(id) on delete cascade,
  code text not null,
  text_tr text not null,
  text_en text,
  sort_no smallint not null default 0,
  constraint course_outcomes_uq unique (curriculum_course_id, code)
);
create index course_outcomes_tenant_cc_idx on course_outcomes (tenant_id, curriculum_course_id);

-- PÇ-DÇ ilişki matrisi hücresi: bir müfredat-dersinin bir PÇ ile ilişki düzeyi (0-3).
create table outcome_relations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  curriculum_course_id uuid not null references curriculum_courses(id) on delete cascade,
  program_outcome_id uuid not null references program_outcomes(id) on delete cascade,
  level smallint not null default 0,
  constraint outcome_relations_uq unique (curriculum_course_id, program_outcome_id),
  constraint outcome_relations_level_ck check (level between 0 and 3)
);
create index outcome_relations_tenant_cc_idx on outcome_relations (tenant_id, curriculum_course_id);

-- === RLS + yetkiler (DRY: 0002 deseni birebir) ===
do $$
declare
  t text;
  tables text[] := array[
    'program_outcomes','course_outcomes','outcome_relations'
  ];
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
