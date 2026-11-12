# ADR-0012: On-Prem Installer + SaaS Operasyon (Faz 9) — Tek İmaj İki Mod, Birinci Sınıf Installer, Yükseltme/Yedek, Lisanslama

## Durum

Kabul edildi — 2026-07-18

## Bağlam

ADR-0004 ile **on-premise birincil satış modeli**, SaaS ise ikincil olarak
sabitlenmiş; installer'ın "sonradan eklenen betik değil, **birinci sınıf ürün
parçası**" olması ilke olarak konmuştu. Faz 9 bu ilkeyi hayata geçirir: pilot
kiracı **Demo** dahil, üniversitelerin çoğu OBS'yi **kendi altyapısında**
çalıştırmak ister (veri egemenliği, KVKK, mevcut BT yatırımı). Bu modda kurulumu
bir üniversite BT ekibi yürütür; operasyonel basitlik pazarlık konusu değildir.

Bu paket dört zorlanma noktası doğuruyor:

1. **İki dağıtım modu, tek imaj.** On-prem (`single-tenant`) ve SaaS
   (`multi-tenant`) aynı kod tabanını paylaşır (ADR-0004). İki ayrı imaj tutmak
   özellik sürüklenmesi ve ikiye katlanan bakım demektir; **tek imaj** her iki
   modu da taşımalı, üretim imajı **ince** ve kendi kendine yeten olmalıdır.
2. **Kurulum tek komut olmalı.** Üniversite BT ekibi el yordamıyla `.env`
   doldurmamalı, secret üretmemeli, migration sırasını bilmemelidir. Ayrıca bazı
   üniversite ortamları **internetsiz (air-gapped)** olabilir.
3. **Sürüm yükseltme geri alınamaz risktir.** On-prem müşteri yükseltme temposunu
   biz kontrol etmediğimizden (ADR-0004 §Eksiler), yükseltme **kendi kendine
   yedekleyen** ve başarısızlıkta **otomatik geri alan** bir işlem olmalıdır.
4. **Sürüm paketleri (edition) satılıyor.** On-prem'de core/pro/health paketleri
   ve süreli lisans satılır; internetsiz sunucuda bile **çevrimdışı
   doğrulanabilir** bir lisans mekanizması gerekir.

## Karar

### Karar 1 — Tek imaj, iki mod: aynı `Dockerfile` hem on-prem hem SaaS

Kök `Dockerfile` **çok aşamalı (multi-stage)** kurulur ve **tek imaj** her iki
dağıtım modunu taşır. Mod, imaj içinde değil `DEPLOYMENT_MODE` ortam değişkeniyle
seçilir (ADR-0004).

- **`build` aşaması (`node:22-alpine`):** `argon2` native derlemesi için
  `python3 make g++ libc6-compat` kurulur; `corepack` ile pnpm etkinleştirilir.
  Yalnızca gerekli workspace parçaları kopyalanır (bağımlılık katmanı
  önbelleklensin), `pnpm install --frozen-lockfile` sonrası `@obs/academic-core`
  ve `@obs/api` derlenir.
- **`pnpm deploy --prod` ile kendi kendine yeten dağıtım:** `pnpm --filter
  @obs/api deploy --prod /prod/api` çalıştırılır. Bu, **`academic-core` workspace
  bağımlılığını enjekte eder** ve **devDeps'i hariç tutar**; sonuç `/prod/api`
  tek başına çalışabilir bir ağaçtır.
- **`runtime` aşaması (`node:22-alpine`):** yalnızca `/prod/api` kopyalanır;
  `ENV DEPLOYMENT_MODE=single-tenant` (on-prem varsayılan), `API_PORT=3000`.
  Sonuç **ince runtime (~388 MB)**: build araçları ve devDeps yok.
- **Migration'lar dist'e kopyalanır (üretimde zorunlu):**
  `apps/api/scripts/copy-migrations.mjs`, `tsc`'nin `.sql` dosyalarını
  kopyalamaması nedeniyle `src/db/migrations`'ı `dist/db/migrations`'a taşır.
  Üretimde migrate runtime'ı `node dist/db/migrate.js` bu dosyaları okur; kopya
  olmazsa migration çalışmaz.
- **`HEALTHCHECK`:** imaj kendi sağlığını `/api/v1/health` üzerinden raporlar;
  bu prob hem compose `--wait` hem `upgrade.sh` sağlık kontrolü tarafından
  kullanılır.

Container smoke doğrulaması yapıldı: imaj ayağa kalkıp **health ok** verdi.

### Karar 2 — Installer birinci sınıf üründür: tek komutla ayağa kalkan üretim yığını

`infra/installer/` üretim kalitesinde, tek komutla ayağa kalkan bir yığındır.

- **`docker-compose.prod.yml`:** `app` + `postgres:16-alpine` + `redis:7-alpine`
  + `minio` + `caddy:2-alpine`. Bağımlılıklar sağlık koşuluyla (`condition:
  service_healthy`) sıralanır; app, DB/Redis/MinIO hazır olmadan başlamaz.
- **Caddy otomatik TLS (`Caddyfile`):** `OBS_DOMAIN` gerçek alan adıysa Let's
  Encrypt ile **otomatik sertifika**, `localhost` ise dahili self-signed. Ters
  vekil app'e yönlendirir ve **güvenlik başlıkları** ekler (HSTS,
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`).
- **`install.sh` tek komut:**
  1. Docker/compose ön koşulunu kontrol eder.
  2. `.env` yoksa **rastgele secretlarla** üretir (`openssl rand -hex 24`: DB,
     app-DB, MinIO şifreleri ve JWT secretları), `chmod 600`.
  3. Önce altyapıyı (`postgres redis minio`) `--wait` ile kaldırır.
  4. `node dist/db/migrate.js` ile **şema + RLS + `obs_app` rolü** migrate eder.
  5. **`obs_app` rol şifresini `.env` ile eşitler:** migration `obs_app`'e bir
     **dev şifresi** koyar; üretimde `ALTER ROLE obs_app LOGIN PASSWORD ...` ile
     `.env`'deki `OBS_APP_DB_PASSWORD` ile **override** edilir. Böylece
     migration idempotent kalır ama üretim şifresi kaynak koda sızmaz.
  6. Uygulama + TLS reverse proxy'yi `--wait` ile kaldırır.
- **Air-gapped kurulum:** `airgap-export.sh <sürüm>` gerekli tüm imajları
  (`obs-api` + postgres/redis/minio/caddy) `docker save` ile **tek tar**'a
  paketler; internetsiz sunucuya taşınır; `airgap-import.sh <tar>` `docker load`
  ile yükler; ardından aynı `install.sh` koşulur.

### Karar 3 — Sürüm yükseltme + yedek: kendi kendine yedekleyen, başarısızlıkta otomatik geri alan yükseltme

- **`upgrade.sh <yeni-sürüm>`** şu sırayı **atomik bir işlem gibi** yürütür:
  1. **Yedek al** (`backup.sh`).
  2. `.env`'de `OBS_VERSION`'ı yeni sürüme işaretle.
  3. **Migrate** (`node dist/db/migrate.js`). Migration'lar **geriye uyumlu /
     expand-contract** olmalıdır (eski imaj yeni şemayla, yeni imaj eski şemayla
     bir süre çalışabilsin).
  4. Uygulamayı güncelle.
  5. **Sağlık kontrolü** (`/api/v1/health`).
  - **Başarısızlıkta otomatik geri alma:** migrate veya sağlık kontrolü
    başarısız olursa `rollback` çalışır: **sürümü eski değere döndürür** ve
    **`restore.sh latest` ile DB'yi geri yükler**. Yükseltme, yarım bırakılmış
    bir durumla değil, ya başarı ya da bilinen eski hâl ile biter.
- **`backup.sh`:** `pg_dump` çıktısını gzip'ler; **`BACKUP_PASSPHRASE` set ise
  `gpg` ile şifreler** (`obs-<ts>.sql.gz.gpg`), değilse şifresiz bırakıp disk
  şifrelemesine güvenildiğine dair **uyarı** verir. Son yedek `backups/latest`
  sembolik bağıyla işaretlenir.
- **`restore.sh [dosya|latest]`:** `.gpg` yedeği `BACKUP_PASSPHRASE` ile çözer,
  gunzip'ler ve `psql` ile geri yükler.
- **RPO/RTO hedefleri (mimari not):** **RPO ≤ 15 dk** (yedek sıklığı bu hedefe
  göre planlanır — cron ile periyodik `backup.sh`), **RTO ≤ 4 saat** (`restore.sh`
  + `upgrade.sh` geri alma yolu bu süreyi karşılayacak şekilde tasarlanır). Bu
  hedefler operasyon parametresidir; kesin cron/retention kurum SLA'sına göre
  netleşir (§Notlar).

### Karar 4 — Lisanslama: çevrimdışı doğrulanabilir HMAC imzalı lisans + sürüm paketi (edition)

On-prem kurulumda lisans, **internet olmadan** doğrulanabilmelidir. Lisans
anahtarı = `base64url(payload).hex(hmac)` biçimindedir; doğrulama saf ve testli
**`verifyLicense`** (`apps/api/src/licensing/license.ts`) ile yapılır.

- **`LicensePayload`:** `tenant`, `edition` (`core` | `pro` | `health`),
  `expiresAt` (`YYYY-MM-DD`). Edition, on-prem'de **feature flag paketlerini**
  belirler (hangi modül/yeteneklerin açık olduğu).
- **`signLicense(payload, secret)`:** payload'ı base64url gövde + **HMAC-SHA256**
  imzasıyla üretir (lisans anahtarı üretimi bizde kalır).
- **`verifyLicense(key, secret, now)`:** (a) biçim, (b) `timingSafeEqual` ile
  **imza**, (c) **son kullanma** (`expiresAt < now`) doğrular; sebepli sonuç
  (`valid`, `reason`, `payload`) döner. `now` **parametre** gelir (kodda
  `Date.now` yok) — böylece deterministik ve test edilebilir.
- **Saflık:** DB/dosya bağımlılığı taşımaz; **6 birim testi** biçim, imza ve
  expiry dallarını kilitler.

## Sonuçlar

### Artılar

- **Tek imaj, tek bakım:** aynı `Dockerfile` on-prem ve SaaS'ı besler; bir modda
  düzelen build/hata her ikisini düzeltir. `pnpm deploy --prod` ince, kendi
  kendine yeten runtime üretir (~388 MB).
- **Sıfır-sürtünmeli kurulum:** `OBS_DOMAIN=... ./install.sh` tek komutu; secret
  üretimi, migrate, rol-şifre eşitleme ve TLS otomatik. Air-gapped ortam
  export/import ile aynı akışa iner.
- **Güvenli yükseltme:** yükseltme kendi kendine yedekler ve başarısızlıkta
  bilinen eski hâle **otomatik geri alır**; on-prem müşteri güvenle güncelleyebilir.
- **Çevrimdışı lisanslama:** HMAC imzalı lisans internet olmadan doğrulanır;
  edition ile paket satışı feature flag'e bağlanır. Saf + testli.

### Eksiler / Ödünler

- **Migration disiplini şart:** yükseltmenin geri-uyumu, migration'ların
  **expand-contract** yazılmasına bağlıdır; bu, ADR-0004'te kabul edilen sürekli
  yatırımın bir parçasıdır.
- **Şifresiz yedek riski:** `BACKUP_PASSPHRASE` verilmezse yedek şifresizdir ve
  yalnızca disk şifrelemesine güvenir; operasyon rehberi passphrase kullanımını
  önerir.
- **Lisans secret'ı bizde:** çevrimdışı doğrulama HMAC secret'ına dayanır; secret
  sızarsa sahte lisans üretilebilir — imza/notarization sertleştirmesi sonraki
  iterasyona bırakıldı (§Notlar).
- **Installer üretim kalitesinde tutulmalı:** ADR-0004'teki gibi installer bir
  ürün olduğundan sürekli bakım gerektirir.

### Notlar

- **İki-modlu CI matrisi mevcut:** `ci.yml` quality job'u hem `multi-tenant` hem
  `single-tenant` modunda koşar; iki mod da yeşil tutulur (ADR-0004 çizgisi).
- **Worker (BullMQ) rolü ileride:** `Dockerfile` yorumunda not düşüldüğü gibi web
  rolü varsayılandır; worker aynı imajdan **ayrı bir `CMD`** ile ileride ayağa
  kalkacaktır (tek imzalı imaj ilkesi korunarak).
- **İmza/notarization (cosign) sonraki iterasyon:** imaj imzalama ve doğrulama
  bu fazda kapsam dışıdır; air-gapped tar'ın bütünlüğü ve lisans secret sertliği
  ile birlikte ele alınacaktır.
- **RPO/RTO değerleri** (≤15 dk / ≤4 saat) bu belgede **hedef parametredir**;
  kesin yedek cron'u ve retention kurum SLA'sıyla netleşir.

## İlgili

- ADR-0001 — Modüler monolit / tek imzalı imaj (web ve worker aynı imaj).
- ADR-0003 — RLS ile tenant izolasyonu (single-tenant'ta da `app.tenant_id`).
- ADR-0004 — Dağıtım modları (on-prem birincil, installer birinci sınıf ürün);
  bu ADR o ilkenin Faz 9 uygulamasıdır.
- `infra/installer/README.md` — Kurulum, air-gapped, yükseltme, yedek/geri
  yükleme ve yönetim komutlarının operasyonel kılavuzu.
