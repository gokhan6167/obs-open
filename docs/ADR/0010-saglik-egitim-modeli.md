# ADR-0010: Sağlık Programlarına Özel (M7) — Kurul Eğitim Modeli, Klinik Rotasyon Planlama, Staj/İntörnlük + SGK

## Durum

Kabul edildi — 2026-07-18

## Bağlam

Faz 7 ile OBS'ye **Sağlık Programlarına Özel modül (M7)** ekleniyor. Pilot kiracı
**Demo** sağlık ağırlıklı bir vakıf üniversitesi olduğundan, tıp/diş gibi
programların akademik çekirdeği yarıyıl-temelli mühendislik/işletme
programlarından **yapısal olarak** farklıdır. Sistem bu farkı, mevcut akademik
çekirdeği bozmadan içermelidir.

Bu modül üç zorlanma noktası doğuruyor:

1. **Eğitim modeli tek biçim değildir.** Yarıyıl modeli (mühendislik, işletme
   vb.) her dersin harf notundan **GNO** (ADR: `gpa.ts`) hesaplar. Ama tıp/diş
   programı **kurul (komite) sistemi** kullanır: bir dönem, ardışık **kurulların**
   toplamıdır; dönem sonunda ayrıca bir **genel sınav** yapılır. İki modelin
   hesabı farklıdır ama ikisi de aynı akademik çekirdeği (öğrenci, dönem, kayıt,
   durum makinesi) paylaşır. Kurul mantığı yarıyıl koduna gömülürse çekirdek
   kirlenir; ayrı bir sistem yapılırsa çekirdek çatallanır.
2. **Klinik rotasyon çakışmasız planlanmalıdır.** Klinik dönemde öğrenci grupları,
   sınırlı sayıda klinik/servis arasında **dönüşümlü** dolaşır. Aynı kliniğe aynı
   periyotta iki grup düşerse kapasite aşılır. Planlama deterministik,
   test edilebilir ve çakışmasız olmalıdır.
3. **Staj/intörnlük SGK bildirimi ister.** İntörn/stajyer, klinik sahada
   çalışırken SGK girişi bildirilir; ayrıca staj defteri onay akışı gerekir.
   Gerçek SGK entegrasyonu dış bağımlılıktır ve §4 gereği **ertelenir**; ama akış
   bunu beklemeden çalışmalıdır.

## Karar

### Karar 1 — Eğitim modeli soyutlaması: `programs.education_model = 'semester' | 'committee'` (çift model, tek çekirdek)

Program düzeyinde bir **eğitim modeli** ayrımı tanımlanır:
**`programs.education_model`** = `'semester'` | `'committee'`. İki model **ayrı
hesap** yapar ama **aynı akademik çekirdeği** paylaşır (çift model, tek çekirdek).

- **Yarıyıl modeli (`semester`):** mevcut GNO hesabını kullanır (`gpa.ts`). Her
  dersin harf notundan ağırlıklı GNO çıkar. Değişmez.
- **Kurul modeli (`committee`):** tıp/diş için. Bir **dönem = kurullar toplamı**;
  dönem sonunda ayrıca bir **genel sınav** yapılır. Hesap `academic-core`
  içindeki saf **`computeCommitteeYear`** fonksiyonuyla yapılır:

  ```
  kurullar_ortalaması = Σ (kurul_notu × kurul_içi_ağırlık)      // kurul-içi ağırlık toplamı = 1
  yıl_notu = kurullar_ortalaması × yıl_içi_kurul_ağırlığı
           + genel_sınav       × yıl_içi_genel_ağırlığı
  geçti = yıl_notu >= baraj
  ```

  - **Kurul-içi ağırlıklar** bir dönem içindeki kurulların göreli ağırlığını
    verir; **toplamları 1**'e (bin baz puanda `10000`'e) eşittir.
  - **Yıl-içi ağırlıklar** kurullar ortalaması ile genel sınavın yıl notundaki
    göreli payıdır (ör. kurullar %60, genel sınav %40).
  - **Baraj (geçme eşiği) parametriktir** — koda gömülü değildir (ADR-0006
    çizgisi); tenant/program parametresinden gelir.

- **Ağırlıklar bin baz puan (`weight_bps`)** ile ifade edilir (ADR-0008'deki
  `rate_bps` deseninin kardeşi): kesir/`float` yerine `0–10000` arası tam sayı
  (ör. %60 → `6000 bps`). Ortalama, tam sayı aritmetiğiyle
  `Σ (not × weight_bps) / 10000` biçiminde hesaplanır; kayan nokta yuvarlama
  hatası yapısal olarak önlenir.

Fonksiyon saf ve deterministik olduğundan birim testle tümüyle kilitlenir
(farklı kurul/ağırlık/baraj kombinasyonları + "kurul-içi ağırlık toplamı = 1"
değişmezi).

### Karar 2 — Klinik rotasyon planlama: grup bazlı DÖNÜŞÜMLÜ atama; saf `planRotation` round-robin

Klinik rotasyon, gruplar ile klinikler arasında **dönüşümlü** (round-robin) bir
atamadır ve saf, deterministik bir planlayıcıyla üretilir.

- **Saf `planRotation`:** her grup için, her periyotta atanacak klinik
  **`site = (grup + periyot) mod klinik_sayısı`** formülüyle belirlenir. Bu
  round-robin dizilimi, gruplar periyot periyot **dönüşümlü** olarak farklı
  kliniklere düşecek şekilde ilerletir.
- **Çakışmasızlık:** **grup sayısı ≤ klinik sayısı** olduğu sürece, her periyotta
  her klinik en fazla bir gruba düşer; plan çakışmasızdır. Bu, saf bir
  **`hasCollision`** yardımcı fonksiyonuyla doğrulanır (aynı periyot + aynı klinik
  = çakışma).
- **Kayıt:** üretilen yerleşim **`RotationAssignment`** kaydı olarak tutulur
  (grup, klinik, periyot). İlk periyot yerleşimi kaydedilir; planlayıcının kendisi
  (dönüşüm mantığı) saf fonksiyon olarak test edilir.

### Karar 3 — Staj/intörnlük + SGK: `internship` kaydı + defter onay akışı + `SgkProvider` (sonradan-tak)

Staj/intörnlük, kayıt + defter onayı + SGK bildirimi olarak modellenir; gerçek
SGK entegrasyonu ertelenir (§4).

- **`internship` kaydı:** öğrenci, klinik saha (`clinicalSiteId`), başlangıç/bitiş
  tarihleriyle bir intörnlük/staj kaydı açar.
- **Defter (logbook) onay akışı:** staj defteri, bir **onay** adımıyla
  kapatılır; onay durumu kayıtta tutulur ve denetlenebilir.
- **`SgkProvider` arayüzü + mock + `SGK_PROVIDER` token:** SGK giriş bildirimi
  verisi, somut servise değil bir **`SgkProvider` arayüzüne** bağlanır (dar
  sözleşme: intörn/stajyer için SGK giriş bildirimi verisi üret). Şimdilik bir
  **mock** bu arayüzü karşılar: gerçek SGK servisine bağlanmadan bildirim verisini
  üretir ve izlenebilir kılar. Bağımlılık bir **`SGK_PROVIDER` enjeksiyon
  token'ı** üzerinden verilir. Gerçek SGK entegrasyonu geldiğinde (§4) token'ın
  arkasındaki implementasyon değişir; **çağıran kod değişmez** (ADR-0007/0008/0009
  sonradan-tak deseni).

## Sonuçlar

### Artılar

- **Çekirdek çatallanmadan iki model:** `education_model` ayrımı sayesinde
  yarıyıl (GNO) ve kurul (yıl notu) hesabı ayrıdır ama öğrenci/dönem/durum
  çekirdeği tektir; kurul mantığı yarıyıl koduna sızmaz.
- **Kurul hesabı yapısal olarak güvenli:** `weight_bps` + tam sayı aritmetiği ile
  yuvarlama hatası önlenir; baraj ve ağırlıklar parametriktir (mevzuat gömülü
  değil, ADR-0006).
- **Rotasyon deterministik ve çakışmasız:** saf `planRotation` + `hasCollision`
  ile plan test edilebilir; grup ≤ klinik koşulunda çakışma yapısal olarak
  önlenir.
- **SGK'ya hazır ama ona bağımlı değil:** staj/intörnlük akışı mock ile bugün
  uçtan uca çalışır; gerçek SGK entegrasyonu `SGK_PROVIDER` token'ının arkasına
  takılır, çağıran kod değişmez.

### Eksiler / Ödünler

- **Gerçek SGK henüz yok:** SGK giriş bildirimi mock ile çalışır; gerçek servis
  gelince davranış yeniden doğrulanmalıdır (§4).
- **Rotasyon çok-periyot geçmişi henüz sınırlı:** yalnızca ilk periyot yerleşimi
  kaydedilir; dönüşümün tam çok-periyot geçmişi (RotationAssignment'ın her periyot
  için maddeleştirilmesi) **sonraki iterasyona** bırakılmıştır. Dönüşüm mantığı
  saf planlayıcıda test edilmiştir.
- **İki model disiplin ister:** kurul programlarına yeni akademik alan eklenirken
  `education_model` ayrımına ve `weight_bps` sözleşmesine uyulmalıdır.

### Notlar

- **OSCE / beceri lab** değerlendirmesi ve **ÇEP (Çekirdek Eğitim Programı) çıktı
  eşleştirme** bu fazın kapsamı dışındadır; **v2'ye** bırakılmıştır (veri modeli
  düşünülmüştür, hesap/akış eklenmemiştir).
- Bu faz, **mock SGK sağlayıcısıyla uçtan uca** çalışan bir sağlık-eğitim modeli
  (kurul notu + rotasyon + staj/intörnlük) teslim eder.
- Kurul ağırlıkları ve baraj bu belgede **örnek/parametre** olarak geçer; gerçek
  mevzuat oranları koda gömülü değildir, tenant/program parametresinden gelir.

## İlgili

- ADR-0003 — RLS ile tenant izolasyonu (tüm sağlık-modül sorguları tenant-izole).
- ADR-0005 — Öğrenci durum makinesi (akademik çekirdeğin paylaşılan tabanı).
- ADR-0006 — Versiyonlu parametre (kurul ağırlıkları, baraj ve model seçiminin
  koda gömülmemesi).
- ADR-0008 — Mali işler (`rate_bps` / bin baz puan deseninin kaynağı — `weight_bps`
  kardeşi).
- ADR-0007/0009 — `SigningProvider` / `YoksisProvider` sonradan-tak deseni
  (`SgkProvider`'ın kardeşi).
- `FAZ-7-DEMO.md` — Kurul yıl notu, klinik rotasyon planı, staj/intörnlük ve SGK
  üretiminin uçtan uca demosu.
