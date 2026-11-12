# Performans — Ders Kayıt Yük Testi (Faz 2 / M3)

Ders kayıt, sistemin **en yüksek yüklü** modülü: kayıt açılış dakikasında binlerce
öğrenci aynı anda vurur. Bu dizin yük testi senaryosunu ve hedefleri tutar.

## Hedefler (master prompt §M3, §6.5)

| Metrik | Hedef |
|---|---|
| Eşzamanlı öğrenci | 20.000 |
| p95 yanıt süresi (kayıt açılışı) | < 800 ms |
| Hata oranı | < %1 |
| Kontenjan doğruluğu | **asla aşım / negatif** (kod-seviyesi garanti) |

## Kontenjan doğruluğu — koddan garanti

Yük testinden bağımsız olarak, kontenjan yarışı **atomik DB işlemiyle** garanti
altındadır ve otomatik testte kanıtlanır:

- `EnrollmentService.enroll`: `UPDATE sections SET filled = filled + 1 WHERE filled < quota RETURNING`
  (read-then-write yarışı yok) + `CHECK (filled >= 0 AND filled <= quota)` (ikinci kilit).
- Test: `apps/api/src/enrollment/enrollment.integration.test.ts` — 120 eşzamanlı
  istek / kontenjan 30 → tam 30 kayıt, asla aşım. CI'da bloklayıcı.

## Yük testini çalıştırma

```bash
# 1) Ortam ayakta + seed
pnpm infra:up && pnpm db:migrate && pnpm db:seed
pnpm --filter @obs/api dev   # API

# 2) Demo tenant + aktif dönem id'lerini al (DB'den) ve k6'yı çalıştır
k6 run -e BASE_URL=http://localhost:3000 \
       -e TENANT_ID=<demo-tenant-uuid> \
       -e TERM_ID=<aktif-term-uuid> \
       infra/perf/enrollment-load.k6.js
```

## Sonuçlar

Koşu sonuçları (özet + p95/p99, tarih, commit) bu dizine
`sonuc-YYYY-MM-DD.md` olarak eklenir. Hedef yük (20k) ayrı bir perf ortamında
dağıtık k6 ile koşulur; bu repodaki ramp lokal doğrulama içindir.

> Not: Henüz hedef-yük koşusu yapılmadı (perf ortamı Faz 9/10'da kurulacak).
> Lokal ramp ve atomik-kontenjan testi mevcut; büyük ölçek koşusu bekliyor.
