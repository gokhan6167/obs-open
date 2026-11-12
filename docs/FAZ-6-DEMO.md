# Faz 6 Demo Senaryosu

Bu belge, Faz 6'da eklenen **İletişim (M8)** ve **Raporlama (M9)** yeteneklerini
**uçtan uca çalıştırarak** görmek içindir: yapılandırılmış talep/dilekçe (durum
makinesi), bildirim, yönetim dashboard'u, hazır raporlar ve YÖKSİS export'u
(mock).

İlk pilot kiracı **Demo**'dür. Veriler kiracı-izole (RLS) olduğundan, tüm uçlar
`x-tenant-id` başlığı ve uygun `x-user-roles` (ör. `ogrenci`, `oidb`,
`rektorluk`) ister (bkz. ADR-0009). Dış bildirim kanalları ve YÖKSİS bu fazda
**mock**'tur.

## 1. Kurulum ve çalıştırma

Depo kökünde, sırayla:

```bash
# a) pnpm'i etkinleştir ve bağımlılıkları kur
corepack enable && pnpm install

# b) altyapıyı (PostgreSQL/Redis/MinIO) docker ile ayağa kaldır
pnpm infra:up

# c) veritabanı şemasını uygula (talepler, bildirimler, notification_prefs dahil)
pnpm db:migrate

# d) seed verisini yükle (Demo kiracısı, öğrenciler, programlar)
pnpm db:seed

# e) API'yi geliştirme modunda başlat (varsayılan: http://localhost:3000)
pnpm --filter @obs/api dev
```

> **Tenant ID ve öğrenci ID'yi nereden alacaksın?** Demo kiracısının `tenant_id`'si
> ve seed öğrencilerinin id'leri seed sırasında oluşturulur. **Seed çıktısındaki**
> değerleri not al; aşağıda `<DEMO_TENANT_ID>` ve `{studentId}`/`{id}` yerine
> bunları koy.

## 2. Curl örnekleri

### Talep aç (öğrenci)

Öğrenci, tanımlı bir tiple (burada `kayit_dondurma`) yapılandırılmış bir talep
açar. Serbest metin değil, alanlı `payload` gönderilir. Talep `submitted`
durumunda oluşur (bkz. ADR-0009 Karar 2).

```bash
curl -X POST http://localhost:3000/api/v1/requests \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: ogrenci" \
  -H "content-type: application/json" \
  -d '{"studentId":"{studentId}","type":"kayit_dondurma","payload":{"reason":"saglik","termId":"{termId}"}}'
# Beklenen 201 Created, örn:
# { "requestId": "...", "type": "kayit_dondurma", "status": "submitted" }
```

### Talep incele/onayla (ÖİDB)

ÖİDB önce talebi incelemeye (`in_review`), sonra onaya (`approved`) alır. Her
geçiş durum makinesinden geçer, yetki denetlenir ve **audit** kaydı düşer; karar
sonrası `RequestDecided` olayı öğrenciye **bildirim** üretir (bkz. ADR-0009
Karar 1 ve Karar 2).

```bash
# Adım 1: incelemeye al
curl -X POST http://localhost:3000/api/v1/requests/{id}/transition \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: oidb" \
  -H "content-type: application/json" \
  -d '{"to":"in_review"}'
# Beklenen 200 OK, örn:
# { "requestId": "...", "status": "in_review" }

# Adım 2: onayla (gerekçeyle)
curl -X POST http://localhost:3000/api/v1/requests/{id}/transition \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: oidb" \
  -H "content-type: application/json" \
  -d '{"to":"approved","reason":"Belge uygun, kayıt dondurma onaylandı."}'
# Beklenen 200 OK, örn:
# { "requestId": "...", "status": "approved" }
```

> Geçersiz bir geçiş (ör. `submitted` → `approved` doğrudan) `409` ile reddedilir;
> yetkisiz rol `403` alır. Onay sonrası öğrenciye bildirim, uygulama içi (DB) kayıt
> olarak düşer ve tercihine göre etkin dış kanallara (mock) gider.

### Dashboard (yönetim)

Yönetim özet göstergesini döner: öğrenci sayısı, aktif/mezun dağılımı, kayıt ve
tahsilat özeti. Yalnızca yönetim/ÖİDB rolleri erişir; sorgu tenant-izoledir (bkz.
ADR-0009 Karar 4).

```bash
curl http://localhost:3000/api/v1/reports/dashboard \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: rektorluk"
# Beklenen 200 OK, örn:
# {
#   "students": { "total": 1240, "active": 1105, "graduated": 98 },
#   "enrollments": { "currentTerm": 1105 },
#   "collections": { "totalPaid": 41250000, "outstanding": 8730000 }
# }
```

> Tahsilat toplamları **kuruş** cinsindendir (bkz. ADR-0008). `oidb` rolü de bu
> ucu çağırabilir; `ogrenci` rolü `403` alır.

### Programa göre öğrenci (hazır rapor)

Programlara göre öğrenci dağılımını döner (aggregation). Ad-hoc SQL değil, tanımlı
hazır rapordur; tenant-izole ve yetkiye bağlıdır.

```bash
curl http://localhost:3000/api/v1/reports/students-by-program \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: oidb"
# Beklenen 200 OK, örn:
# {
#   "rows": [
#     { "program": "Bilgisayar Mühendisliği", "count": 320 },
#     { "program": "Endüstri Mühendisliği",   "count": 210 }
#   ]
# }
```

### YÖKSİS export (kayıt bildirimi)

Kayıt bildirimlerini YÖKSİS'e export eder. Gerçek YÖKSİS web servisi ertelendiği
için akış **`MockYoksisProvider`** üzerinden çalışır (bkz. ADR-0009 Karar 3).

```bash
curl -X POST http://localhost:3000/api/v1/reports/yoksis/export-enrollments \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: oidb" \
  -H "content-type: application/json" \
  -d '{"termId":"{termId}"}'
# Beklenen 200 OK, örn (mock):
# { "exported": 1105, "provider": "mock", "batchId": "..." }
```

> Export mock sağlayıcı üzerinden akar ve izlenebilirdir; gerçek YÖKSİS servisi
> geldiğinde `YOKSIS_PROVIDER` token'ı değişir, çağıran kod değişmez.

## 3. Otomatik doğrulama

Manuel demonun yanı sıra davranış otomatik testlerle güvence altındadır. Her ikisi
de **yeşil** olmalı:

```bash
# Birim testleri (talep durum makinesi)
pnpm test

# RLS izolasyonu + talep akışı entegrasyon testleri
pnpm --filter @obs/api test:isolation
```

- `pnpm test` — saf çekirdek mantığını doğrular: **request-status (7)** — talep
  durum makinesinin izinli geçişleri, geçersiz geçiş reddi ve terminal durumlar.
- `pnpm --filter @obs/api test:isolation` — kiracı izolasyonunu (ADR-0003) ve
  **talep akışı (3)** entegrasyon testlerini uçtan uca doğrular: **onay + audit +
  bildirim** üretimi, **geçersiz geçişin `409`** ile reddi ve öğrencinin kendi
  talebini **iptali**.

## İlgili belgeler

- **ADR-0009** — İletişim + raporlama: bildirim adaptörü, yapılandırılmış talep,
  YÖKSİS adaptörü, hazır-rapor motoru.
- **ADR-0005** — Öğrenci durum makinesi (talep durum makinesi deseninin kaynağı).
- **ADR-0003** — RLS ile tenant izolasyonu (talep ve rapor sorguları tenant-izole).
- **ADR-0008** — Mali işler (dashboard tahsilat özetinin kaynağı, kuruş modeli).
