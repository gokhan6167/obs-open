# OBS — Proje Genel Bakış

> Çok kiracılı (multi-tenant) **Üniversite Öğrenci Bilgi Sistemi (OBS)** SaaS'ı.
> Bu belge, projenin vizyonunu, mimarisini, monorepo yapısını, faz yol haritasını,
> kalite disiplinini ve tüm mimari karar kayıtlarını (ADR) tek yerde özetler.
> Ayrıntı için ilgili ADR ve faz belgelerine bağlantılar verilmiştir.

---

## 1. Vizyon

OBS, üniversitelerin öğrenci yaşam döngüsünü (kayıt → ders alma → not → transkript →
mezuniyet → belge/doğrulama → mali işlemler) uçtan uca yöneten, **tek kod tabanıyla
birçok üniversiteye** hizmet verebilen bir öğrenci bilgi sistemidir.

- **Pilot müşteri: Demo Üniversitesi** — sağlık
  ağırlıklı vakıf üniversitesi.
- **Sağlık farklılaştırıcısı:** sağlık programlarına özgü ihtiyaçlar (kurul/komite
  modeli, staj/rotasyon planlaması, sağlık verisi hassasiyeti) çekirdek tasarıma
  dahildir; bu, OBS'yi jenerik rakiplerden ayıran dikeydir (bkz.
  [ADR-0010](ADR/0010-saglik-egitim-modeli.md)).
- **İki dağıtım modu, tek ürün:** üniversiteler OBS'yi **kendi altyapılarında**
  (on-premise; birincil satış modeli, veri egemenliği/KVKK) ya da **bulutta bizim
  işlettiğimiz** SaaS ortamında çalıştırabilir.

**Kritik ürün ilkesi — parametrik akademik motor.** Harf notu eşikleri, GNO
yuvarlama, devamsızlık, AKTS limitleri, tekrar/onur politikaları **koda gömülü
değildir**; tamamı **tenant + program + yönetmelik-yılı** bazında veritabanı
parametresidir (bkz. [ADR-0006](ADR/0006-parametre-versiyonlama.md) ve
[ASSUMPTIONS.md](ASSUMPTIONS.md)). Bu, her üniversitenin kendi yönetmeliğini
kod değişikliği olmadan işletmesini sağlar.

---

## 2. Mimari

- **Backend: TypeScript + NestJS, modüler monolit** (mikroservis değil). Süreç
  ayrımı **web** (REST API, stateless, yatay ölçeklenir) + **worker** (BullMQ arka
  plan işleri) — aynı kod, aynı imaj, farklı giriş noktası. Ayrıntı:
  [ADR-0001](ADR/0001-stack-moduler-monolit.md).
- **Veritabanı: PostgreSQL 16.** Kritik akademik işlemler (not, GNO, kontenjan)
  tek ACID transaction içinde, güçlü tutarlılıkla yürütülür.
- **ORM: Drizzle** — RLS ve raw SQL hakimiyeti, şeffaf migration. Ayrıntı:
  [ADR-0002](ADR/0002-orm-drizzle.md).
- **Multi-tenancy: shared DB + her tabloda `tenant_id` + PostgreSQL Row-Level
  Security (RLS).** Bağlantı başına `SET app.tenant_id`; çalışma zamanı `obs_app`
  rolü `BYPASSRLS` içermez ve tablo sahibi değildir → **çift kilit**: uygulama
  kodu bir `WHERE tenant_id` unutsa bile DB sızdırmaz. Ayrıntı:
  [ADR-0003](ADR/0003-multitenancy-rls.md).
- **`academic-core` saf çekirdek:** GNO/harf notu/AKTS/devamsızlık/koşul motoru
  **framework-bağımsız, yan etkisiz, deterministik** bir pakettir; parametreleri
  girdi alır (değer gömmez). Bu saflık, %100 test kapsamını ve golden/property
  testini mümkün kılar.
- **Stack:** PostgreSQL 16, Redis + BullMQ, React / React Native, REST + OpenAPI 3,
  S3 uyumlu depolama (MinIO), Argon2id parola özetleme, TOTP 2FA planı.

---

## 3. Monorepo yapısı

```
obs/
├── apps/
│   ├── api/                 # NestJS modüler monolit (web + worker giriş noktaları)
│   ├── student-web/         # Öğrenci web arayüzü (React) — sonraki iterasyon
│   └── student-mobile/      # RN/Expo öğrenci uygulaması (İSKELET, ayrı toolchain)
├── packages/
│   ├── academic-core/       # Saf akademik hesap çekirdeği (GNO, harf notu, AKTS…)
│   ├── api-client/          # @obs/api-client — tipli API istemcisi (web+mobil ortak)
│   ├── config/              # Ortak ESLint / Prettier / tsconfig
│   ├── ui/                  # Paylaşılan UI bileşenleri
│   └── openapi/             # OpenAPI 3 sözleşmesi ve üretilen tipler
├── infra/                   # docker-compose + on-prem installer (PG, Redis, MinIO, Caddy)
└── docs/
    ├── ADR/                 # Mimari karar kayıtları (0001–0013)
    ├── security/            # Pentest hazırlık, güvenlik kontrol listeleri
    ├── FAZ-*-DEMO.md        # Faz kabul/demo belgeleri
    ├── ASSUMPTIONS.md       # Akademik mevzuat varsayımları
    ├── KVKK-envanter.md     # Kişisel veri işleme envanteri
    └── erisilebilirlik-wcag.md  # WCAG 2.1 AA rehberi
```

> **`@obs/api-client`** (`packages/api-client`): tenant + auth başlıklarını yöneten,
> tipli yanıt döndüren, hatada `ObsApiError` fırlatan tek istemci. `fetchImpl`
> enjekte edilebilir olduğundan test/SSR'da mock-fetch ile deterministik denenir.
> Web ve mobil bu tek istemciyi paylaşır (bkz.
> [ADR-0013](ADR/0013-faz-10-mobil-cila.md)).

> **`apps/student-mobile`** ayrı bir toolchain (Expo/Metro) kullanır ve
> `pnpm-workspace.yaml`'da **`!apps/student-mobile`** ile monorepo install'ından
> hariç tutulur; böylece RN bağımlılıkları backend CI'ını yavaşlatmaz/kirletmez.

---

## 4. Dağıtım

- **On-premise (birincil):** üniversite kendi sunucusunda çalıştırır; `install.sh`
  tek komutla ayağa kalkar (secret üretimi, migrate, RLS + `obs_app` rolü, TLS).
  Air-gapped kurulum export/import ile desteklenir.
- **SaaS (ikincil):** bulutta bizim işlettiğimiz paylaşımlı ortam.
- **Tek imaj, iki mod:** aynı `Dockerfile` her iki modu taşır; mod imaj içinde
  değil **`DEPLOYMENT_MODE=single-tenant|multi-tenant`** ortam değişkeniyle seçilir.
  RLS deseni her iki modda aynıdır. Ayrıntı:
  [ADR-0004](ADR/0004-deployment-modes.md) ve
  [ADR-0012](ADR/0012-onprem-installer-lisans.md).
- **Sürüm paketi (edition):** on-prem'de `core`/`pro`/`health` paketleri, çevrimdışı
  doğrulanabilir **HMAC imzalı lisans** ile satılır.

---

## 5. Faz yol haritası (0–10 — tümü tamamlandı)

| Faz | Kapsam | Flagship güvence |
|---|---|---|
| **0** | Dokümantasyon: ADR'ler, ASSUMPTIONS, KVKK, README | Kararların yazılı gerekçesi |
| **1** | İskelet: monorepo, NestJS web/worker, Drizzle + RLS | **Tenant izolasyon (RLS) testi** — A, B'yi göremez |
| **2** | Kimlik & yetki: kullanıcı, rol, Argon2id, 2FA planı, RBAC | **RBAC + IDOR negatif testleri** (başkasının verisi 403) |
| **3** | Akademik yapı: fakülte/bölüm/program, katalog, müfredat, parametre | **Parametre versiyonlama** (yönetmelik-yılı bazlı) |
| **4** | `academic-core`: GNO/harf/AKTS/devamsızlık/tekrar (parametrik) | **Saf çekirdek + %100 kapsam** (property/golden) |
| **5** | Ders kayıt: kontenjan, danışman onayı | **Atomik kontenjan** (yarış güvenli, `filled ≤ quota`) |
| **6** | Not girişi & transkript: DZ, onur, mezuniyet | **Sessiz not değişikliği imkânsız** (DB trigger) |
| **7** | İletişim / talep / raporlama akışları | Talep durum makinesi + raporlama |
| **8** | Entegrasyon & belge: YÖKSİS/e-Devlet/banka, belge/doğrulama | **Herkese açık belge doğrulama** (`SECURITY DEFINER`) + **idempotent ödeme** |
| **9** | On-prem installer & SaaS operasyon; yedek/yükseltme | **Tek komut installer** + göç mutabakatı temeli |
| **10** | Cila: tipli API client, mobil iskelet, güvenlik + erişilebilirlik | **Pentest hazırlık + WCAG 2.1 AA + tipli istemci** |

> Not: Faz flagship'leri, ilgili ADR ve `FAZ-*-DEMO.md` belgelerinde kanıtlarıyla
> (test/çalıştırma) belgelidir. **Kurul/komite modeli** ([ADR-0010]) ve **göç
> mutabakatı** ([ADR-0011]) ile **installer** ([ADR-0012]) bu döngünün son üç
> mimari kararıdır.

---

## 6. Kalite disiplini

- **`academic-core`: %100 test kapsamı — bloklayıcı.** `vitest.config.ts`'te
  `lines/functions/branches/statements = 100` eşikleri; kapsam düşerse CI kırılır.
  Saf çekirdek, ~14 test dosyasında **~107 test** ile her akademik kuralı
  (GNO yuvarlama, harf eşikleri, tekrar/onur, koşul motoru) kilitler.
- **`api` katmanı: unit + entegrasyon.** Unit testler (RBAC/authorize, authz,
  fiyatlama, mutabakat, lisans…) hızlı ve saf; entegrasyon testleri **gerçek
  PostgreSQL'e** karşı koşar (`vitest.integration.config.ts`, seri çalışır).
- **Özel test türleri:**
  - **Property test** (`fast-check`): akademik değişmezler (GNO 0.00–4.00
    aralığında kalır vb.).
  - **Golden test:** bilinen girdi → beklenen çıktı; yönetmelik senaryoları
    dondurulur.
  - **Race (yarış) test:** ör. 10 eşzamanlı aynı-key ödeme çağrısı → **tek** ödeme.
  - **Idempotency test:** tekrar eden callback'ler tek etki üretir.
  - **RLS izolasyon test:** iki kiracı; A bağlamında B okunamaz/yazılamaz;
    `app.tenant_id` boşsa **sıfır satır** (güvenli varsayılan); audit `UPDATE/DELETE`
    reddedilir.
- **CI iki-modlu matris:** `ci.yml` `quality` job'u hem `multi-tenant` hem
  `single-tenant` modda koşar (lint → typecheck → test → build → migrate → RLS
  izolasyon). `security` job'u **bloklayıcı `pnpm audit` (fail-closed)** +
  **Semgrep** (`p/secrets` + `p/owasp-top-ten` + `p/typescript`) çalıştırır.
  Ayrıntı: [pentest hazırlık](security/pentest-hazirlik.md).

---

## 7. Mimari Karar Kayıtları (ADR)

| ADR | Konu |
|---|---|
| [0001](ADR/0001-stack-moduler-monolit.md) | Yığın seçimi & modüler monolit |
| [0002](ADR/0002-orm-drizzle.md) | ORM: Drizzle |
| [0003](ADR/0003-multitenancy-rls.md) | Multi-tenancy & RLS (çift kilit) |
| [0004](ADR/0004-deployment-modes.md) | Dağıtım modları (on-prem + SaaS, tek imaj) |
| [0005](ADR/0005-ogrenci-durum-makinesi.md) | Öğrenci durum makinesi |
| [0006](ADR/0006-parametre-versiyonlama.md) | Akademik parametre versiyonlama |
| [0007](ADR/0007-belge-dogrulama-eimza.md) | Belge doğrulama & e-imza |
| [0008](ADR/0008-mali-idempotent-odeme-vpos.md) | Mali: idempotent ödeme / sanal POS |
| [0009](ADR/0009-iletisim-talep-raporlama.md) | İletişim, talep & raporlama |
| [0010](ADR/0010-saglik-egitim-modeli.md) | Sağlık eğitim modeli (kurul/komite) |
| [0011](ADR/0011-veri-gocu-mutabakat.md) | Veri göçü & mutabakat |
| [0012](ADR/0012-onprem-installer-lisans.md) | On-prem installer & lisanslama |
| [0013](ADR/0013-faz-10-mobil-cila.md) | Faz 10: mobil cila, tipli istemci, güvenlik & erişilebilirlik |

---

## 8. İlgili belgeler

- [ASSUMPTIONS.md](ASSUMPTIONS.md) — Akademik mevzuat varsayımları (doğrulanacak).
- [KVKK-envanter.md](KVKK-envanter.md) — Kişisel veri işleme envanteri.
- [security/pentest-hazirlik.md](security/pentest-hazirlik.md) — Pentest hazırlık
  kontrol listesi (OWASP ASVS L2).
- [erisilebilirlik-wcag.md](erisilebilirlik-wcag.md) — Erişilebilirlik rehberi
  (WCAG 2.1 AA).
- Faz kabul belgeleri: [FAZ-1](FAZ-1-DEMO.md) · [FAZ-4](FAZ-4-DEMO.md) ·
  [FAZ-5](FAZ-5-DEMO.md) · [FAZ-6](FAZ-6-DEMO.md) · [FAZ-7](FAZ-7-DEMO.md) ·
  [FAZ-8](FAZ-8-DEMO.md).
- `infra/installer/README.md` — On-prem kurulum/yükseltme/yedek operasyon kılavuzu.
