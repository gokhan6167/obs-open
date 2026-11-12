-- 0019_student_services: ogrenci self-servis talepleri, cozum merkezi, tez/proje,
-- kulupler, mezun, degisim. Additive + RLS. Pattern 0015-0018.

-- === Cozum Merkezi (ticket) ===
create table if not exists support_tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  user_id uuid not null references users(id) on delete restrict,
  category text not null,                  -- ders / mali / belge / genel / sikayet
  subject text not null,
  body text not null,
  priority text not null default 'normal', -- dusuk / normal / yuksek
  assigned_unit text,                      -- OIDB / Mali / Akademik ...
  status text not null default 'acik',     -- acik / incelemede / cozuldu / kapali
  resolution text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists support_tickets_user_idx on support_tickets (tenant_id, user_id);
create index if not exists support_tickets_status_idx on support_tickets (tenant_id, status);

-- === Ogrenci self-servis talepleri (birlesik) ===
create table if not exists student_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  kind text not null,                      -- dersten_cekilme / kayit_dondurma / ilisik_kesme / ucret_iadesi
  reason text,
  detail jsonb,                            -- {sectionId} | {term} | {iban,accountHolder,bank} ...
  status text not null default 'basvuruldu', -- basvuruldu / incelemede / onaylandi / reddedildi
  decision_note text,
  created_at timestamptz not null default now()
);
create index if not exists student_requests_student_idx on student_requests (tenant_id, student_id);
create index if not exists student_requests_status_idx on student_requests (tenant_id, status);

-- === Tez / proje konu basvurusu ===
create table if not exists thesis_topics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  title text not null,
  summary text,
  advisor_user_id uuid references users(id) on delete set null,
  status text not null default 'basvuruldu', -- basvuruldu / onaylandi / reddedildi
  decision_note text,
  created_at timestamptz not null default now()
);
create index if not exists thesis_topics_student_idx on thesis_topics (tenant_id, student_id);

-- === Ogrenci kulupleri ===
create table if not exists student_clubs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  name text not null,
  description text,
  advisor_user_id uuid references users(id) on delete set null,
  status text not null default 'aktif',
  created_at timestamptz not null default now(),
  constraint student_clubs_name_uq unique (tenant_id, name)
);
create table if not exists club_memberships (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  club_id uuid not null references student_clubs(id) on delete cascade,
  student_id uuid not null references students(id) on delete restrict,
  role text not null default 'uye',        -- uye / yonetim / baskan
  created_at timestamptz not null default now(),
  constraint club_memberships_uq unique (club_id, student_id)
);
create index if not exists club_memberships_club_idx on club_memberships (tenant_id, club_id);

-- === Mezun (alumni) ===
create table if not exists alumni (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid references students(id) on delete set null,
  full_name text not null,
  graduation_year integer,
  program_name text,
  email text,
  employment text,                         -- calistigi kurum/pozisyon
  created_at timestamptz not null default now()
);
create index if not exists alumni_year_idx on alumni (tenant_id, graduation_year);

-- === Degisim hareketliligi (Erasmus/Farabi/Mevlana) ===
create table if not exists exchange_mobility (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  program text not null default 'erasmus', -- erasmus / farabi / mevlana
  direction text not null default 'giden', -- giden / gelen
  partner_university text,
  term text,
  status text not null default 'basvuruldu', -- basvuruldu / kabul / tamamlandi / iptal
  created_at timestamptz not null default now()
);
create index if not exists exchange_mobility_student_idx on exchange_mobility (tenant_id, student_id);

do $$
declare t text;
begin
  foreach t in array array[
    'support_tickets','student_requests','thesis_topics','student_clubs',
    'club_memberships','alumni','exchange_mobility'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    execute format('grant select, insert, update, delete on %I to obs_app', t);
  end loop;
end $$;
