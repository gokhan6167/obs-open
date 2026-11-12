# E2E — demo-web kritik akış testleri (Playwright)

208 ekranın hiçbiri daha önce uçtan uca test edilmiyordu; bu harness kritik
akışları tarayıcıda doğrular.

## Kurulum

```bash
cd apps/demo-web
pnpm e2e:install      # chromium indir (bir kez)
```

## Çalıştırma

| Komut | Hedef | Not |
|-------|-------|-----|
| `pnpm e2e` | `BASE_URL` (vars. **canlı demo**) | READ-ONLY testler (`@write` hariç) — canlıya karşı güvenli |
| `pnpm e2e:local` | `BASE_URL` | TÜM testler (`@write` dahil) — **yalnız yerelde** çalıştır |
| `pnpm e2e:ui` | — | İnteraktif Playwright UI |

```bash
# Canlı demo'ya karşı read-only smoke (varsayılan):
pnpm e2e

# Yerel çalışan uygulamaya karşı (önce API + DB + `pnpm dev` ayakta olmalı):
BASE_URL=http://localhost:3000 pnpm e2e:local
```

## Kapsam

- **`login.spec.ts`** (read-only): login render, yanlış-parola hatası, 3 temsili
  rol (öğrenci / öğretim elemanı / öğrenci işleri) girişi → JWT + doğru panele
  yönlendirme. Canlı demo'da güvenle koşar (veri değiştirmez).

## Yazma akışları (`@write` — yalnız yerel)

Ders seçme (draft→danışman onayına gönder) ve not itirazı kararı gibi **veri
değiştiren** akışlar `@write` etiketiyle yazılmalı ki `pnpm e2e` (canlı) bunları
hariç tutsun; yalnız yerel DB'ye karşı `pnpm e2e:local` ile koşulsunlar. Canlı
demo verisini kirletmemek için bu ayrım zorunludur.
