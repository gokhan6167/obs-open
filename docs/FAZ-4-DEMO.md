# Faz 4 Demo Senaryosu

Bu belge, Faz 4'te eklenen yetenekleri **uçtan uca çalıştırarak** görmek içindir:
doğrulanabilir belge (transkript PDF + QR + public verify), mezuniyet motoru,
onur/yüksek onur ve diploma numarası serisi.

İlk pilot kiracı **Demo**'dür. Veriler kiracı-izole (RLS) olduğundan, personel
uçları `x-tenant-id` başlığı ister. **İstisna:** herkese açık doğrulama ucu
(`public/verify`) tenant/kimlik **istemez** (bkz. ADR-0007).

## 1. Kurulum ve çalıştırma

Depo kökünde, sırayla:

```bash
# a) pnpm'i etkinleştir ve bağımlılıkları kur
corepack enable && pnpm install

# b) altyapıyı (PostgreSQL/Redis/MinIO) docker ile ayağa kaldır
pnpm infra:up

# c) veritabanı şemasını uygula (belge, verify_document fonksiyonu, mezuniyet dahil)
pnpm db:migrate

# d) seed verisini yükle (Demo kiracısı, programlar, öğrenciler, parametreler)
pnpm db:seed

# e) API'yi geliştirme modunda başlat (varsayılan: http://localhost:3000)
pnpm --filter @obs/api dev
```

> **Tenant ID ve öğrenci ID'yi nereden alacaksın?** Demo kiracısının `tenant_id`'si
> ve seed öğrencilerinin id'leri seed sırasında oluşturulur. **Seed çıktısındaki**
> değerleri not al; aşağıda `<DEMO_TENANT_ID>` ve `{studentId}`/`{id}` yerine
> bunları koy.

## 2. Curl örnekleri

### Transkript üret (PDF indir)

Yetkili rol (`oidb`) ile öğrencinin transkriptini üretir; yanıt bir **PDF**'tir
(doğrulama kodu + QR gömülü). Belge üretimi audit'lenir (bkz. ADR-0007).

```bash
curl -X POST \
  http://localhost:3000/api/v1/documents/students/{studentId}/transcript \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: oidb" \
  -o transkript.pdf
# Beklenen: 200 OK + transkript.pdf (içinde doğrulama kodu ve QR)
```

> PDF'te Türkçe karakterler şimdilik ASCII'ye indirgenir (WinAnsi font sınırı,
> ADR-0007 Notlar). Doğrulama kodu ve QR bundan etkilenmez.

PDF içindeki (veya yanıt üstbilgisindeki) **doğrulama kodunu** al; sonraki adımda
`{kod}` yerine bunu koyacaksın.

### Public doğrula (kimliksiz)

Herkese açık uç — **tenant/kimlik başlığı yok**. Kodun karşılığındaki belgenin
gerçekliğini teyit eder. Arka planda `SECURITY DEFINER` `verify_document`
fonksiyonu çalışır ve yalnızca public-güvenli alanları döner (bkz. ADR-0007).

```bash
curl http://localhost:3000/api/v1/public/verify/{kod}
# Beklenen 200 OK, örn:
# {
#   "valid": true,
#   "documentType": "transcript",
#   "studentNo": "2021001",
#   "programName": "Bilgisayar Muhendisligi",
#   "issuedAt": "2026-07-18T09:00:00.000Z",
#   "revoked": false
# }
```

- Geçerli, iptal edilmemiş belge → `valid: true`.
- Bilinmeyen/iptal edilmiş kod → `valid: false` (belge sahada çürütülür).
- Yanıtta `tenant_id`, kimlik, not/GNO gibi **hassas alan yoktur**.

### Mezuniyete ne kaldı (mezuniyet motoru — durum sorgusu)

Öğrencinin mezuniyet koşullarını değerlendirir: sağlanan/eksik kriterler, kalan
AKTS, GNO durumu vb.

```bash
curl http://localhost:3000/api/v1/graduation/students/{id}/status \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: oidb"
# Beklenen 200 OK, örn:
# {
#   "eligible": true,
#   "gpa": 3.42,
#   "completedEcts": 240,
#   "requiredEcts": 240,
#   "missing": [],
#   "honor": "yuksek_onur"
# }
```

> Onur/yüksek onur, GNO eşiklerine göre belirlenir; eşikler hard-code değil,
> versiyonlu parametredir (bkz. ADR-0006).

### Mezuniyet onayı (diploma numarası serisi)

Koşulları sağlayan öğrenci için mezuniyeti onaylar, **diploma numarası** üretir
ve öğrenciyi `mezun` durumuna geçirir (durum geçişi + audit, bkz. ADR-0005).

```bash
curl -X POST \
  http://localhost:3000/api/v1/graduation/students/{id}/approve \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: oidb"
# Beklenen 200 OK, örn:
# {
#   "diplomaNo": "DEMO-2026-000123",
#   "status": "mezun",
#   "honor": "yuksek_onur"
# }
```

> Koşullar sağlanmıyorsa onay reddedilir (öğrenci `mezun` durumuna geçmez ve
> diploma numarası üretilmez).

## 3. Otomatik doğrulama

Manuel demonun yanı sıra davranış otomatik testlerle güvence altındadır. Her ikisi
de **yeşil** olmalı:

```bash
# Birim testleri (mezuniyet kuralları, onur eşiği hesabı, doğrulama kodu vb.)
pnpm test

# RLS izolasyonu + verify + mezuniyet entegrasyon testleri
pnpm --filter @obs/api test:isolation
```

- `pnpm test` — saf çekirdek mantığı (mezuniyet uygunluğu, onur/yüksek onur
  eşikleri, doğrulama kodu üretimi vb.) birim düzeyinde doğrular.
- `pnpm --filter @obs/api test:isolation` — kiracı izolasyonunu (ADR-0003) ve
  **verify (3)** + **mezuniyet (3)** entegrasyon testlerini uçtan uca doğrular:
  public doğrulamanın tenant sızdırmadan yalnızca güvenli alanları döndürmesi ve
  mezuniyet onayının koşula bağlı çalışması dahil.

## İlgili belgeler

- **ADR-0007** — Doğrulanabilir belge (doğrulama kodu + QR + public verify),
  `SECURITY DEFINER` ile public doğrulama, e-imza ertelemesi.
- **ADR-0006** — Versiyonlu parametre (onur/mezuniyet GNO eşikleri parametredir).
- **ADR-0005** — Öğrenci durum makinesi + audit (mezuniyet onayı `mezun` geçişi).
- **ADR-0003** — RLS ile tenant izolasyonu.
