# ADR-0009: İletişim + Raporlama — Bildirim Adaptörü, Yapılandırılmış Talep, YÖKSİS Adaptörü, Hazır-Rapor Motoru

## Durum

Kabul edildi — 2026-07-18

## Bağlam

Faz 6 ile OBS'nin son iki modülü ekleniyor: **İletişim (M8)** ve **Raporlama
(M9)**. Sistem artık öğrenci ve personelle iki yönlü konuşur (duyuru, bildirim,
dilekçe/talep), dış otoriteye (YÖKSİS) bildirim üretir ve yönetime karar
verdirecek raporlar çıkarır.

Bu modüller dört zorlanma noktası doğuruyor:

1. **Bildirim çok kanallıdır ve dış servise bağımlıdır.** Email/SMS/push gerçek
   sağlayıcı (Netgsm/SMTP/push servisi) uzun entegrasyon ve dış bağımlılık
   demektir; ama not yayımı, talep kararı gibi olaylar öğrenciye **hemen**
   ulaşmalı. Ayrıca kullanıcı her kanaldan haber almak istemez.
2. **Dilekçe serbest sohbet DEĞİLDİR.** "Öğrenci ile ÖİDB arası mesajlaşma"
   olarak kurgulanırsa süreç izlenemez, denetlenemez ve mükerrer/kayıp taleple
   dolar. Talep, tanımlı tipleri ve durumu olan bir **iş akışıdır**.
3. **YÖKSİS entegrasyonu gerçek web servisidir.** Kayıt/mezuniyet bildirimlerinin
   gerçek YÖKSİS servisiyle konuşması dış bağımlılıktır ve §4 gereği **ertelenir**;
   ama akış bunu beklemeden çalışmalıdır.
4. **Rapor motoru bir güvenlik yüzeyidir.** "Yöneticiye esnek sorgu" gerekçesiyle
   ad-hoc/serbest SQL açılırsa, bu SQL enjeksiyonu, tenant sızıntısı ve yetkisiz
   veri erişimi için doğrudan bir kapıdır. Master prompt §M9: rapor güvenli ve
   yetkiye bağlı olmalıdır.

## Karar

### Karar 1 — Bildirim: `NotificationChannel` arayüzü + mock kanallar; her bildirim önce DB'ye, sonra tercihe göre dış kanala

Bildirim iki katmanlıdır: **kalıcı uygulama-içi kayıt** + **dış kanal gönderimi**.

- Her bildirim **önce uygulama içi (DB) yazılır**. Kullanıcının sistemdeki
  bildirim kutusu, dış kanaldan bağımsız olarak **tek doğruluk kaynağıdır**; dış
  gönderim başarısız olsa bile bildirim kaybolmaz.
- Dış gönderim, somut sağlayıcıya değil bir **`NotificationChannel` arayüzüne**
  bağlanır (dar sözleşme: bir bildirimi bir alıcıya gönder). Şimdilik
  **`MockEmailChannel` / `MockSmsChannel` / `MockPushChannel`** bu arayüzü
  karşılar; gerçek gönderim yapmadan davranışı taklit eder ve gönderimi kayıt/log
  olarak izlenebilir kılar.
- Etkin kanallar bir **`NOTIFICATION_CHANNELS` enjeksiyon token'ı** üzerinden
  verilir (çoklu kanal koleksiyonu). Bir bildirim, kullanıcının
  **`notification_prefs`** tercihine göre **yalnızca etkin (opt-in) dış
  kanallara** iletilir; kullanıcı bir kanalı kapatmışsa oraya gönderilmez.
- Bildirimleri **domain-event'ler** tetikler; iş servisleri bildirim gönderimini
  elle çağırmaz. Örn. **`GradePublished`** (not yayımı) ilgili öğrencilere,
  **`RequestDecided`** (talep kararı — bkz. Karar 2) talep sahibine bildirim
  üretir. Böylece bildirim mantığı olay yayımlayan iş kodundan ayrışır.

Gerçek sağlayıcı (Netgsm/SMTP/push) geldiğinde `NOTIFICATION_CHANNELS`
token'ının arkasındaki implementasyon değişir; **olay yayımlayan iş kodu ve
uygulama-içi kayıt akışı değişmez** (§4 sonradan-tak deseni — ADR-0007/0008
`Provider` deseninin kardeşi).

### Karar 2 — Yapılandırılmış talep (dilekçe): tanımlı tip + durum makinesi + yetki + audit + bildirim (§M8)

Talep **serbest mesajlaşma değildir**; tanımlı tipleri ve bir durum makinesi olan
yapılandırılmış bir iş akışıdır.

- **Tanımlı talep tipleri:** her talep bir **tip** taşır — `kayit_dondurma`,
  `mazeret_sinavi`, `belge`. Her tip, kendi yapılandırılmış **`payload`**'ıyla
  (serbest metin değil, alanlı veri) açılır. Tanımsız tip kabul edilmez.
- **Durum makinesi** (ADR-0005 deseninin talep karşılığı — saf, tanımlı geçiş):

  | Kaynak | İzinli hedef | Yetkili |
  |---|---|---|
  | `submitted` | `in_review` | ÖİDB |
  | `submitted` | `cancelled` | öğrenci (kendi talebi) |
  | `in_review` | `approved` | ÖİDB |
  | `in_review` | `rejected` | ÖİDB |
  | `in_review` | `cancelled` | öğrenci (kendi talebi) |
  | `approved` / `rejected` / `cancelled` | *(terminal)* | — |

  `(mevcut_durum, hedef_durum)` tabloda yoksa geçiş **reddedilir** (`409` tipi
  geçersiz-geçiş).
- **Yetki:** Öğrenci yalnızca **kendi** talebini açar ve **iptal** eder (başka
  öğrencinin talebine dokunamaz). İnceleme (`in_review`) ve karar
  (`approved`/`rejected`) yalnızca **ÖİDB** rolündedir. Yetkisiz geçiş `403`.
- **Audit + bildirim:** Her karar (ve her geçiş) **kim / kaynak→hedef / ne zaman
  / gerekçe (reason)** ile denetim kaydına yazılır. Karar sonrası
  **`RequestDecided`** olayı yayımlanır; talep sahibi öğrenci Karar 1 hattıyla
  bilgilendirilir.

### Karar 3 — YÖKSİS: `YoksisProvider` arayüzü + `MockYoksisProvider` + `YOKSIS_PROVIDER` token (sonradan-tak)

Gerçek YÖKSİS web servisi entegrasyonu **ertelenir** (§4); akış bunu beklemeden
çalışır:

- Uygulama, somut servise değil bir **`YoksisProvider` arayüzüne** bağlanır
  (kayıt bildirimi, mezuniyet bildirimi gibi dar bir sözleşme).
- Şimdilik bir **`MockYoksisProvider`** bu arayüzü karşılar: gerçek YÖKSİS'e
  bağlanmadan bildirim gönderimini taklit eder ve izlenebilir kılar.
- Bağımlılık bir **`YOKSIS_PROVIDER` enjeksiyon token'ı** üzerinden verilir.
  Gerçek web servisi geldiğinde token'ın arkasındaki implementasyon değişir;
  **çağıran kod değişmez** (ADR-0007/0008 sonradan-tak deseni).

### Karar 4 — Rapor motoru: HAZIR raporlar + aggregation; AD-HOC SQL YOK; yetki + tenant kısıtı (§M9)

Rapor motoru bir güvenlik yüzeyi olarak tasarlanır.

- **Yalnızca hazır (tanımlı) raporlar.** Sistem, önceden yazılmış raporlar ve
  **aggregation** (sayım/toplam/gruplama) sunar. **Ad-hoc / serbest SQL kesinlikle
  yoktur** (§M9): dışarıdan gelen ham sorgu çalıştırılmaz. Rapor parametreleri
  (dönem, program vb.) yalnızca hazır sorguların **parametreleridir**, sorgunun
  kendisini oluşturmaz.
- **Yetki:** Raporlara yalnızca **yönetim/ÖİDB rolleri** (ör. `oidb`,
  `rektorluk`) erişir; her rapor ucu `requireRole` ile korunur. Öğrenci/öğretim
  elemanı rapor motoruna erişemez.
- **Tenant kısıtı:** Tüm rapor sorguları **tenant'a kısıtlıdır** — hem RLS hem de
  uygulama katmanı `withTenant` sarmalayıcısıyla (ADR-0003). Bir tenant başka
  tenant'ın verisini hiçbir raporda göremez; aggregation dahil her satır
  tenant-izoledir.
- **Yönetim dashboard'u:** Tek uçta özet gösterge sunar — **öğrenci sayısı**,
  **aktif / mezun** dağılımı, **kayıt** özeti ve **tahsilat** özeti (mali
  toplamlar, bkz. ADR-0008). Bunun yanında programa göre öğrenci dağılımı gibi
  ayrık hazır raporlar bulunur.

## Sonuçlar

### Artılar

- **Bildirim güvenilir ve çok kanallı:** her bildirim önce DB'ye yazılır (dış
  gönderim çökse bile kaybolmaz), tercihe göre etkin dış kanallara gider;
  olay-tetiklemeli olduğu için iş kodundan ayrışıktır.
- **Talep izlenebilir ve denetlenebilir:** tanımlı tip + durum makinesi + yetki +
  audit sayesinde her dilekçe kim/ne zaman/neden ile takip edilir; serbest
  sohbetin kaosu yoktur.
- **Dış servislere hazır ama bağımlı değil:** YÖKSİS ve dış bildirim kanalları
  mock ile bugün uçtan uca çalışır; gerçek sağlayıcı token arkasına takılır,
  çağıran kod değişmez.
- **Rapor güvenli:** ad-hoc SQL yok, yalnızca yetkili rol, her sorgu tenant-izole
  — rapor motoru bir sızıntı/enjeksiyon yüzeyi olmaktan çıkar.

### Eksiler / Ödünler

- **Dış kanallar/YÖKSİS henüz gerçek değil:** email/SMS/push ve YÖKSİS mock ile
  çalışır; gerçek sağlayıcı gelince davranış yeniden doğrulanmalıdır.
- **Hazır rapor kümesi sınırlıdır:** ad-hoc SQL yasak olduğundan, yeni bir rapor
  ihtiyacı doğduğunda **kod eklenmesi** gerekir; bu bilinçli bir güvenlik ödünüdür
  (esneklik ↔ güvenlik).
- **Bildirim tercihleri disiplin ister:** yeni bildirim türleri eklenirken
  `notification_prefs` ve domain-event tetikleme sözleşmesine uymak gerekir.

### Notlar

- **Anket** ve **mezun bilgi sistemi** bu fazın kapsamı dışındadır; **sonraki
  iterasyona** bırakılmıştır.
- Dış bildirim kanalları (email/SMS/push) ve YÖKSİS bu fazda **mock**'tur; faz,
  mock sağlayıcılarla **uçtan uca** çalışan iletişim + raporlama hattı teslim eder.

## İlgili

- ADR-0003 — RLS ile tenant izolasyonu (tüm rapor ve talep sorguları tenant-izole;
  `withTenant`).
- ADR-0005 — Öğrenci durum makinesi (talep durum makinesi + yetki + audit deseninin
  kaynağı).
- ADR-0007 — `SigningProvider` sonradan-tak deseni (`NotificationChannel` /
  `YoksisProvider`'ın kardeşi).
- ADR-0008 — Mali işler (dashboard'daki tahsilat özetinin kaynağı; `Provider`
  sonradan-tak deseni).
- `FAZ-6-DEMO.md` — Talep akışı, dashboard, programa göre öğrenci ve YÖKSİS export'un
  uçtan uca demosu.
