# ADR-0008: Mali İşler — Kuruş Para Modeli, İdempotent Ödeme, Sonradan-Tak vPOS, Parametrik Ücret/Borç Motoru

## Durum

Kabul edildi — 2026-07-18

## Bağlam

Faz 5 ile OBS **para işlemeye** başlıyor: ücret/burs/indirim hesabı, öğrenciye
fatura üretimi, sanal POS (vPOS) üzerinden ödeme, bankadan gelen tahsilatların
mutabakatı ve borcun ders kaydı/belge süreçleriyle ilişkisi (Mali İşler modülü,
M6).

Para, sistemin geri kalanından farklı bir titizlik ister. Beş zorlanma noktası
doğuruyor:

1. **Para hassasiyeti.** Kesir/`float` ile para tutmak yuvarlama hatası biriktirir;
   burs/indirim/taksit bölmelerinde "1 kuruş kayıp" hataları kabul edilemez.
2. **İdempotent ödeme (kritik).** vPOS ve banka callback'leri **birden çok kez**
   (tekrar denemeler, ağ zaman aşımları) ve **eşzamanlı** gelebilir. Aynı ödeme
   iki kez işlenirse öğrenci iki kez tahsil edilmiş ya da faturası çift kapatılmış
   olur. Master prompt §4: **ödeme callback'leri idempotent olmalı.**
3. **vPOS gerçek protokolü ağır ve dış bağımlılıklı.** İyzico/banka vPOS
   entegrasyonu (3D Secure, imza, hash) uzun sürer ve dış servise bağlıdır. §4
   direktifi gereği gerçek entegrasyon **ertelenir**; modül bu olmadan da uçtan
   uca çalışır teslim edilmelidir.
4. **Ücret/burs/indirim mevzuatı tenant'a özgüdür.** Burs oranı, indirim türleri
   (erken ödeme, kardeş vb.), taksit sayısı üniversiteden üniversiteye değişir;
   hiçbir tutar/oran **koda gömülmemelidir** (bkz. ADR-0006).
5. **Borç-kayıt ilişkisi politik bir tercihtir.** "Borcu olan ders kaydı yapamaz"
   mı, yoksa "yapabilir ama belge/çıktı alamaz" mı? Bu, kurumun tercihidir; koda
   gömülü tek bir kural doğru değildir.

## Karar

### Karar 1 — Tüm para KURUŞ (minor unit, `bigint`) işlenir; oranlar bin baz puan

Sistemde **hiçbir para değeri `float`/ondalık olarak tutulmaz veya hesaplanmaz.**
Tüm para tutarları **kuruş** cinsinden, **tam sayı** (`bigint`) olarak işlenir
(minor unit). Örn. 12.500,00 TL → `1250000` kuruş. Böylece toplama/çıkarma/bölme
tam sayı aritmetiğiyle yapılır; kayan nokta yuvarlama hatası **yapısal olarak
imkânsızdır**. Görüntüleme katmanında (yalnızca sunum için) kuruş → TL biçimlemesi
yapılır; hesap her zaman kuruş üzerinden döner.

Oranlar (burs, indirim yüzdeleri) da kesirli tutulmaz: **bin baz puan**
(`rate_bps`, 0–10000 arası tam sayı) ile ifade edilir. Örn. %25 → `2500 bps`,
%100 → `10000 bps`. Bir tutara oran uygulama, tam sayı aritmetiğiyle
`tutar_kuruş * bps / 10000` biçiminde yapılır; sonuç kuruşa yuvarlanır ve **artık
kuruş kaybı taksit dağıtımında telafi edilir** (bkz. Karar 4).

### Karar 2 — İdempotent ödeme: `(tenant_id, idempotency_key)` benzersiz kısıt + `onConflictDoNothing`

Ödeme, sistemin **en kritik** idempotency noktasıdır. Çözüm veritabanı
düzeyindedir, uygulama düzeyinde "önce kontrol et, sonra yaz" (check-then-act)
yarışına **güvenmez**:

- `payments` tablosunda **`(tenant_id, idempotency_key)` üzerinde benzersiz
  kısıt** tanımlanır. Her ödeme çağrısı, çağıranın (veya vPOS callback'inin)
  verdiği bir **`idempotency_key`** taşır.
- Ödeme yazımı `INSERT ... ON CONFLICT DO NOTHING` (Drizzle:
  `onConflictDoNothing`) ile yapılır. Aynı `(tenant_id, idempotency_key)` ikinci
  kez geldiğinde **yeni satır oluşmaz**; kısıt çakışması sessizce yutulur ve
  mevcut ödeme kaydı döndürülür.
- Faturayı güncelleme (ödendi işaretleme / kalan borcu düşürme) **yalnızca INSERT
  gerçekten yeni satır ürettiyse** yapılır. Böylece aynı callback tekrar/eşzamanlı
  gelse bile **tek ödeme kaydı** oluşur ve **fatura tam olarak bir kez** güncellenir.

Bu, uygulama kilidine değil, **veritabanının benzersizlik garantisine** dayandığı
için çok işlemli/çok kopyalı (bkz. ADR-0004) dağıtımlarda da yarış-güvenlidir.

**Test (yarış güvenliği):** aynı `idempotency_key` ile **10 eşzamanlı** ödeme
callback'i tetiklenir; beklenen sonuç **tek ödeme kaydı** ve **tek fatura
güncellemesi**. Bu, entegrasyon testinde (`test:isolation`) doğrulanır.

### Karar 3 — vPOS: `PaymentProvider` arayüzü + `MockPaymentProvider` + `PAYMENT_PROVIDER` token (sonradan-tak)

Gerçek vPOS protokolü (iyzico/banka) **ertelenir** (§4). Ama ödeme akışı bunu
beklemeden çalışır:

- Uygulama, somut sağlayıcıya değil bir **`PaymentProvider` arayüzüne** bağlanır
  (ör. ödeme başlat, callback doğrula/çöz gibi dar bir sözleşme).
- Şimdilik bir **`MockPaymentProvider`** bu arayüzü karşılar: 3D Secure/imza/hash
  olmadan başarılı/başarısız ödeme davranışını taklit eder ve callback'i tetikler.
- Bağımlılık, bir **`PAYMENT_PROVIDER` enjeksiyon token'ı** üzerinden verilir.
  Gerçek iyzico/banka sağlayıcısı geldiğinde bu token'ın arkasındaki
  implementasyon değişir; **çağıran kod (fatura/ödeme servisi) değişmez.** Bu, belge
  modülündeki `SigningProvider` deseninin (ADR-0007) mali karşılığıdır.

İdempotency (Karar 2) sağlayıcıdan **bağımsız** çalışır: mock da gerçek de aynı
`(tenant_id, idempotency_key)` kısıtına tabidir.

### Karar 4 — Ücret/burs/indirim motoru: saf, parametrik `computeTuition`

Ücret hesabı, yan etkisiz **saf bir fonksiyondur** (`computeTuition`) ve tüm
girdilerini **parametreden** alır (koda gömülü tutar/oran yok — ADR-0006). Sıralama
deterministiktir:

1. **Burs oranı** taban ücrete uygulanır (`rate_bps` ile).
2. **Sıralı indirimler** uygulanır: önce **erken ödeme**, sonra **kardeş** indirimi
   (sıra parametrik ve deterministik). Her indirim, bir önceki adımın sonucuna
   `rate_bps` ile işlenir.
3. **Taksit bölme:** net tutar, taksit sayısına tam sayı (kuruş) bölünür.
   **Bölmeden artan kuruş ilk taksite eklenir.** Böylece **taksitlerin toplamı
   net tutara tam olarak (kuruşu kuruşuna) eşittir**; hiçbir kuruş kaybolmaz veya
   fazladan üretilmez.

Fonksiyon saf ve deterministik olduğundan birim testle tümüyle kilitlenir
(farklı burs/indirim/taksit kombinasyonları + "toplam net'e tam eşit" değişmezi).

### Karar 5 — Borç-kayıt ilişkisi PARAMETRİK; banka mutabakatı greedy + istisna raporu

**Borç-kayıt kuralı tenant tercihidir**, koda gömülü değildir. İki mod bir tenant
parametresiyle seçilir:

- **`block_enroll`** — "borcu olan ders kaydı yapamaz": kayıt (enroll) noktasında
  borç varsa işlem reddedilir.
- **`block_document`** — "yapabilir ama belge alamaz": kayıt serbesttir; borç,
  belge/çıktı (ör. transkript) alma noktasında bloklar.

Her iki modu da tek bir kaynak besler: **`FinanceService.outstandingDebt`** bir
öğrencinin güncel borcunu (kuruş) döner. Uygulama noktası (enroll mı, belge mi)
tenant parametresine göre bu değeri sorgular; kural mantığı tek yerdedir, uygulama
noktaları yalnızca parametreye bakar.

**Banka mutabakatı**, bankadan gelen tahsilat dosyasını sistemdeki beklenen
ödemelerle eşler:

- **Dosya içe aktarma:** banka kayıtları (banka referansı + tutar) içe alınır.
- **Tutar bazlı greedy eşleştirme:** her banka kaydı, eşleşmemiş beklenen bir
  tutarla (kuruş) sırayla eşleştirilir.
- **Eşleşmeyenler istisna raporu:** eşleşmeyen banka kayıtları ve karşılıksız
  beklentiler bir **istisna raporunda** toplanır; otomatik kapatılmaz, insan
  incelemesine bırakılır. Eşleşme mantığı saf ve testlenebilirdir.

## Sonuçlar

### Artılar

- **Para hatası yapısal olarak imkânsız:** kuruş + `bigint` + `rate_bps` ile tüm
  hesap tam sayı aritmetiğidir; taksit artığı ilk taksitte telafi edilir, toplam
  net'e kuruşu kuruşuna eşittir.
- **Yarış-güvenli ödeme:** idempotency veritabanı kısıtına dayanır; aynı-key
  tekrar/eşzamanlı callback tek ödeme + tek fatura güncellemesi üretir. Çok
  kopyalı dağıtımda da güvenli.
- **vPOS'a hazır ama ona bağımlı değil:** mock ile bugün uçtan uca çalışır; gerçek
  sağlayıcı `PAYMENT_PROVIDER` token'ının arkasına takılır, çağıran kod değişmez.
- **Mevzuat gömülü değil:** ücret/burs/indirim/taksit ve borç-kayıt kuralı
  tümüyle parametriktir (ADR-0006 çizgisi).
- **Denetlenebilir mutabakat:** eşleşmeyenler otomatik kapatılmaz, istisna raporuyla
  insana taşınır.

### Eksiler / Ödünler

- **Gerçek vPOS henüz yok:** 3D Secure/imza/hash içeren gerçek banka akışı bu fazda
  test edilmez; mock davranışı gerçek sağlayıcı gelince yeniden doğrulanmalıdır.
- **Greedy eşleştirme optimal değildir:** aynı tutarlı birden çok kayıtta greedy
  yanlış çifti seçebilir; bu yüzden kesinlik değil, **istisna raporu + insan onayı**
  ile kapatılır. Daha akıllı eşleştirme (referans/tarih ipuçları) sonraki iterasyona
  bırakılmıştır.
- **Kuruş her yerde disiplin ister:** yeni para alanları eklenirken `bigint`/kuruş
  ve `rate_bps` sözleşmesine uymak zorunludur; bir yerde `float` sızarsa hata geri
  döner. Bu, kod incelemesinde gözetilir.

### Notlar

- **İade / mahsup / muhasebe dışa aktarımı** bu fazın kapsamı dışındadır; **sonraki
  iterasyona** bırakılmıştır. Bu faz, **mock vPOS ile uçtan uca** çalışan bir ödeme
  ve mutabakat hattı teslim eder.

## İlgili

- ADR-0003 — RLS ile tenant izolasyonu (`(tenant_id, idempotency_key)` kısıtı ve
  tüm mali sorgular tenant-izole çalışır).
- ADR-0004 — Dağıtım modları (idempotency'nin uygulama kilidine değil DB kısıtına
  dayanması, çok kopyalı dağıtımlarda kritik).
- ADR-0006 — Versiyonlu parametre (ücret/burs/indirim/taksit ve borç-kayıt kuralının
  koda gömülmemesi).
- ADR-0007 — `SigningProvider` sonradan-tak deseni (`PaymentProvider`'ın kardeşi).
- `FAZ-5-DEMO.md` — Fatura üretimi, idempotent ödeme, borç sorgusu ve banka
  mutabakatının uçtan uca demosu.
