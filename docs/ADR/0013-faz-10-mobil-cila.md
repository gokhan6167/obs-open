# ADR-0013: Faz 10 (Cila) — Tipli API İstemcisi, Mobil İskelet, Güvenlik & Erişilebilirlik

## Durum

Kabul edildi — 2026-07-18

## Bağlam

Faz 0–9 ile backend **tamamlandı**: modüler monolit ([ADR-0001](0001-stack-moduler-monolit.md)),
RLS çok-kiracılı izolasyon ([ADR-0003](0003-multitenancy-rls.md)), atomik kontenjan,
sessiz-not-değişikliği-imkânsız trigger, herkese açık `SECURITY DEFINER` belge
doğrulama, idempotent ödeme ([ADR-0008](0008-mali-idempotent-odeme-vpos.md)),
kurul/komite modeli ([ADR-0010](0010-saglik-egitim-modeli.md)), göç mutabakatı
([ADR-0011](0011-veri-gocu-mutabakat.md)) ve birinci sınıf on-prem installer
([ADR-0012](0012-onprem-installer-lisans.md)). API sözleşmesi ve iş kuralları
sağlam ve testlidir.

Faz 10 bir "cila" fazıdır: yeni domain kuralı eklemez, **ürünü satılabilir kıvama**
getirir. Bu fazın çözmesi gereken dört zorlanma noktası:

1. **İstemci tekrarı riski.** Hem web (`student-web`) hem mobil (`student-mobile`)
   aynı API'yi çağıracak. Her yüzeyde `fetch` + başlık + hata işleme kopyalamak,
   tenant/auth başlığı unutma ve tip kayması demek. **Tek, tipli, paylaşılan**
   istemciye ihtiyaç var.
2. **Mobil ile monorepo toolchain çakışması.** React Native, ayrı bir toolchain
   (Expo/Metro, kendi bağımlılık ağacı) getirir; bunu backend'in `pnpm install`'ına
   dahil etmek CI'ı yavaşlatır ve bağımlılık yüzeyini kirletir.
3. **Güvenlik denetimine hazırlık.** Kamu/vakıf satışı öncesi bağımsız pentest
   beklenir; hazırlık kontrol listesi ve CI'ın yakaladığı bulguların **kapatılması**
   gerekir.
4. **Erişilebilirlik satın-alma kriteri.** Kamu alımında WCAG 2.1 AA fiili
   şarttır; bağlayıcı bir rehber ve mobilde uygulanmış desenler gerekir.

## Karar

### Karar 1 — Tek, tipli, paylaşılan API istemcisi: `@obs/api-client`

Web ve mobilin ortak kullandığı **`packages/api-client`** (`@obs/api-client`)
oluşturuldu.

- **`ObsClient`** sınıfı tenant + auth başlıklarını (`x-tenant-id`, `x-user-id`,
  `x-user-roles`) merkezî yönetir, `/api/v1` yolunu ekler, **tipli yanıt** döndürür
  ve başarısız yanıtta **`ObsApiError(status, body)`** fırlatır.
- Sözleşme yüzeyi API ile birebir: `health`, `listPrograms`, `activeTerm`,
  `getStudent`, `graduationStatus`, `studentDebt`, `createRequest` ve tenant/kimlik
  gerektirmeyen **`verifyDocument`** (herkese açık belge doğrulama —
  [ADR-0007](0007-belge-dogrulama-eimza.md)).
- **`fetchImpl` enjekte edilebilir** (`ObsClientOptions.fetchImpl`). Bu, test ve
  SSR'da gerçek ağ olmadan **mock-fetch** kullanımını sağlar; testler
  (`client.test.ts`) `vi.fn` tabanlı mock-fetch ile URL, başlık, JSON serileştirme
  ve hata yolunu deterministik doğrular.
- Paket **saf** kalır (dış runtime bağımlılığı yok; yalnızca tipler ve `fetch`);
  ESM, `tsc` ile derlenir.

### Karar 2 — RN öğrenci uygulaması Expo iskeleti, monorepo'dan hariç

Öğrenci mobil uygulaması **`apps/student-mobile`** (Expo ~52, RN 0.76, React 18.3)
**iskelet** olarak kuruldu.

- **Ayrı toolchain izolasyonu:** `pnpm-workspace.yaml`'a **`!apps/student-mobile`**
  eklendi; RN uygulaması monorepo `pnpm install`'ından **hariç** tutulur. Böylece
  Expo/Metro bağımlılık ağacı backend CI'ını ne yavaşlatır ne kirletir; mobil kendi
  `expo start` akışıyla ayrı yürür.
- **`@obs/api-client`'ı kullanır:** `App.tsx` yapılandırmadan bir `ObsClient` üretir,
  `DashboardScreen` bununla mezuniyet durumu + borç çeker (Karar 1'in tüketicisi).
- **Erişilebilirlik desenleri koda yerleşti** (WCAG 2.1 AA — Karar 4): `App.tsx`
  başlık bölgesi `accessibilityRole="header"`; `DashboardScreen` yükleme
  `accessibilityLabel="Yükleniyor"`, hata `accessibilityRole="alert"`, üç özet kartı
  (GNO, mezuniyet, borç) tek başına anlaşılır `accessibilityLabel` taşır. Bu ekran,
  yeni mobil ekranlar için **referans şablondur**.

### Karar 3 — Güvenlik cilası: pentest hazırlık + CI'ın yakaladığı bulguların kapatılması

- **Pentest hazırlık kontrol listesi** (OWASP ASVS L2 hedefi) yazıldı:
  [docs/security/pentest-hazirlik.md](../security/pentest-hazirlik.md). Her madde
  "uygulandı / planlı / pentest'te doğrulanacak" durumuyla ve kanıt dosyasıyla
  işaretlendi; pentest kapsamı ve kuralları (yazılı yetki, prod-benzeri staging,
  sentetik veri) tanımlandı.
- **Container sertleştirme — Semgrep bulgusu giderildi:** `Dockerfile` runtime
  aşaması **non-root** çalışacak biçimde `USER node` (uid 1000) ile sabitlendi;
  build araçları/devDeps'i taşımayan ince runtime korundu.
- **Bağımlılık açıkları CI fail-closed audit ile yakalandı ve giderildi:**
  `pnpm audit --audit-level high` yüksek+ açıkta CI'yı bloklar. Bu kapı,
  **vitest / multer / drizzle / vite** zincirindeki bilinen açıkları yakaladı;
  `package.json`'da `pnpm.overrides` (`multer >=2.1.0`, `vite ^6.4.3`) ile
  güncellendi. İstismar edilebilir olmayan tek istisna **`lodash`** kaynaklı
  `GHSA-r5fr-rjxr-66jc`, `auditConfig.ignoreGhsas` altında **belgeli** biçimde
  bastırıldı (fail-open değil; nokta atışı, gerekçeli).
- SAST tarafında Semgrep (`p/secrets` + `p/owasp-top-ten` + `p/typescript`, ERROR
  severity, sürüm pinli) bloklayıcı kaldı.

### Karar 4 — Erişilebilirlik: WCAG 2.1 AA rehberi

Bağlayıcı **[erisilebilirlik-wcag.md](../erisilebilirlik-wcag.md)** rehberi yazıldı:
klavye navigasyonu, ekran okuyucu (semantik + ARIA / RN `accessibilityLabel`
/`Role`), kontrast oranları, dokunma hedefleri (≥ 44×44), form etiketi/hata mesajı,
dil (TR birincil, i18n, RTL v2), CI'da `axe` kapısı (web app'ler geldiğinde) ve
mobil desenler (`DashboardScreen` örneğiyle). Somut kod desenleri hedef seviyeyi
**WCAG 2.1 AA** olarak sabitler.

## Sonuçlar

### Artılar

- **Tek gerçek kaynak istemci:** tenant/auth başlığı ve hata işleme tek yerde;
  web ve mobil tip güvenli tüketir. `fetchImpl` enjeksiyonu sayesinde ağsız,
  deterministik test.
- **Temiz backend CI:** RN toolchain hariç tutulduğundan backend `pnpm install`/CI
  hızlı ve saf kalır; mobil bağımsız evrilebilir.
- **Denetime hazır güvenlik:** pentest kontrol listesi + non-root imaj + fail-closed
  audit ile bulgular kapatıldı; kalan "planlı" maddeler tek listede izlenebilir.
- **Satılabilir erişilebilirlik:** WCAG 2.1 AA rehberi ve mobilde uygulanmış desenler
  kamu alımı kriterini adresler.

### Eksiler / Ödünler

- **Mobil runtime bu ortamda doğrulanmadı.** `DashboardScreen`/`App.tsx` iskelet
  olarak yazıldı ve tip düzeyinde tutarlı; ancak gerçek cihaz/emülatör çalıştırması
  bu ortamda yapılmadı (Expo/Metro ayrı toolchain). **Backend tamamen doğrulandı.**
- **İstemci sözleşmesi elle senkron.** `@obs/api-client` metotları API ile elle
  hizalanır; OpenAPI'den ([README] `packages/openapi`) tip üretimi sonraki
  iterasyona bırakıldı (bugün YAGNI).
- **`axe` kapısı henüz devrede değil.** Web UI kod tabanında olmadığından
  erişilebilirlik otomasyonu **planlı**; iskelesi rehberde hazır.
- **`ignoreGhsas` bakım borcu:** bastırılan `lodash` GHSA'sı, yükseltme çıktığında
  gözden geçirilip kaldırılmalıdır (aksi hâlde sessiz kör nokta olur).

### Notlar

- **Web app'ler (student/staff/admin) sonraki iterasyon.** Bu fazın tüketici
  yüzeyi mobil iskelettir; web arayüzleri `@obs/api-client` ve WCAG rehberi
  üzerine kurulacaktır.
- **Gerçek auth akışı sonraki iterasyon.** Mobilde login + navigasyon (React
  Navigation) ve üretim JWT + token rotasyonu + 2FA henüz yok (bkz. pentest
  hazırlık §1); `App.tsx` doğrudan dashboard'ı gösterir.
- **`AUTH_STUB_ENABLED` prod'da yapısal kapalı** kalır (env `.refine()` guard);
  istemcinin `x-user-*` başlıkları yalnızca stub'la anlamlıdır, üretimde ters vekil
  bunları kırpar.

## İlgili

- [ADR-0001](0001-stack-moduler-monolit.md) — Modüler monolit; web/worker aynı imaj.
- [ADR-0003](0003-multitenancy-rls.md) — RLS çift kilit; istemcinin tenant başlığı bu izolasyona bağlanır.
- [ADR-0004](0004-deployment-modes.md) — Dağıtım modları; `DEPLOYMENT_MODE`.
- [ADR-0007](0007-belge-dogrulama-eimza.md) — Herkese açık belge doğrulama (`verifyDocument`).
- [ADR-0012](0012-onprem-installer-lisans.md) — Tek imaj / non-root Dockerfile; bu ADR container cilasını tamamlar.
- [docs/security/pentest-hazirlik.md](../security/pentest-hazirlik.md) — Pentest hazırlık kontrol listesi.
- [docs/erisilebilirlik-wcag.md](../erisilebilirlik-wcag.md) — WCAG 2.1 AA rehberi.
- [docs/PROJECT-OVERVIEW.md](../PROJECT-OVERVIEW.md) — Proje genel bakışı.
