# Faz 5 Demo Senaryosu

Bu belge, Faz 5'te eklenen **Mali İşler (M6)** yeteneklerini **uçtan uca
çalıştırarak** görmek içindir: ücret/burs/indirim motoru, fatura üretimi,
**idempotent** ödeme (mock vPOS), öğrenci borç sorgusu ve banka mutabakatı.

İlk pilot kiracı **Demo**'dür. Veriler kiracı-izole (RLS) olduğundan, tüm mali
uçlar `x-tenant-id` başlığı ve uygun `x-user-roles` (ör. `mali`) ister. Tüm para
tutarları **kuruş** cinsindendir (bkz. ADR-0008): 12.500,00 TL → `1250000`.

## 1. Kurulum ve çalıştırma

Depo kökünde, sırayla:

```bash
# a) pnpm'i etkinleştir ve bağımlılıkları kur
corepack enable && pnpm install

# b) altyapıyı (PostgreSQL/Redis/MinIO) docker ile ayağa kaldır
pnpm infra:up

# c) veritabanı şemasını uygula (fatura, payments + idempotency kısıtı, mutabakat dahil)
pnpm db:migrate

# d) seed verisini yükle (Demo kiracısı, öğrenciler, ücret/burs/indirim parametreleri)
pnpm db:seed

# e) API'yi geliştirme modunda başlat (varsayılan: http://localhost:3000)
pnpm --filter @obs/api dev
```

> **Tenant ID ve öğrenci ID'yi nereden alacaksın?** Demo kiracısının `tenant_id`'si
> ve seed öğrencilerinin id'leri seed sırasında oluşturulur. **Seed çıktısındaki**
> değerleri not al; aşağıda `<DEMO_TENANT_ID>` ve `{studentId}`/`{id}` yerine
> bunları koy.

## 2. Curl örnekleri

Tüm uçlar `x-tenant-id` ve `x-user-roles: mali` başlıklarını ister.

### Fatura üret

Öğrenci için ilgili dönem/yıla ücret faturası üretir. Tutar, **parametrik ücret
motoru** (`computeTuition`) ile hesaplanır: burs oranı → sıralı indirimler (erken
ödeme, kardeş) → taksit bölme (artık ilk taksite, toplam net'e tam eşit). Tüm
tutarlar kuruştur (bkz. ADR-0008 Karar 1 ve Karar 4).

```bash
curl -X POST http://localhost:3000/api/v1/finance/invoices \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: mali" \
  -H "content-type: application/json" \
  -d '{"studentId":"{studentId}","termId":"{termId}","year":2026}'
# Beklenen 201 Created, örn (tutarlar KURUŞ):
# {
#   "invoiceId": "...",
#   "grossAmount": 1500000,
#   "netAmount": 1102500,
#   "installments": [
#     { "no": 1, "amount": 275626 },
#     { "no": 2, "amount": 275625 },
#     { "no": 3, "amount": 275625 },
#     { "no": 4, "amount": 275624 }
#   ]
# }
```

> Taksit artığı **ilk taksite** eklenir; taksitlerin toplamı net tutara kuruşu
> kuruşuna eşittir (275626 + 275625 + 275625 + 275624 = 1102500).

### Öde (idempotent)

Faturayı öder. **`idempotencyKey` kritiktir:** aynı anahtarla ikinci (veya
eşzamanlı) çağrı **yeni ödeme oluşturmaz**; tek ödeme kaydı kalır ve fatura tam
olarak bir kez güncellenir (bkz. ADR-0008 Karar 2). Ödeme, mock vPOS
(`MockPaymentProvider`) üzerinden akar.

```bash
curl -X POST http://localhost:3000/api/v1/finance/invoices/{id}/pay \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: mali" \
  -H "content-type: application/json" \
  -d '{"amount":275626,"idempotencyKey":"pay-2026-0001"}'
# Beklenen 200 OK, örn:
# { "paymentId": "...", "applied": true, "remainingDebt": 826874 }
```

Aynı çağrıyı **aynı `idempotencyKey` ile tekrar** çalıştır:

```bash
curl -X POST http://localhost:3000/api/v1/finance/invoices/{id}/pay \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: mali" \
  -H "content-type: application/json" \
  -d '{"amount":275626,"idempotencyKey":"pay-2026-0001"}'
# Beklenen 200 OK, örn (tekrar; yeni ödeme YOK):
# { "paymentId": "...", "applied": false, "remainingDebt": 826874 }
```

> İkinci çağrıda `applied: false` ve `remainingDebt` **değişmez** — tek ödeme
> kaydı, fatura tek kez güncellendi.

### Borç sorgu

Öğrencinin güncel borcunu (kuruş) döner. Bu değer, borç-kayıt kuralını besleyen
`FinanceService.outstandingDebt`'in çıktısıdır (bkz. ADR-0008 Karar 5). Kuralın
uygulama noktası (kayıt engeli mi, belge engeli mi) tenant parametresine göredir.

```bash
curl http://localhost:3000/api/v1/finance/students/{id}/debt \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: mali"
# Beklenen 200 OK, örn:
# { "outstandingDebt": 826874, "policy": "block_document" }
```

### Mutabakat içe aktar

Bankadan gelen tahsilat kayıtlarını (banka referansı + tutar) içe aktarır;
**tutar bazlı greedy** eşleştirme yapar ve **eşleşmeyenleri istisna raporunda**
döner (bkz. ADR-0008 Karar 5).

```bash
curl -X POST http://localhost:3000/api/v1/finance/reconciliation/import \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: mali" \
  -H "content-type: application/json" \
  -d '{"records":[{"bankRef":"HAV-001","amount":275626},{"bankRef":"HAV-002","amount":999999}]}'
# Beklenen 200 OK, örn:
# {
#   "matched":   [ { "bankRef": "HAV-001", "amount": 275626, "paymentId": "..." } ],
#   "unmatched": [ { "bankRef": "HAV-002", "amount": 999999 } ]
# }
```

> Eşleşmeyenler otomatik kapatılmaz; istisna raporu insan incelemesine bırakılır.

## 3. Otomatik doğrulama

Manuel demonun yanı sıra davranış otomatik testlerle güvence altındadır. Her ikisi
de **yeşil** olmalı:

```bash
# Birim testleri (ücret/indirim motoru + mutabakat eşleştirme)
pnpm test

# RLS izolasyonu + ödeme idempotency entegrasyon testleri
pnpm --filter @obs/api test:isolation
```

- `pnpm test` — saf çekirdek mantığını doğrular: **pricing (6)** (burs oranı,
  sıralı indirimler, taksit bölme, taksit toplamının net'e tam eşitliği) +
  **reconciliation (3)** (greedy eşleşme, eşleşmeyen istisnası).
- `pnpm --filter @obs/api test:isolation` — kiracı izolasyonunu (ADR-0003) ve
  **payment idempotency (2)** entegrasyon testlerini uçtan uca doğrular: aynı
  `idempotencyKey` ile ikinci çağrının tek ödeme bırakması **ve** aynı-key ile
  **10 eşzamanlı** callback'in tek ödeme + tek fatura güncellemesi üretmesi
  (yarış güvenliği).

## İlgili belgeler

- **ADR-0008** — Kuruş para modeli, idempotent ödeme, sonradan-tak vPOS, parametrik
  ücret/borç motoru.
- **ADR-0006** — Versiyonlu parametre (ücret/burs/indirim/taksit ve borç-kayıt
  kuralı parametredir).
- **ADR-0004** — Dağıtım modları (idempotency'nin DB kısıtına dayanması).
- **ADR-0003** — RLS ile tenant izolasyonu.
