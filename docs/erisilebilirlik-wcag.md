# Erişilebilirlik Rehberi (WCAG 2.1 AA)

## Neden zorunlu

OBS **kamu / vakıf üniversitelerine** satılır. Kamu kurumlarında dijital
erişilebilirlik yasal bir yükümlülüktür (WCAG 2.1 AA fiili standart; kamu web
siteleri için erişilebilirlik mevzuatı ve ilgili KVKK/eşit erişim ilkeleri).
Görme, işitme, motor ve bilişsel farklılığı olan öğrenciler ve personel OBS'yi
bir başkasına muhtaç olmadan kullanabilmelidir. Erişilebilirlik "cila" değil,
satın alma sürecinde **elenme kriteridir**.

Bu rehber, **hedef seviye WCAG 2.1 AA** olacak şekilde bağlayıcı desenleri ve
somut kod örneklerini tanımlar. Örnekler, projede **fiilen uygulanmış** olan
React Native öğrenci uygulamasından (`apps/student-mobile`) alınmıştır; web
uygulamaları (`student-web`, staff, admin) sonraki iterasyonda aynı ilkelere
göre geliştirilecektir (§CI ve §Web).

> **Durum notu.** Bu fazda erişilebilir olan **mobil iskelettir** ve desenler
> koda yerleşmiştir; ancak RN runtime bu ortamda doğrulanmamıştır (bkz.
> [ADR-0013](ADR/0013-faz-10-mobil-cila.md)). Web app'ler geldiğinde §CI'daki
> `axe` kapısı devreye alınacaktır.

---

## 1. Klavye navigasyonu (Operable — WCAG 2.1.1 / 2.4.7)

- Tüm etkileşimli öğeler **yalnızca klavye** ile kullanılabilir olmalı; fare/
  dokunma zorunlu tutulmamalı.
- **Görünür odak (focus) göstergesi** her zaman olmalı; `outline: none` tek
  başına yasak — kaldırılıyorsa yerine belirgin bir odak stili konmalı.
- **Mantıklı odak sırası**: DOM sırası görsel/okuma sırasıyla uyumlu olmalı;
  `tabindex` pozitif değerlerle sıra zorlanmamalı (`tabindex="0"` ve `-1`
  yeterli).
- **Odak tuzağı yok**: modal açıldığında odak modal içinde döner (focus trap),
  `Esc` ile kapanır ve odak tetikleyen öğeye geri döner.
- **"İçeriğe atla" (skip link)**: her sayfanın başında ana içeriğe atlayan
  gizli-ama-odaklanınca-görünür bir bağlantı.

```tsx
// Web (student-web) — skip link deseni
<a href="#main" className="skip-link">İçeriğe geç</a>
{/* ... */}
<main id="main" tabIndex={-1}>…</main>
```

```css
.skip-link {
  position: absolute;
  left: -9999px;
}
.skip-link:focus {
  left: 8px;
  top: 8px;
} /* odaklanınca görünür */
```

---

## 2. Ekran okuyucu: semantik + ARIA (Perceivable / Robust — WCAG 1.3.1 / 4.1.2)

**İlke: önce doğru HTML/RN öğesi, ARIA en son çare.** Bir `<button>`, `role` +
`tabindex` + `onKeyDown` ile taklit edilen `<div>`'e her zaman yeğlenir.

### Web

- Doğru anlamsal etiketler: `<button>`, `<nav>`, `<main>`, `<h1..h6>`, `<table>`
  başlık hücreleri (`<th scope="col">`), `<label>`.
- Sıralı ve atlamayan **başlık hiyerarşisi** (`h1` tek, sonra `h2`, `h3`…).
- Salt-görsel ikon butonlarda erişilebilir ad: `aria-label`.
- Dinamik durum: `aria-live="polite"` (bilgilendirme) / `aria-live="assertive"`
  (kritik uyarı); yüklenmede `aria-busy`.

```tsx
<button aria-label="Bildirimleri aç" aria-expanded={open}>
  <BellIcon aria-hidden="true" />
</button>

{/* form gönderim sonucu ekran okuyucuya duyurulur */}
<div role="status" aria-live="polite">
  {mesaj}
</div>
```

### Mobil (React Native)

RN'de karşılıkları `accessibilityLabel`, `accessibilityRole`,
`accessibilityState`, `accessibilityHint`'tir. Projede uygulanan desen
(`apps/student-mobile`):

```tsx
// App.tsx — başlık bölgesi semantik rolle işaretli
<View style={styles.header} accessibilityRole="header">
  <Text style={styles.title}>OBS Öğrenci</Text>
</View>
```

```tsx
// DashboardScreen.tsx — yükleme durumu okunur bir etikete sahip
<ActivityIndicator accessibilityLabel="Yükleniyor" style={styles.center} />;

// Hata, "alert" rolüyle ekran okuyucuya anında duyurulur
<View style={styles.center} accessibilityRole="alert">
  <Text style={styles.error}>{error}</Text>
</View>;

// Her özet kartı, tek başına anlaşılır bir etiket taşır
<View style={styles.card} accessibilityLabel={`Genel not ortalaması ${grad?.gpa ?? 0}`}>
  <Text style={styles.label}>GNO</Text>
  <Text style={styles.value}>{grad?.gpa.toFixed(2) ?? '-'}</Text>
</View>;

<View style={styles.card} accessibilityLabel="Mezuniyet durumu">
  {/* … */}
</View>;

<View style={styles.card} accessibilityLabel={`Borç ${debt ?? 0} kuruş`}>
  {/* … */}
</View>;
```

**Kart deseni ilkesi:** Kart, içindeki ayrı `<Text>` parçaları tek tek
okunmadan, tek `accessibilityLabel` ile bütün olarak anlaşılabilir olmalıdır
("Genel not ortalaması 3.42" gibi). Sayısal/kısaltmalı değerler etikette
**açık** yazılır (GNO → "Genel not ortalaması").

---

## 3. Kontrast (Perceivable — WCAG 1.4.3 / 1.4.11)

| Öğe | Minimum oran |
|---|---|
| Normal metin (< 18pt / < 14pt kalın) | **4.5:1** |
| Büyük metin (≥ 18pt / ≥ 14pt kalın) | **3:1** |
| UI bileşen sınırı, ikon, odak göstergesi, grafik | **3:1** |

- Renk **tek başına** anlam taşıyamaz (WCAG 1.4.1): "kırmızı = borçlu" yetmez;
  metin/ikon/etiket de olmalı. DashboardScreen'de borç durumu renkle değil
  **metinle** ifade edilir ("Borç yok" / "1.250,00 TL").
- Onur rozeti gibi renkli göstergeler metinle desteklenir ("Yüksek Onur").
- Tema/palet değişiklikleri kontrast tablosuna göre gözden geçirilir; tasarım
  jetonları (design tokens) doğrulanmış çiftler olarak tutulur.

---

## 4. Dokunma / tıklama hedefleri (Operable — WCAG 2.5.5 / 2.5.8)

- Dokunma hedefi minimum **44×44 CSS px** (AA için 2.5.8: 24×24 taban; ürün
  ilkesi olarak **44×44** hedeflenir — mobil ergonomi).
- Hedefler arası yeterli boşluk; yanlışlıkla tetikleme önlenir. DashboardScreen
  kartları arasında `gap: 12` uygulanır.
- Küçük ikon butonlarında görünür alan küçük olsa bile dokunulabilir alan
  `hitSlop` (RN) veya padding ile büyütülür.

```tsx
<Pressable hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }} accessibilityRole="button">
  <Icon />
</Pressable>
```

---

## 5. Form etiketleri ve hata mesajları (Perceivable / Understandable — 1.3.1 / 3.3.1 / 3.3.2 / 3.3.3)

- **Her girdi bir etiketle ilişkili** (`<label htmlFor>` / RN `accessibilityLabel`).
  Placeholder etiket yerine geçmez.
- **Hatalar metinle** anlatılır (yalnızca kırmızı çerçeve değil), girdiye
  bağlanır (`aria-describedby`) ve `aria-invalid` ile işaretlenir.
- **Yapıcı hata mesajı**: ne yanlış + nasıl düzeltilir. Backend, alan bazlı
  doğrulama hatalarını Zod ile döner (bkz.
  [ADR-0001](ADR/0001-stack-moduler-monolit.md) ve servis katmanı); arayüz bu
  mesajları ilgili alana yerleştirir.
- Zorunlu alanlar `required` + görsel işaretle belirtilir; işaret salt renk
  olamaz.

```tsx
<label htmlFor="ogrenciNo">Öğrenci No</label>
<input
  id="ogrenciNo"
  aria-invalid={!!hata}
  aria-describedby={hata ? 'ogrenciNo-hata' : undefined}
/>
{hata && (
  <p id="ogrenciNo-hata" role="alert">
    Öğrenci numarası 8 haneli olmalı (örn. 20230001).
  </p>
)}
```

Kullanıcıya gösterilen genel hata da nazik ve eyleme dönüktür; mobilde:
`setError('Bilgiler yüklenemedi. Lütfen tekrar deneyin.')` (DashboardScreen).

---

## 6. Dil ve uluslararasılaştırma (Understandable — WCAG 3.1.1 / 3.1.2)

- **Birincil dil Türkçe.** Web'de `<html lang="tr">`; içerik dili değişen
  parçalarda `lang` özniteliği.
- **i18n hazırlığı:** kullanıcıya görünen metinler kodda gömülü olsa da (iskelet)
  tek bir katmandan geçecek biçimde tutulur; sözlük tabanlı i18n (ör. `i18next`)
  ikinci dil (İngilizce) eklendiğinde devreye alınır.
- **Tarih/sayı/para biçimi** yerelleştirilir (`Intl` API); para "TL", ondalık
  ayraç virgül (mobilde `toFixed(2)` + "TL").
- **RTL, v2 kapsamı:** Arapça vb. sağdan-sola diller ürün yol haritasında v2'ye
  bırakılmıştır; bugünden mutlak sol/sağ yerine mantıksal düzen (RN'de
  `start/end`, web'de `margin-inline-*`) tercih edilerek geçiş kolaylaştırılır.

---

## 7. CI'da otomatik erişilebilirlik kontrolü (`axe`)

Otomatik testler ihlallerin bir kısmını (kontrast, eksik etiket, ARIA hatası,
başlık düzeni) yakalar; **manuel klavye + ekran okuyucu testinin yerini tutmaz**
ama regresyonu ucuza durdurur.

- **Web app'ler geldiğinde**, bileşen/e2e testlerine `@axe-core` entegre edilir
  ve **CI'da bloklayıcı** yapılır (kritik/ciddi ihlal build'i kırar). Bu, mevcut
  fail-closed disiplinine (bkz. [ADR-0012](ADR/0012-onprem-installer-lisans.md)
  ve `ci.yml`) uyumludur.
- Bugün web UI kod tabanında olmadığından bu kapı **planlıdır**; iskele hazır
  tutulur:

```ts
// Örnek (web geldiğinde): Vitest + jsdom + axe
import { axe } from 'vitest-axe';

it('Dashboard erişilebilirlik ihlali içermez', async () => {
  const { container } = render(<Dashboard {...props} />);
  expect(await axe(container)).toHaveNoViolations();
});
```

- Manuel doğrulama zorunlu kalır: **NVDA/VoiceOver + yalnız klavye** ile ana
  akışların (giriş, dashboard, ders kayıt, belge doğrulama) elle gezilmesi.

---

## 8. Mobil (React Native) özel notlar

- **`accessibilityRole`** doğru anlamı verir: `header`, `button`, `alert`,
  `link`, `image`, `summary` vb. (DashboardScreen'de `alert`, App.tsx'te
  `header`).
- **`accessibilityLabel`** kısa ve anlamlı; **`accessibilityHint`** eylemin
  sonucunu açıklar ("Dokununca borç detayına gider").
- **`accessibilityState`** ile durum bildirilir (`{ disabled, selected, busy }`).
- **Dinamik yazı tipi (Dynamic Type / font scaling)**: kullanıcı sistem yazı
  boyutunu büyüttüğünde düzen bozulmamalı; sabit yükseklikler yerine esnek
  düzen. Kritik metinlerde `allowFontScaling` kapatılmaz.
- **Dokunma hedefi** ≥ 44×44; küçük hedeflerde `hitSlop`.
- **Görselde metin** varsa `accessibilityLabel` ile yazısı verilir; salt-dekor
  görsellerde `accessibilityElementsHidden` / `importantForAccessibility="no"`.

**Referans örnek: `DashboardScreen`** — yükleme (`accessibilityLabel`), hata
(`accessibilityRole="alert"`) ve üç özet kartının (GNO, mezuniyet, borç) tek
etiketle okunabilir olması, bu rehberin mobil uygulama şablonudur. Yeni ekranlar
bu deseni izlemelidir.

---

## Kabul kriteri (özet kontrol listesi)

- [ ] Tüm akışlar yalnız klavye ile tamamlanabiliyor; görünür odak var.
- [ ] Ekran okuyucu ana akışları anlamlı okuyor (semantik + label/role).
- [ ] Kontrast oranları tabloyu karşılıyor; renk tek anlam taşıyıcı değil.
- [ ] Dokunma hedefleri ≥ 44×44, aralarında boşluk var.
- [ ] Her girdi etiketli; hatalar metinle + ilgili alana bağlı.
- [ ] `lang="tr"`; biçimler yerelleştirilmiş; mantıksal düzen (RTL v2 hazır).
- [ ] (Web geldiğinde) `axe` CI'da bloklayıcı; manuel NVDA/VoiceOver testi yapıldı.
