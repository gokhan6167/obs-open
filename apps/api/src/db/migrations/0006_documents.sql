-- 0006_documents: doğrulanabilir belgeler + diploma serisi (Faz 4 / M5).
-- Public doğrulama: verification_code global benzersiz; SECURITY DEFINER fonksiyonu
-- RLS'i güvenli aşarak yalnızca public-güvenli alanları döndürür.

create table documents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  type text not null,
  student_id uuid not null references students(id) on delete restrict,
  verification_code text not null unique,
  payload jsonb not null,
  issued_by_user_id uuid references users(id) on delete set null,
  issued_at timestamptz not null default now(),
  revoked boolean not null default false,
  revoked_reason text
);
create index documents_student_idx on documents (tenant_id, student_id);

create table document_counters (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  key text not null,
  next_value text not null default '1',
  constraint document_counters_uq unique (tenant_id, key)
);

-- === RLS + yetkiler (DRY) ===
do $$
declare
  t text;
  tables text[] := array['documents','document_counters'];
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

-- === Public doğrulama (SECURITY DEFINER: RLS'i güvenli aşar) ===
-- Fonksiyon süper rolle oluşturulur -> owner olarak çalışır -> RLS bypass.
-- SADECE public-güvenli alanları döner (hassas veri yok). Tenant bilinmeden kod ile.
create or replace function verify_document(p_code text)
returns table(doc_type text, student_no text, program_name text, issued_at timestamptz, revoked boolean)
language sql
security definer
set search_path = public
as $$
  select d.type, s.student_no, pr.name, d.issued_at, d.revoked
  from documents d
  join students s on s.id = d.student_id
  join programs pr on pr.id = s.program_id
  where d.verification_code = p_code
$$;

revoke all on function verify_document(text) from public;
grant execute on function verify_document(text) to obs_app;
