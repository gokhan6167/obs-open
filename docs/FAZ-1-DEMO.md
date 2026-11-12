# Faz 1 Demo Senaryosu

Bu belge, Faz 1'de eklenen yetenekleri **uçtan uca çalıştırarak** görmek içindir:
öğrenci durum makinesi, akademik domain (müfredat + öğrenci + takvim), versiyonlu
parametre altyapısı ve servis+REST katmanı (OpenAPI dahil).

İlk pilot kiracı **Demo**'dür. Tüm veriler kiracı-izole (RLS) olduğundan, hemen
her istek bir `x-tenant-id` başlığı ister.

## 1. Kurulum ve çalıştırma

Depo kökünde, sırayla:

```bash
# a) pnpm'i etkinleştir ve bağımlılıkları kur
corepack enable && pnpm install

# b) altyapıyı (PostgreSQL/Redis/MinIO) docker ile ayağa kaldır
pnpm infra:up

# c) veritabanı şemasını uygula
pnpm db:migrate

# d) seed verisini yükle (Demo kiracısı, programlar, takvim, parametreler)
pnpm db:seed

# e) API'yi geliştirme modunda başlat (varsayılan: http://localhost:3000)
pnpm --filter @obs/api dev
```

> **Tenant ID'yi nereden alacaksın?** Demo kiracısının `tenant_id`'si seed
> sırasında oluşturulur. **Seed çıktısındaki `tenant_id`'yi** (veya DB'den
> `tenants` tablosunu sorgulayarak) not al; aşağıdaki curl örneklerinde
> `<DEMO_TENANT_ID>` yerine bunu koy.

## 2. Curl örnekleri

Aşağıdaki tüm istekler `x-tenant-id: <DEMO_TENANT_ID>` başlığını ister (health
hariç, ama zararı yok).

### Sağlık kontrolü

```bash
curl http://localhost:3000/api/v1/health
```

### Programlar (müfredat hiyerarşisinin kökü)

```bash
curl http://localhost:3000/api/v1/programs \
  -H "x-tenant-id: <DEMO_TENANT_ID>"
```

### Aktif akademik takvim dönemi

```bash
curl http://localhost:3000/api/v1/calendar/active-term \
  -H "x-tenant-id: <DEMO_TENANT_ID>"
```

### Öğrenci durum geçişi (durum makinesi + yetki + audit)

Bkz. **ADR-0005**. Geçiş yalnızca izinli-geçiş tablosunda tanımlıysa, çağıran
rol yetkiliyse ve audit'e yazılarak uygulanır.

**Başarılı geçiş** — `aktif → kayit_dondurma`, yetkili rol (`oidb`):

```bash
curl -X POST http://localhost:3000/api/v1/students/{id}/status \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-id: <KULLANICI_ID>" \
  -H "x-user-roles: oidb" \
  -H "Content-Type: application/json" \
  -d '{"to":"kayit_dondurma","reason":"askerlik"}'
# Beklenen: 200 OK
```

**Yetkisiz rol** — aynı istek `oidb` yerine `ogrenci` rolüyle:

```bash
curl -X POST http://localhost:3000/api/v1/students/{id}/status \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-id: <KULLANICI_ID>" \
  -H "x-user-roles: ogrenci" \
  -H "Content-Type: application/json" \
  -d '{"to":"kayit_dondurma","reason":"askerlik"}'
# Beklenen: 403 Forbidden (yetki yok — geçiş uygulanmaz)
```

**Geçersiz geçiş** — izinli-geçiş tablosunda olmayan bir hedef (ör. terminal
`mezun` durumundan çıkış, ya da tanımsız bir sıçrama):

```bash
curl -X POST http://localhost:3000/api/v1/students/{id}/status \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-id: <KULLANICI_ID>" \
  -H "x-user-roles: oidb" \
  -H "Content-Type: application/json" \
  -d '{"to":"mezun","reason":"gecersiz-deneme"}'
# Beklenen: 409 Conflict (izinsiz durum geçişi)
```

> `{id}` yerine seed'deki bir öğrencinin id'sini, `<KULLANICI_ID>` yerine bir
> kullanıcı id'sini koy. İzinli geçiş kümesi ADR-0005'te listelidir.

### OpenAPI dokümanı

Tüm REST yüzeyinin makine-okunur sözleşmesi:

```
http://localhost:3000/api/v1/docs
```

## 3. Otomatik doğrulama

Manuel demonun yanı sıra, davranış otomatik testlerle güvence altındadır. Her
ikisi de **yeşil** olmalı:

```bash
# Birim testleri (saf durum makinesi, parametre çözümleme vb.)
pnpm test

# RLS izolasyonu + öğrenci durumu entegrasyon testleri
pnpm --filter @obs/api test:isolation
```

- `pnpm test` — saf çekirdek mantığı (durum makinesi geçiş kuralları,
  `selectEffective` parametre çözümlemesi, GNO/harf hesapları) birim düzeyinde
  doğrular.
- `pnpm --filter @obs/api test:isolation` — kiracı izolasyonunu (bir kiracının
  diğerinin verisini okuyamaması/yazamaması, bkz. ADR-0003) ve öğrenci durum
  geçişini (yetkili → 200, yetkisiz → 403, geçersiz geçiş → 409) uçtan uca
  doğrular.

## İlgili belgeler

- **ADR-0005** — Öğrenci durum makinesi (saf durum makinesi + yetki + audit).
- **ADR-0006** — Versiyonlu, yürürlük-tarihli parametre altyapısı.
- **ASSUMPTIONS.md** — Parametre değerlerinin VARSAYIM envanteri.
- **ADR-0003** — RLS ile tenant izolasyonu.
