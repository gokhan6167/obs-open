# Faz 7 Demo Senaryosu

Bu belge, Faz 7'de eklenen **Sağlık Programlarına Özel modül (M7)** yeteneklerini
**uçtan uca çalıştırarak** görmek içindir: kurul (komite) eğitim modeliyle **yıl
notu** hesabı, **klinik rotasyon** planlama, **staj/intörnlük** kaydı + defter
onayı ve **SGK** giriş bildirimi üretimi (mock).

İlk pilot kiracı **Demo**'dür (sağlık ağırlıklı vakıf üniversitesi). Veriler
kiracı-izole (RLS) olduğundan, tüm uçlar `x-tenant-id` başlığı ve uygun
`x-user-roles` (burada `oidb`) ister (bkz. ADR-0010). SGK bu fazda **mock**'tur.

## 1. Kurulum ve çalıştırma

Depo kökünde, sırayla:

```bash
# a) pnpm'i etkinleştir ve bağımlılıkları kur
corepack enable && pnpm install

# b) altyapıyı (PostgreSQL/Redis/MinIO) docker ile ayağa kaldır
pnpm infra:up

# c) veritabanı şemasını uygula (kurul, rotasyon, internship dahil)
pnpm db:migrate

# d) seed verisini yükle (Demo kiracısı, tıp/diş programı, öğrenciler, klinikler)
pnpm db:seed

# e) API'yi geliştirme modunda başlat (varsayılan: http://localhost:3000)
pnpm --filter @obs/api dev
```

> **Tenant ID ve id'leri nereden alacaksın?** Demo kiracısının `tenant_id`'si ve
> seed öğrenci/dönem/klinik id'leri seed sırasında oluşturulur. **Seed
> çıktısındaki** değerleri not al; aşağıda `<DEMO_TENANT_ID>` ve
> `{id}`/`{studentId}`/`{termId}`/`{clinicalSiteId}` yerine bunları koy.

## 2. Curl örnekleri

### Kurul yıl notu (kurul modeli)

Kurul modelindeki bir öğrencinin dönem/yıl notunu hesaplar: kurul notlarının
ağırlıklı ortalaması ile dönem sonu genel sınavı, yıl-içi ağırlıklarla birleşir;
sonuç baraja göre geçti/kaldı olarak döner (bkz. ADR-0010 Karar 1). Ağırlıklar
bin baz puandır (ör. %60 → `6000`).

```bash
curl -X POST http://localhost:3000/api/v1/health-module/students/{id}/committee-year \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: oidb" \
  -H "content-type: application/json" \
  -d '{
        "termId": "{termId}",
        "generalExamScore": 70,
        "committeesWeightInYear": 6000,
        "generalExamWeightInYear": 4000,
        "passingThreshold": 60
      }'
# Beklenen 200 OK, örn:
# {
#   "committeesAverage": 68.5,
#   "yearScore": 69.1,
#   "passed": true
# }
```

> `committeesWeightInYear` + `generalExamWeightInYear` toplamı `10000`'dir (bin
> baz puan). `yearScore` baraja (`passingThreshold`) eşit/üstündeyse `passed:
> true` döner. Yalnızca `oidb` rolü çağırabilir.

### Klinik rotasyon planı

Verilen öğrenci grubu için ilk periyot klinik yerleşimini üretir ve
`RotationAssignment` olarak kaydeder. Yerleşim `site = (grup + periyot) mod
klinik` round-robin'iyle deterministik ve (grup ≤ klinik iken) çakışmasızdır
(bkz. ADR-0010 Karar 2).

```bash
curl -X POST http://localhost:3000/api/v1/health-module/rotations/{id}/plan \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: oidb" \
  -H "content-type: application/json" \
  -d '{
        "studentIds": ["{studentId1}", "{studentId2}", "{studentId3}", "{studentId4}"],
        "startsOn": "2026-09-01"
      }'
# Beklenen 200 OK, örn:
# {
#   "rotationId": "...",
#   "assignments": [
#     { "studentId": "{studentId1}", "clinicalSiteId": "...", "period": 0 },
#     { "studentId": "{studentId2}", "clinicalSiteId": "...", "period": 0 },
#     { "studentId": "{studentId3}", "clinicalSiteId": "...", "period": 0 },
#     { "studentId": "{studentId4}", "clinicalSiteId": "...", "period": 0 }
#   ]
# }
```

> İlk periyot yerleşimi kaydedilir; çok-periyot dönüşüm geçmişi sonraki iterasyona
> bırakılmıştır (dönüşüm mantığı saf planlayıcıda test edilmiştir).

### Staj/intörnlük kaydı

Bir öğrenci için klinik sahada staj/intörnlük kaydı açar.

```bash
curl -X POST http://localhost:3000/api/v1/health-module/internships \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: oidb" \
  -H "content-type: application/json" \
  -d '{
        "studentId": "{studentId}",
        "clinicalSiteId": "{clinicalSiteId}",
        "startsOn": "2026-09-01",
        "endsOn": "2026-12-31"
      }'
# Beklenen 201 Created, örn:
# { "internshipId": "...", "status": "active", "logbookApproved": false }
```

### Staj defteri onayı

Staj defterini onaylar; onay durumu kayıtta tutulur ve denetlenebilir (bkz.
ADR-0010 Karar 3).

```bash
curl -X POST http://localhost:3000/api/v1/health-module/internships/{id}/approve-logbook \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: oidb"
# Beklenen 200 OK, örn:
# { "internshipId": "...", "logbookApproved": true }
```

### SGK giriş bildirimi üret (mock)

Aktif staj/intörnlük kayıtları için SGK giriş bildirimi verisini üretir. Gerçek
SGK entegrasyonu ertelendiği için akış **mock** `SgkProvider` üzerinden çalışır
(bkz. ADR-0010 Karar 3).

```bash
curl -X POST http://localhost:3000/api/v1/health-module/sgk/generate \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: oidb" \
  -H "content-type: application/json" \
  -d '{}'
# Beklenen 200 OK, örn (mock):
# { "generated": 3, "provider": "mock", "batchId": "..." }
```

> Üretim mock sağlayıcı üzerinden akar ve izlenebilirdir; gerçek SGK entegrasyonu
> geldiğinde `SGK_PROVIDER` token'ı değişir, çağıran kod değişmez.

## 3. Otomatik doğrulama

Manuel demonun yanı sıra davranış otomatik testlerle güvence altındadır. Her ikisi
de **yeşil** olmalı:

```bash
# Birim testleri (kurul hesabı + rotasyon planlayıcı)
pnpm test

# RLS izolasyonu + sağlık-modül akış entegrasyon testleri
pnpm --filter @obs/api test:isolation
```

- `pnpm test` — saf çekirdek mantığını doğrular: **committee (7)** — kurul
  yıl notu hesabı (kurul-içi ağırlık toplamı = 1, yıl-içi ağırlık birleşimi, baraj
  ile geçti/kaldı) — ve **rotation-planner (5)** — round-robin dizilim ve
  `hasCollision` ile çakışmasızlık.
- `pnpm --filter @obs/api test:isolation` — kiracı izolasyonunu (ADR-0003) ve
  **sağlık-modül akışı (2)** entegrasyon testlerini uçtan uca doğrular: **kurul
  yıl notu 69** ile baraj geçişi ve **rotasyon 4 atama** üretimi.

## İlgili belgeler

- **ADR-0010** — Sağlık programlarına özel (M7): kurul eğitim modeli, klinik
  rotasyon planlama, staj/intörnlük + SGK.
- **ADR-0006** — Versiyonlu parametre (kurul ağırlıkları ve barajın koda
  gömülmemesi).
- **ADR-0008** — Mali işler (`weight_bps` / bin baz puan deseninin kaynağı).
- **ADR-0003** — RLS ile tenant izolasyonu (tüm sağlık-modül sorguları
  tenant-izole).
