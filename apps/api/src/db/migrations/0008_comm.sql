-- 0008_comm: duyuru/bildirim/tercih/talep (Faz 6 / M8). RLS tüm tablolarda.

create table announcements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  title text not null,
  body text not null,
  scope text not null,
  scope_id uuid,
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index announcements_scope_idx on announcements (tenant_id, scope);

create table notifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  user_id uuid not null references users(id) on delete cascade,
  type text not null,
  title text not null,
  body text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on notifications (tenant_id, user_id, read);

create table notification_prefs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  user_id uuid not null references users(id) on delete cascade,
  channel text not null,
  enabled boolean not null default true,
  constraint notification_prefs_uq unique (user_id, channel)
);

create table requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  type text not null,
  payload jsonb,
  status text not null default 'submitted',
  reviewer_user_id uuid references users(id) on delete set null,
  decision_reason text,
  created_at timestamptz not null default now()
);
create index requests_status_idx on requests (tenant_id, status);

-- === RLS + yetkiler (DRY) ===
do $$
declare
  t text;
  tables text[] := array['announcements','notifications','notification_prefs','requests'];
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
