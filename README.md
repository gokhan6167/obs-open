# OBS — Üniversite Öğrenci Bilgi Sistemi

**Türkçe** · [English](README.en.md)

Çok kiracılı (multi-tenant) bir **Üniversite Öğrenci Bilgi Sistemi (OBS)** SaaS'ı.
İlk pilot müşteri: **Demo Üniversitesi** — sağlık
ağırlıklı vakıf üniversitesi.

Ürün iki dağıtım modunu tek kod tabanıyla destekler: **on-premise** (birincil satış
modeli; üniversite kendi altyapısında çalıştırır) ve **SaaS** (bulutta yönetilen
paylaşımlı ortam).

## Mimari özet

- **Backend:** TypeScript + NestJS, **modüler monolit** (mikroservis değil).
  Süreç ayrımı: **web** (REST API) + **worker** (BullMQ arka plan işleri), aynı
  imaj. Ayrıntı: [ADR-0001](docs/ADR/0001-stack-moduler-monolit.md).
- **Veritabanı:** PostgreSQL 16.
- **ORM:** **Drizzle** (RLS ve raw SQL hakimiyeti, şeffaf migration).
  Ayrıntı: [ADR-0002](docs/ADR/0002-orm-drizzle.md).
- **Multi-tenancy:** shared DB + her tabloda `tenant_id` + PostgreSQL **Row-Level
  Security (RLS)**; bağlantı başına `SET app.tenant_id`; `app` rolü RLS'i atlayamaz
  (çift kilit). Ayrıntı: [ADR-0003](docs/ADR/0003-multitenancy-rls.md).
- **Dağıtım:** on-prem + SaaS, tek kod tabanı,
  `DEPLOYMENT_MODE=single-tenant|multi-tenant`; installer birinci sınıf ürün.
  Ayrıntı: [ADR-0004](docs/ADR/0004-deployment-modes.md).
- **Stack:** PostgreSQL 16, Redis + BullMQ, React / React Native, REST + OpenAPI 3,
  S3 uyumlu depolama (MinIO), Argon2id parola özetleme, TOTP 2FA.

**Kritik ilke:** Akademik kurallar (harf notu eşikleri, GNO yuvarlama, devamsızlık,
AKTS limitleri, tekrar politikası, onur eşikleri...) **koda gömülü değildir**;
tamamı **tenant + program + yönetmelik-yılı** bazında DB parametresidir. Bkz.
[ASSUMPTIONS.md](docs/ASSUMPTIONS.md). Kişisel veri işleme:
[KVKK-envanter.md](docs/KVKK-envanter.md).

## Monorepo yapısı

```
obs/
├── apps/
│   ├── api/                 # NestJS modüler monolit (web + worker giriş noktaları)
│   └── student-web/         # Öğrenci web arayüzü (React)
├── packages/
│   ├── academic-core/       # Saf akademik hesap çekirdeği (GNO, harf notu, AKTS...)
│   ├── ui/                  # Paylaşılan UI bileşenleri
│   ├── config/              # Ortak yapılandırma / env şeması
│   └── openapi/             # OpenAPI 3 sözleşmesi ve üretilen tipler
├── infra/                   # docker-compose, altyapı tanımları (PG, Redis, MinIO)
└── docs/
    ├── ADR/                 # Mimari karar kayıtları
    ├── ASSUMPTIONS.md       # Akademik mevzuat varsayımları (doğrulanacak)
    └── KVKK-envanter.md     # Kişisel veri işleme envanteri iskeleti
```

> `academic-core`, dış bağımlılığı ve yan etkisi olmayan **saf** hesap
> çekirdeğidir; parametreleri girdi olarak alır (koda değer gömmez) ve determinist
> sonuç üretir. Bu, %100 test kapsamını ve golden/property test'i mümkün kılar.

## Hızlı başlangıç

Gereksinim: Node.js (LTS), Docker.

```bash
corepack enable          # pnpm'i etkinleştir
pnpm install             # bağımlılıklar
pnpm infra:up            # PostgreSQL + Redis + MinIO (docker compose)
pnpm db:migrate          # veritabanı şeması + RLS politikaları
pnpm db:seed             # ilk kiracı, parametreler ve örnek veri
pnpm dev                 # web + worker + öğrenci arayüzü (geliştirme)
```

## Faz yol haritası

| Faz | Kapsam |
|---|---|
| **Faz 0** | Dokümantasyon: ADR'ler, ASSUMPTIONS, KVKK envanteri, README (bu faz) |
| **Faz 1** | İskelet: monorepo, NestJS web/worker, Drizzle + RLS, tenant izolasyon testi |
| **Faz 2** | Kimlik & yetki: kullanıcı, rol, Argon2id, TOTP 2FA, oturum |
| **Faz 3** | Akademik yapı: fakülte/bölüm/program, ders kataloğu, müfredat, parametre modeli |
| **Faz 4** | `academic-core`: GNO/harf notu/AKTS/devamsızlık/tekrar hesapları (parametrik) |
| **Faz 5** | Ders kayıt: kontenjan (ACID, kilitli), danışman onayı |
| **Faz 6** | Not girişi & transkript: not, DZ, onur, mezuniyet kontrolü |
| **Faz 7** | Öğrenci & personel arayüzleri (React / React Native) |
| **Faz 8** | Entegrasyonlar: YÖKSİS, e-Devlet, banka; belge/raporlama |
| **Faz 9** | On-prem installer & SaaS hazırlığı; yedek/yükseltme; gözlemlenebilirlik |
| **Faz 10** | Ölçek & sertleştirme: zirve kayıt yükü, güvenlik denetimi, KVKK uyum kapanışı |

## Test / kalite disiplini

- **`academic-core`: %100 test kapsamı.** Saf hesap çekirdeği; her kural
  (GNO yuvarlama, harf eşikleri, tekrar politikası...) için test.
- **Servis katmanı: ≥ %85 kapsam.**
- **Property-based test:** akademik hesapların değişmezleri (ör. GNO'nun 0.00–4.00
  aralığında kalması, tekrar sonrası GNO tutarlılığı) rastgele girdilerle sınanır.
- **Golden test:** bilinen girdi → beklenen çıktı; yönetmelik senaryoları dondurulur.
- **Tenant izolasyon testi (zorunlu):** iki kiracı verisiyle, A bağlamında B'nin
  hiçbir satırının okunamadığı/yazılamadığı; RLS'siz kiracı tablosu build'i kırar
  (bkz. [ADR-0003](docs/ADR/0003-multitenancy-rls.md)).
- **Yük testi (k6) hedefi:** zirve ders-kayıt yükünde **p95 < 800 ms**.

## Belgeler

- [ADR-0001 — Yığın & modüler monolit](docs/ADR/0001-stack-moduler-monolit.md)
- [ADR-0002 — ORM: Drizzle](docs/ADR/0002-orm-drizzle.md)
- [ADR-0003 — Multi-tenancy & RLS](docs/ADR/0003-multitenancy-rls.md)
- [ADR-0004 — Dağıtım modları](docs/ADR/0004-deployment-modes.md)
- [ASSUMPTIONS — Akademik mevzuat varsayımları](docs/ASSUMPTIONS.md)
- [KVKK veri işleme envanteri](docs/KVKK-envanter.md)

## Lisans

[GNU AGPL-3.0](LICENSE). Kodu değiştirip ağ üzerinden hizmet olarak sunarsanız, değişikliklerin kaynak kodunu da aynı lisansla paylaşmanız gerekir.
