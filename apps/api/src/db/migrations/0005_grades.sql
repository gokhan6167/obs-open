-- 0005_grades: not, değerlendirme, devamsızlık (Faz 3 / M4). RLS + not içerik koruması.
-- SESSİZ DEĞİŞİKLİK İMKÂNSIZ: ilan/kesin nottaki harf/puan yalnızca düzeltme akışıyla
-- (app.grade_correction='on' set edilerek) değişebilir; trigger aksini reddeder.

create table grade_components (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  section_id uuid not null references sections(id) on delete cascade,
  name text not null,
  weight smallint not null,
  locked boolean not null default false,
  constraint grade_components_uq unique (section_id, name)
);

create table component_scores (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  component_id uuid not null references grade_components(id) on delete cascade,
  student_id uuid not null references students(id) on delete restrict,
  score real not null,
  constraint component_scores_uq unique (component_id, student_id)
);

create table grades (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  section_id uuid not null references sections(id) on delete restrict,
  term_id uuid not null references academic_terms(id) on delete restrict,
  raw_score real,
  letter text,
  coefficient real,
  evaluation_type text not null default 'absolute',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  constraint grades_student_section_uq unique (student_id, section_id)
);
create index grades_section_idx on grades (tenant_id, section_id);

create table grade_corrections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  grade_id uuid not null references grades(id) on delete restrict,
  old_letter text,
  new_letter text,
  old_raw real,
  new_raw real,
  reason text not null,
  decision_no text not null,
  approved_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table grade_appeals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  grade_id uuid not null references grades(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  reason text not null,
  status text not null default 'open',
  created_at timestamptz not null default now()
);

create table attendance (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  section_id uuid not null references sections(id) on delete cascade,
  student_id uuid not null references students(id) on delete restrict,
  session_date date not null,
  kind text not null,
  present boolean not null,
  constraint attendance_uq unique (section_id, student_id, session_date, kind)
);

-- === Not içerik koruma trigger'ı (sessiz değişiklik yasak) ===
create or replace function obs_grade_content_guard() returns trigger as $$
begin
  if old.status in ('announced','finalized')
     and (new.letter is distinct from old.letter
          or new.raw_score is distinct from old.raw_score
          or new.coefficient is distinct from old.coefficient)
     and coalesce(current_setting('app.grade_correction', true), '') <> 'on' then
    raise exception 'İlan edilmiş not içeriği yalnızca düzeltme akışıyla değiştirilebilir (sessiz değişiklik yasak)';
  end if;
  return new;
end;
$$ language plpgsql;

create trigger grades_content_guard before update on grades
  for each row execute function obs_grade_content_guard();

-- === RLS + yetkiler (DRY) ===
do $$
declare
  t text;
  tables text[] := array[
    'grade_components','component_scores','grades','grade_corrections','grade_appeals','attendance'
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
