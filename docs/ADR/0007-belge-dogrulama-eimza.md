# ADR-0007: Doğrulanabilir Belge — Doğrulama Kodu + QR + Public Verify, SECURITY DEFINER, e-İmza Ertelemesi

## Durum

Kabul edildi — 2026-07-18

## Bağlam

Faz 4 ile OBS resmi belge üretmeye başlıyor: **transkript** (PDF) ilk çıktı.
Resmi bir belge, üretildikten sonra elden ele veya PDF olarak dolaşır; alıcı taraf
(başka bir üniversite, işveren, bir kurum) belgenin **gerçekten bu sistemden
çıktığını ve üzerinde oynanmadığını** teyit edebilmelidir. Kâğıt/PDF imza yeterli
güven vermez: taranıp değiştirilebilir.

Bu üç zorlanma noktası doğuruyor:

1. **Gerçeklik teyidi.** Belgeyi eline alan kişi, sistemin kimliğine erişimi
   olmadan (öğrenci değil, personel değil, hatta o üniversitenin kullanıcısı bile
   değil) belgenin gerçekliğini doğrulayabilmeli.
2. **Public erişim vs. tenant izolasyonu.** Doğrulama ucu **herkese açık** olmalı
   (kimlik/oturum gerektirmemeli), ama sistem çok kiracılı ve RLS ile korunuyor
   (bkz. ADR-0003). RLS `app.tenant_id` bekler; public çağıranın tenant'ı yoktur.
   Doğrulama, izolasyonu bozmadan çalışmalı ve **hassas veri sızdırmamalı**.
3. **e-İmza/KEP.** Türkiye'de resmi belge çoğu zaman elektronik imza (PAdES) ve
   KEP ister; ancak entegrasyon ağır ve dış bağımlılıklıdır. Master prompt §4
   direktifi gereği bu entegrasyon **beklemeye alınır**; belge üretimi bu olmadan
   da tam çalışır teslim edilmelidir.

## Karar

### Karar 1 — Doğrulanabilir belge: doğrulama kodu + QR + public verify

Üretilen her resmi belge, **global benzersiz bir doğrulama kodu** taşır (tenant'a
değil, tüm sisteme göre benzersiz — çünkü doğrulayan taraf tenant bilmez). Bu kod:

- Belge kaydında (üretim anındaki anlık verilerle) saklanır.
- Belgenin üzerine hem **metin** hem de **QR kod** olarak basılır. QR, herkese açık
  doğrulama ucuna (`verify/{kod}`) götürür.

Herkese açık `verify/{kod}` ucu, kodun karşılığındaki belgenin **gerçekliğini
teyit eder**: geçerli mi, hangi tip belge, kime ait (öğrenci no), hangi program,
ne zaman üretildi, **iptal edildi mi**. İptal edilmiş bir belge doğrulamada
`valid: false` (veya iptal işareti) döner; böylece geri çekilen belge sahada
çürütülebilir.

**Belge üretimi audit'lenir.** Her belge üretimi kim/ne zaman/hangi öğrenci için
sorularına yanıt verecek şekilde denetim kaydına yazılır (ADR-0005'teki audit
deseninin belge üretimine uzantısı). Belge üretimi hassas bir işlemdir; kimin
neyi ürettiği izlenebilir olmalıdır.

### Karar 2 — Public doğrulamada tenant izolasyonu: `SECURITY DEFINER` fonksiyonu

Doğrulama kimliksiz/tenant'sız çalışmalı ama **tenant izolasyonu korunmalı**.
Çözüm: PostgreSQL **`SECURITY DEFINER`** fonksiyonu — `verify_document(kod)`.

- Fonksiyon, çağıranın değil, **fonksiyon sahibinin (süper/ayrıcalıklı rol)**
  yetkisiyle çalışır; böylece RLS'i **kontrollü biçimde** aşabilir. Public çağıranın
  `app.tenant_id`'si olmadığından, `app` rolüyle doğrudan sorgu **hiçbir satır
  döndürmezdi**.
- Fonksiyon **yalnızca public-güvenli alanları** döner: belge tipi, öğrenci no,
  program, üretim tarihi, iptal durumu. `tenant_id`, kimlik bilgisi, notlar, GNO
  gibi **hassas alanlar döndürülmez**; kod tek bir belgeyi noktasal olarak çözer,
  toplu listeleme yapmaz. Böylece izolasyon "veri sızmaması" düzeyinde korunur:
  RLS'i aşan tek yol bu dar, denetlenmiş fonksiyondur.

**Neden `app` rolüyle doğrudan sorgu değil?** `app` rolü `BYPASSRLS` içermez ve
RLS `app.tenant_id` bekler (bkz. ADR-0003). Public çağıranın tenant'ı olmadığından
doğrudan sorgu ya erişimi tümden reddeder ya da tenant context'i gevşetmeyi
gerektirir — ki bu tüm izolasyonu deler. `SECURITY DEFINER` fonksiyonu, izolasyonu
gevşetmeden **yalnızca bu tek amaca** açılan güvenli bir kapıdır.

**`search_path` sabitlenir.** `SECURITY DEFINER` fonksiyonlarında en tehlikeli
zafiyet, çağıranın `search_path`'i ile fonksiyonun beklediği nesnelerin
değiştirilmesidir (privilege escalation). Bu yüzden fonksiyon
`SET search_path = public` (veya boş + tam-nitelikli isimler) ile **sabitlenir**;
bu, PostgreSQL'in `SECURITY DEFINER` için resmi güvenlik en iyi pratiğidir.

### Karar 3 — e-İmza/KEP ertelenir; belge imzasız + QR doğrulamalı tam çalışır

Master prompt §4 direktifi gereği e-imza/KEP entegrasyonu **beklemeye alınır**.
Ancak bu, belge üretimini bloke etmez:

- Belge üretimi **imzasız + QR doğrulamalı** olarak **tam çalışır** teslim edilir.
  QR + public verify, dış imza olmadan da güçlü bir gerçeklik teyidi sağlar.
- **PAdES imza alanı PDF şablonunda hazır bırakılır**; imza sonradan bu alana
  yerleşir, şablon yeniden tasarlanmaz.
- Uygulama tarafında **`SigningProvider` / `KepProvider` arayüzleri** tanımlanır ve
  şimdilik **mock** implementasyonla karşılanır. Gerçek sağlayıcı geldiğinde
  arayüzün arkasına takılır; çağıran kod değişmez.

**PDF ve QR araç seçimi:**

- **PDF üretimi: `pdf-lib`** — saf JS, **native bağımlılık yok**. Bu, on-premise ve
  **air-gapped** kurulumlar için kritiktir (headless Chrome / sistem kütüphanesi
  bağımlılığı olan çözümler bu ortamlarda kırılgandır — bkz. ADR-0004 dağıtım
  modları).
- **QR üretimi: `qrcode`** — hafif, saf JS.

## Sonuçlar

### Artılar

- **Sahada doğrulanabilir belge:** QR → public verify ile alıcı taraf, sisteme
  erişmeden gerçekliği ve iptal durumunu teyit eder.
- **İzolasyon korunur:** public erişim, RLS'i delmeden yalnızca dar bir
  `SECURITY DEFINER` fonksiyonuyla ve public-güvenli alanlarla sağlanır.
- **e-İmza'ya hazır ama ona bağımlı değil:** belge bugün tam çalışır; imza geldiğinde
  şablondaki alana ve provider arayüzüne takılır, yeniden yazım gerekmez.
- **On-prem/air-gapped dostu:** native bağımlılık yok; her dağıtım modunda aynı
  şekilde çalışır.
- **Denetlenebilir üretim:** her belge üretimi audit'lenir.

### Eksiler / Ödünler

- **`SECURITY DEFINER` dikkat ister:** yanlış `search_path` veya geniş dönüş kümesi
  bir sızıntı kapısı olur. Bu yüzden fonksiyon dar tutulur, `search_path` sabitlenir
  ve dönen alanlar public-güvenli alanlarla sınırlanır. Bu fonksiyon değiştikçe
  gözden geçirme (review) zorunludur.
- **Global benzersizlik:** doğrulama kodu tenant değil sistem geneli benzersiz
  olmalı; çakışma olasılığı ihmal edilebilir olacak kadar geniş bir kod uzayı
  gerektirir.
- **İmza henüz yok:** hukuki olarak "ıslak/e-imzalı" belge gerektiren yerlerde bu
  faz yeterli olmayabilir; QR doğrulama ara güvenceyi verir, tam e-imza Faz sonrası
  entegrasyona kalır.

### Notlar

- **Türkçe karakter sınırı (şimdilik):** `pdf-lib`'in gömülü **WinAnsi** fontları
  `ş`, `ğ`, `ı`, `İ` gibi Türkçe karakterleri kodlayamaz. Bu yüzden PDF metni
  şimdilik **ASCII'ye indirgeniyor** (ör. "ÇAĞRI" → "CAGRI"). Tam Türkçe için
  **gömülü TTF font** (`fontkit` ile `pdf-lib`'e Türkçe destekli bir TTF eklemek)
  gerekir; bu bir **Faz 10 cilası** olarak ertelenmiştir. Doğrulama kodu, QR ve
  içeriğin doğruluğu bundan etkilenmez; yalnızca gösterimdeki diakritikler eksiktir.

## İlgili

- ADR-0003 — RLS ile tenant izolasyonu (`SECURITY DEFINER`'ın aştığı ve koruduğu
  mekanizma).
- ADR-0004 — Dağıtım modları (on-prem/air-gapped: native bağımlılık kaçınması).
- ADR-0005 — Öğrenci durum makinesi ve audit deseni (belge üretimi audit'i bunun
  uzantısıdır).
- `FAZ-4-DEMO.md` — Belge üretimi, public doğrulama ve mezuniyet akışının uçtan uca
  demosu.
