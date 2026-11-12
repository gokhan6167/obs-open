# OBS Öğrenci Mobil Uygulaması (İSKELET)

React Native / Expo öğrenci uygulaması. Not/devamsızlık/program/duyuru/bildirim
odaklı (master prompt M8, §7). `@obs/api-client` ile backend'e bağlanır.

> **Durum: İskelet (Faz 10).** Ekran yapısı, API entegrasyonu ve erişilebilirlik
> desenleri kuruldu; tam navigasyon (React Navigation), giriş/token akışı ve
> mağaza yayını sonraki iterasyon. Ayrı toolchain olduğu için monorepo pnpm
> install'ından hariç tutuldu (`pnpm-workspace.yaml` `!apps/student-mobile`).

## Kurulum

```bash
cd apps/student-mobile
npm install            # RN/Expo bağımlılıkları (ayrı; monorepo lockfile'a dahil değil)
npm start              # Expo geliştirme sunucusu
```

Yapılandırma (Expo public env):

```
EXPO_PUBLIC_API_URL=https://obs.uni.edu.tr
EXPO_PUBLIC_TENANT_ID=<tenant-uuid>
```

## Erişilebilirlik (WCAG 2.1 AA)

Ekranlar `accessibilityLabel` / `accessibilityRole` taşır (kart özetleri, başlık,
hata `alert`). Kontrast ve dokunma hedefleri tasarım sisteminden gelir. Ayrıntı:
`docs/erisilebilirlik-wcag.md`.

## Mimari

- `src/api.ts` — ObsClient kurulumu (tenant + auth stub başlıkları).
- `App.tsx` — kök; dashboard.
- `src/screens/DashboardScreen.tsx` — GNO/mezuniyet/borç kartları (tek bakışta özet).
