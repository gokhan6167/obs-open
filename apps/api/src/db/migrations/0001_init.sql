-- 0001_init: çekirdek şema + RLS + append-only audit.
-- Süper rolle (DATABASE_MIGRATE_URL) çalışır. Uygulama 'obs_app' ile bağlanır.
-- Geri alma: docs/ADR/0003; drop policy/table sırası tersten. Faz 0 dev'de reset yeterli.

create extension if not exists pgcrypto;

-- Uygulama rolü: RLS'e tabi, non-superuser, BYPASSRLS yok.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'obs_app') then
    create role obs_app login password 'obs_app_dev_password';
  end if;
end
$$;

-- === Tablolar ===
create table tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  deployment_mode text not null default 'multi-tenant',
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  email text not null,
  password_hash text not null,
  is_active boolean not null default true,
  totp_secret text,
  created_at timestamptz not null default now(),
  constraint users_tenant_email_uq unique (tenant_id, email)
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  key text not null,
  name text not null,
  constraint roles_tenant_key_uq unique (tenant_id, key)
);

create table user_roles (
  tenant_id uuid not null references tenants(id) on delete restrict,
  user_id uuid not null references users(id) on delete cascade,
  role_id uuid not null references roles(id) on delete cascade,
  constraint user_roles_uq unique (user_id, role_id)
);

create table audit_log (
  id bigserial primary key,
  tenant_id uuid not null,
  actor_user_id uuid,
  action text not null,
  resource_type text not null,
  resource_id text,
  diff jsonb,
  ip inet,
  user_agent text,
  at timestamptz not null default now()
);
create index audit_tenant_at_idx on audit_log (tenant_id, at);

-- === Yetkiler (obs_app) ===
grant usage on schema public to obs_app;
grant select on tenants to obs_app;
grant select, insert, update, delete on users, roles, user_roles to obs_app;
grant select, insert on audit_log to obs_app;
grant usage, select on all sequences in schema public to obs_app;

-- === Row-Level Security ===
-- Politika: satır, oturumdaki app.tenant_id ile eşleşen tenant'a aitse görünür.
-- app.tenant_id set edilmemiş VEYA boş ise nullif(...) NULL verir -> tenant_id =
-- NULL hiçbir satırla eşleşmez (güvenli varsayılan: reddet). Boş string'in
-- ''::uuid cast hatasını da bu önler (havuzdaki bağlantı GUC'u '' bırakabilir).
alter table users enable row level security;
alter table roles enable row level security;
alter table user_roles enable row level security;
alter table audit_log enable row level security;

create policy tenant_isolation on users
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_isolation on roles
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_isolation on user_roles
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy tenant_isolation on audit_log
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- === Append-only audit ===
create or replace function obs_audit_no_mutate() returns trigger as $$
begin
  raise exception 'audit_log append-only: UPDATE/DELETE yasak';
end;
$$ language plpgsql;

create trigger audit_no_update before update on audit_log
  for each row execute function obs_audit_no_mutate();
create trigger audit_no_delete before delete on audit_log
  for each row execute function obs_audit_no_mutate();
