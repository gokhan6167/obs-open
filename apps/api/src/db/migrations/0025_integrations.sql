-- 0025_integrations: EBYS/e-imza akisi, entegrasyon konfigurasyonu, bildirim
-- (SMS/e-posta) gonderim logu, SLA olcumu. Additive + RLS.

-- Belge imza akisi (EBYS/e-imza iskeleti)
create table if not exists document_signatures (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  subject_type text not null,               -- diploma / belge_talebi / yazi ...
  subject_id uuid,
  title text not null,
  signer_user_id uuid references users(id) on delete set null,
  signer_name text,
  seq smallint not null default 1,
  status text not null default 'bekliyor',  -- bekliyor / imzalandi / reddedildi
  signed_at timestamptz,
  ebys_ref text,                            -- EBYS evrak referansi (mock)
  note text,
  created_at timestamptz not null default now()
);
create index if not exists document_signatures_subject_idx on document_signatures (tenant_id, subject_type, subject_id);
create index if not exists document_signatures_status_idx on document_signatures (tenant_id, status);

-- Entegrasyon konfigurasyonu (EBYS / LMS / SMS / e-posta / banka ...)
create table if not exists integration_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  key text not null,                        -- ebys / lms / sms / email / banka / mernis
  name text not null,
  base_url text,
  enabled boolean not null default false,
  mode text not null default 'mock',        -- mock / live
  config jsonb,
  updated_at timestamptz not null default now(),
  constraint integration_configs_key_uq unique (tenant_id, key)
);

-- Bildirim gonderim logu (SMS/e-posta; mock gonderim)
create table if not exists notification_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  channel text not null,                    -- sms / email / push
  recipient text not null,
  subject text,
  body text,
  status text not null default 'gonderildi',-- gonderildi / hata
  provider_ref text,
  created_at timestamptz not null default now()
);
create index if not exists notification_logs_channel_idx on notification_logs (tenant_id, channel, created_at);

do $$
declare t text;
begin
  foreach t in array array['document_signatures','integration_configs','notification_logs'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('create policy tenant_isolation on %I using (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid) with check (tenant_id = nullif(current_setting(''app.tenant_id'', true), '''')::uuid)', t);
    execute format('grant select, insert, update, delete on %I to obs_app', t);
  end loop;
end $$;
