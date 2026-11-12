-- 0014_backoffice: geri-uyumlu (additive) backoffice alanları.
--   * Danışman atama: students.advisor_user_id 0013'te eklendi (burada yok).
--   * Dönem atlatma: students.class_year + current_semester.
--   * Özlük: users.phone + photo_url.
--   * Disiplin: disciplinary_actions tablosu (RLS + grant).
-- Hiçbir kolon/tablo düşürülmez; hepsi "if not exists".

-- === students: sınıf + yarıyıl (dönem atlatma) ===
alter table students add column if not exists class_year smallint;
alter table students add column if not exists current_semester smallint;

-- === users: iletişim + fotoğraf (özlük) ===
alter table users add column if not exists phone text;
alter table users add column if not exists photo_url text;

-- === disiplin ===
create table if not exists disciplinary_actions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete restrict,
  student_id uuid not null references students(id) on delete restrict,
  category text not null,              -- örn. uyarı / kınama / uzaklaştırma / çıkarma
  penalty text not null,               -- verilen cezanın özeti
  reason text,
  decision_no text,                    -- YKK karar no
  decision_date date,
  starts_on date,
  ends_on date,
  status text not null default 'aktif',
  created_by_user_id uuid references users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists disciplinary_actions_student_idx
  on disciplinary_actions (tenant_id, student_id);

alter table disciplinary_actions enable row level security;
create policy tenant_isolation on disciplinary_actions
  using (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
grant select, insert, update, delete on disciplinary_actions to obs_app;
