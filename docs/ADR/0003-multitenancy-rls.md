# ADR-0003: Multi-Tenancy — Shared DB + tenant_id + PostgreSQL RLS

## Durum

Kabul edildi — 2026-07-15

## Bağlam

Ürün, tek kod tabanıyla birden çok üniversiteye hizmet veren çok kiracılı bir OBS
SaaS'ı. SaaS modunda birden çok üniversite (kiracı) aynı veritabanını paylaşabilir.
Akademik veriler son derece hassas (kimlik, not, sağlık — bkz. KVKK-envanter.md);
bir kiracının verisinin başka bir kiracıya sızması **kabul edilemez** ve hukuki
sorumluluk doğurur.

Multi-tenancy için üç klasik yaklaşım vardır:

1. **Kiracı başına ayrı veritabanı** — en güçlü izolasyon, ama on-premise'e uygun
   çokluk yükü yaratmaz (on-prem zaten tek kiracı), SaaS'ta ise yüzlerce DB'yi
   şema-migrasyon açısından yönetmek pahalı.
2. **Kiracı başına ayrı şema** — orta yol, ama migration ve bağlantı yönetimi yine
   karmaşık.
3. **Shared database + her tabloda `tenant_id` sütunu** — en basit operasyon, ama
   izolasyon tamamen uygulama kodunun her sorguya doğru `WHERE tenant_id = ?`
   koymasına bağlı → tek bir unutulan filtre veri sızıntısı demek.

## Karar

**Shared database + her tabloda `tenant_id` + PostgreSQL Row-Level Security (RLS)**
deseni benimsenir. RLS, 3. yaklaşımın basitliğini alıp izolasyonu uygulama
kodundan **veritabanı çekirdeğine** taşıyarak "çift kilit" sağlar.

### Desen

- **Her kiracıya ait tablo bir `tenant_id UUID NOT NULL` sütunu taşır** ve bu sütun
  ilgili indekslere/foreign key'lere dahildir.
- Her böyle tabloda RLS etkinleştirilir:
  ```sql
  ALTER TABLE <tablo> ENABLE ROW LEVEL SECURITY;
  ALTER TABLE <tablo> FORCE ROW LEVEL SECURITY;

  CREATE POLICY tenant_isolation ON <tablo>
    USING (tenant_id = current_setting('app.tenant_id')::uuid)
    WITH CHECK (tenant_id = current_setting('app.tenant_id')::uuid);
  ```
  - `USING`: hangi satırların okunabileceğini/güncellenebileceğini sınırlar.
  - `WITH CHECK`: INSERT/UPDATE ile yanlış `tenant_id` yazılmasını engeller
    (kiracı verisi başka kiracıya "kaçırılamaz").
  - `FORCE ROW LEVEL SECURITY`: tablo sahibi rol için bile politikayı zorlar.

- **Bağlantı başına context.** Uygulama, her transaction/istek başında aktif
  kiracıyı DB oturumuna bildirir:
  ```sql
  SET app.tenant_id = '<istekteki-tenant-uuid>';
  ```
  Bağlantı havuzu kullanıldığından, `SET LOCAL` (transaction kapsamında) veya
  transaction başında `SET` + sonunda temizleme ile bu değerin bağlantılar
  arasında sızmaması garanti altına alınır. Kiracı UUID'si, kimlik doğrulama
  katmanından (JWT/oturum) türetilir; kullanıcı girdisinden asla doğrudan
  alınmaz.

### Rol ayrımı: app rolü vs migrate rolü

İki ayrı PostgreSQL rolü kullanılır:

- **`app` rolü** (uygulamanın çalışma zamanı bağlantısı):
  - Tablo sahibi **değildir**, `BYPASSRLS` yetkisine **sahip değildir**.
  - Bu sayede RLS politikaları bu rol için **daima** uygulanır; uygulama kodu bir
    `WHERE tenant_id` unutsa bile DB satırları sızdırmaz.
  - Yalnızca DML (SELECT/INSERT/UPDATE/DELETE) yetkileri.

- **`migrate` rolü** (yalnızca migration/DDL için, ayrı bir bağlantıyla):
  - Şema sahibi; tabloları oluşturur, RLS politikalarını tanımlar.
  - DDL yürütmek içindir, normal istek yolunda **kullanılmaz**.

Bu ayrım, "çift kilit"in çekirdeğidir: çalışma zamanı rolünün RLS'i atlaması
yapısal olarak imkânsızdır.

### DEPLOYMENT_MODE ile ilişki

- `DEPLOYMENT_MODE=single-tenant` (on-premise): tek kiracı vardır. `app.tenant_id`
  yine ayarlanır (o üniversitenin sabit kiracı kimliğine); desen değişmez, böylece
  aynı kod her iki modda da aynı davranır.
- `DEPLOYMENT_MODE=multi-tenant` (SaaS): kiracı, istek bağlamından çözümlenir.

RLS deseni her iki modda **aynıdır**; tek kod tabanı korunur (bkz. ADR-0004).

## Sonuçlar

### Artılar

- **Çift kilit izolasyon:** uygulama katmanı hata yapsa bile DB sızdırmaz.
- **Basit operasyon:** tek DB, tek migration akışı, tek bağlantı havuzu.
- **On-prem ↔ SaaS tek desen:** kod her iki modda aynı.
- **Denetlenebilirlik:** izolasyon merkezi politikalarda, dağınık `WHERE`'lerde değil.

### Eksiler / Ödünler

- **`current_setting` doğru ayarlanmalı:** bağlantı-başına `SET app.tenant_id`
  unutulur veya yanlış temizlenirse ya erişim tümden reddedilir ya da yanlış
  kiracıya bağlanılır. Bu yüzden bunu tek bir merkezi katmanda (bağlantı/
  transaction sarmalayıcı) yönetiriz.
- **Performans:** her sorguya politika koşulu eklenir; `tenant_id` indekslerde
  önde olmalı.
- **Migration disiplini:** her yeni tabloya RLS eklemeyi unutmamak gerekir; bu bir
  linter/kontrol ile zorlanır (aşağıya bkz.).

## İzolasyon Testi Zorunluluğu

RLS "sessizce doğru çalışıyor gibi görünüp" aslında politikası olmayan bir tablo
bırakmak en tehlikeli hatadır. Bu yüzden şunlar **zorunludur**:

1. **Otomatik tenant izolasyon testi.** Test paketinde iki kiracı (A ve B) verisi
   kurulur; `app` rolü ile A bağlamındayken B'nin hiçbir satırının okunamadığı,
   yazılamadığı ve B `tenant_id`'siyle INSERT/UPDATE'in `WITH CHECK` tarafından
   reddedildiği doğrulanır.
2. **Politika kapsam kontrolü.** Kiracıya ait her tabloda RLS'in `ENABLE`+`FORCE`
   edildiğini ve `tenant_isolation` politikasının var olduğunu doğrulayan bir
   test/CI kontrolü. RLS'siz bir kiracı tablosu build'i **kırar**.
3. **`app` rolünün `BYPASSRLS` içermediğinin** ve tablo sahibi olmadığının testi.

Bu testler geçmeden hiçbir şema değişikliği merge edilmez.
