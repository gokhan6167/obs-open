# Faz 8 Demo Senaryosu

Bu belge, Faz 8'de eklenen **Veri Göçü modülü (M11)** yeteneklerini **uçtan uca
çalıştırarak** görmek içindir: **prova (dry_run)** göç koşumu başlatma, kaynak
satırları **mapping** ile **staging + karantinaya** yükleme, göç sonrası
**mutabakat** (OİS ↔ yeni transkript) ve **canlıya geçiş hazırlık** kontrolü.

Pilot kiracı **Demo** halen bir **OİS** kullanmaktadır; canlıya geçişte tüm
tarihsel veri OBS'ye taşınacaktır. Göç ayrı ve riskli bir iş paketidir: kural
nettir — **istisna raporu sıfırlanmadan canlıya geçilmez** (bkz. ADR-0011).

Veriler kiracı-izole (RLS) olduğundan tüm uçlar `x-tenant-id` başlığı ve uygun
`x-user-roles` (burada `oidb`) ister.

## 1. Kurulum ve çalıştırma

Depo kökünde, sırayla:

```bash
# a) pnpm'i etkinleştir ve bağımlılıkları kur
corepack enable && pnpm install

# b) altyapıyı (PostgreSQL/Redis/MinIO) docker ile ayağa kaldır
pnpm infra:up

# c) veritabanı şemasını uygula (migration_runs, staging_rows,
#    quarantine_rows, reconciliation_exceptions dahil)
pnpm db:migrate

# d) seed verisini yükle (Demo kiracısı)
pnpm db:seed

# e) API'yi geliştirme modunda başlat (varsayılan: http://localhost:3000)
pnpm --filter @obs/api dev
```

> **Tenant ID'yi nereden alacaksın?** Demo kiracısının `tenant_id`'si seed
> sırasında oluşturulur. **Seed çıktısındaki** değeri not al; aşağıda
> `<DEMO_TENANT_ID>` yerine bunu, `{runId}` yerine de bir önceki adımın
> döndürdüğü koşum id'sini koy.

## 2. Curl örnekleri

### Prova göçü başlat (`dry_run`)

Yeni bir göç koşumu açar. Canlıdan önce en az 3 tam prova yapılır (bkz. ADR-0011
Karar 4); `mode` `dry_run` ile prova, `live` ile canlı koşum ayrılır. Yalnızca
`oidb` (ve `sistem_yoneticisi`) çağırabilir.

```bash
curl -X POST http://localhost:3000/api/v1/migration/runs \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: oidb" \
  -H "content-type: application/json" \
  -d '{ "mode": "dry_run" }'
# Beklenen 201 Created, örn:
# { "runId": "..." }
```

### Kaynak satırları mapping ile yükle (staging + karantina)

Ham OİS satırlarını, config'teki eşlemeye göre hedef kayda dönüştürür: eşlemesi
geçen satır **staging**'e, zorunlu alanı eksik/kirli satır sebebiyle
**karantina**ya düşer (bkz. ADR-0011 Karar 1–2). Kolon eşlemesi kodda değil,
istekteki `config`'tedir.

```bash
curl -X POST http://localhost:3000/api/v1/migration/runs/{runId}/load \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: oidb" \
  -H "content-type: application/json" \
  -d '{
        "sourceTable": "OGRENCI",
        "rows": [
          { "OGR_NO": "20210001", "TC": " 11111111111 ", "AD": "ayse" },
          { "OGR_NO": "20210002", "TC": "", "AD": "mehmet" }
        ],
        "config": {
          "target": "student",
          "fields": [
            { "target": "studentNo", "source": "OGR_NO", "transforms": ["trim"], "required": true },
            { "target": "tc", "source": "TC", "transforms": ["trim", "int"], "required": true },
            { "target": "firstName", "source": "AD", "transforms": ["trim", "upper"] }
          ]
        }
      }'
# Beklenen 200 OK, örn:
# { "loaded": 1, "quarantined": 1 }
```

> İkinci satırın `TC` alanı boş ve `required` olduğu için satır karantinaya düşer
> (`reason: "zorunlu alan eksik: tc"`). Karantina satırlarını ÖİDB elle çözer;
> çözülmeden canlıya geçilemez.

### Mutabakat çalıştır (OİS ↔ yeni transkript)

Her öğrenci için OİS transkripti ile yeni sistem transkriptini karşılaştırır: GNO
`gpaTolerance` dahilinde, toplam kredi / ders sayısı / harf notları tam eşleşme
beklenir; eksik/fazla ders de yakalanır. Uyuşmayan alanlar
`reconciliation_exceptions`'a düşer (bkz. ADR-0011 Karar 3).

```bash
curl -X POST http://localhost:3000/api/v1/migration/runs/{runId}/reconcile \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: oidb" \
  -H "content-type: application/json" \
  -d '{
        "gpaTolerance": 0.01,
        "pairs": [
          {
            "ois":  { "studentNo": "20210001", "gpa": 3.42, "totalCredit": 120, "courseCount": 40, "letters": { "MAT101": "AA", "FIZ101": "BA" } },
            "next": { "studentNo": "20210001", "gpa": 3.42, "totalCredit": 120, "courseCount": 40, "letters": { "MAT101": "AA", "FIZ101": "BA" } }
          },
          {
            "ois":  { "studentNo": "20210002", "gpa": 2.90, "totalCredit": 96, "courseCount": 32, "letters": { "MAT101": "BB" } },
            "next": { "studentNo": "20210002", "gpa": 2.90, "totalCredit": 96, "courseCount": 32, "letters": { "MAT101": "CB" } }
          }
        ]
      }'
# Beklenen 200 OK, örn:
# { "totalExceptions": 1 }
```

> Birinci öğrenci tam mutabakattır (istisna yok). İkincinin `MAT101` harf notu
> OİS'te `BB`, yeni sistemde `CB` olduğu için bir `letter:MAT101` istisnası
> üretilir. İstisna çözülene kadar canlıya geçilemez.

### Canlıya geçiş hazır mı? (readiness)

Koşumda **çözülmemiş mutabakat istisnası VEYA çözülmemiş karantina** varsa
canlıya geçiş engellenir (bkz. ADR-0011 Karar 3).

```bash
curl http://localhost:3000/api/v1/migration/runs/{runId}/readiness \
  -H "x-tenant-id: <DEMO_TENANT_ID>" \
  -H "x-user-roles: oidb"
# Beklenen 200 OK, örn (yukarıdaki adımlardan sonra):
# {
#   "canGoLive": false,
#   "unresolvedExceptions": 1,
#   "unresolvedQuarantine": 1
# }
```

> `canGoLive` yalnızca `unresolvedExceptions === 0 && unresolvedQuarantine === 0`
> iken `true` olur. Karantina ve istisnalar çözüldükçe sayılar düşer; ikisi de
> sıfırlanınca kapı açılır. **İstisna raporu sıfırlanmadan canlıya geçilmez.**

## 3. Otomatik doğrulama

Manuel demonun yanı sıra davranış otomatik testlerle güvence altındadır. Her ikisi
de **yeşil** olmalı:

```bash
# Birim testleri (saf mutabakat mantığı)
pnpm test

# RLS izolasyonu + göç akışı entegrasyon testleri
pnpm --filter @obs/api test:isolation
```

- `pnpm test` — saf **`reconcileTranscripts`** mantığını doğrular: **reconcile
  (9)** — GNO tolerans dahilinde eşleşme, kredi/ders sayısı/harf notu tam
  eşleşme, `missing`/`extra` ders ve tam mutabakat (boş liste) senaryoları.
- `pnpm --filter @obs/api test:isolation` — kiracı izolasyonunu (ADR-0003) ve
  **göç akışı (4)** entegrasyon testlerini uçtan uca doğrular:
  1. prova koşumu başlar, mapping ile **staging + karantina** ayrımı doğru üretilir;
  2. mutabakat, uyuşmayan transkript için **istisna** üretir;
  3. çözülmemiş istisna/karantina varken **canlıya GEÇİLEMEZ** (`canGoLive: false`);
  4. istisna + karantina **çözülünce canlıya geçilebilir** (`canGoLive: true`).

## İlgili belgeler

- **ADR-0011** — Veri göçü (M11): mapping tabanlı ETL, staging + karantina,
  mutabakat ve prova göçü.
- **ADR-0003** — RLS ile tenant izolasyonu (tüm göç tabloları kiracı-izole).
- **ADR-0006** — Versiyonlu parametre (eşleme/tolerans/zorunlulukların koda
  gömülmemesi çizgisi).
