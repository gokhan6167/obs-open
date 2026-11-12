# ADR-0011: Veri Göçü (M11) — Mapping Tabanlı ETL, Staging + Karantina, Mutabakat ve Prova Göçü

## Durum

Kabul edildi — 2026-07-18

## Bağlam

Faz 8 ile OBS'ye **Veri Göçü modülü (M11)** ekleniyor. Bu, diğer modüllerden
**ayrı ve riskli** bir iş paketidir: pilot kiracı **Demo** halen eski bir
**OİS** (Öğrenci İşleri Sistemi) kullanmaktadır ve canlıya geçişte **tüm tarihsel
veri** (öğrenci, ders, not, transkript) yeni sisteme taşınacaktır. Bir öğrencinin
GNO'su, kredisi veya harf notu göçte kayarsa mezuniyet/transkript güveni çöker;
bu yüzden göç, "veriyi taşıdık" ile değil **"taşınan verinin doğruluğu
kanıtlandı"** ile biter.

Bu paket dört zorlanma noktası doğuruyor:

1. **Kaynak OİS formatı bilinmiyor.** Kolon adları, kodlamalar ve dönüşümler
   kurumun kendi eski sistemine özgüdür ve göç kodu yazılırken kesin olarak
   bilinmez. Eşlemeler koda gömülürse her yeni kaynak için kod değişmesi gerekir;
   göç kırılgan ve tek seferlik olur. (Bu risk Faz 1'de öngörülmüş, `mapping.ts`
   **tohumlanmıştı**; Faz 8'de olgunlaşır.)
2. **Ham veri kirlidir.** Eksik TC, tutarsız kayıt, yetim (ilişkisiz) satır
   kaçınılmazdır. Kirli satır sessizce atlanırsa veri kaybı; hata verip durursa
   göç ilerlemez. Kirli veriyi **izole edip** insana bırakan bir yol gerekir.
3. **Doğruluk kanıtlanmalıdır.** Veriyi taşımak yetmez; taşınan her öğrencinin
   yeni sistemdeki transkriptinin **eski sistemle birebir aynı** olduğu otomatik
   olarak gösterilmelidir. Aksi hâlde göç bir "umut" olur.
4. **Göç geri alınamaz risktir.** Canlı göç, kesinti penceresi ister ve yanlış
   giderse geri dönüş zordur. Tek seferde canlıya geçmek yerine **prova** ile
   önce güven, süre ve geri dönüş kanıtlanmalıdır.

## Karar

### Karar 1 — Mapping tabanlı ETL: kolon eşlemeleri KODDA DEĞİL config'te (`applyMapping`)

Kaynak OİS formatı bilinmediği için kolon eşlemeleri **kodda değil,
konfigürasyonda** (JSON/YAML) tanımlanır. Bir kaynak satırı, saf ve deterministik
**`applyMapping(config, row)`** (`migration/mapping.ts`) fonksiyonuyla hedef kayda
dönüştürülür.

- **`MappingConfig`:** hedef varlık (`target`, ör. `student`) ve alan listesi
  (`fields`). Her alanın (`FieldMapping`) hedef adı (`target`), kaynak kolonu
  (`source`) veya sabit değeri (`const`) vardır.
- **`transforms` (sıralı):** her alana sırayla uygulanan dönüşümler:
  `trim` | `upper` | `lower` | `int` | `nullIfEmpty`. (Ör. TC kolonu
  `trim` + `int`; ad kolonu `trim` + `upper`.)
- **`required` (zorunlu alan):** işaretli alan eksik/boşsa, satır **başarısız**
  sayılır ve hata sebebiyle **karantinaya** düşer (Karar 2). Zorunluluk da koda
  değil config'e aittir.
- **Saflık:** `applyMapping` DB/dosya bağımlılığı taşımaz; girdi→çıktı tümüyle
  birim testle kilitlenir. Yükleme, staging ve mutabakat bunun üstüne inşa edilir.

Sonuç: yeni bir kaynak/kolon geldiğinde **kod değişmez, config değişir**. Eşleme
kararları izlenebilir ve gözden geçirilebilir bir artefakt olur.

### Karar 2 — Staging + karantina: temiz satır `staging_rows`, kirli satır `quarantine_rows`

Göç iki hatta ayrılır: eşlemesi geçen satır **staging**'e, geçmeyen satır
**karantina**ya. Her koşum bir **`migration_runs`** kaydıyla izlenir.

- **`migration_runs`:** her göç koşumu `mode` = `dry_run` | `live` ile açılır
  (Karar 4). Durumu (`running`/`completed`/`failed`) ve istatistiği tutulur.
- **`staging_rows`:** eşlemesi başarılı ham→eşlenmiş satırlar. Kaynak tablo adı
  (`source_table`) ve üretilen hedef kayıt (`record`) burada durur. Canlı yükleme
  bu tablodan beslenir.
- **`quarantine_rows`:** eksik TC / tutarsız / yetim kayıt gibi eşlemesi geçmeyen
  satırlar; ham hâli (`raw`) ve **sebebi** (`reason`, ör. "zorunlu alan eksik:
  tc") ile saklanır. Karantina satırını **ÖİDB elle çözer** (`resolved`
  bayrağıyla). Çözülmemiş karantina, canlıya geçişi engeller (Karar 3).
- **İzolasyon:** tüm göç tabloları RLS ile kiracı-izoledir (ADR-0003); bir
  kiracının göç verisi başka kiracıya sızmaz.

### Karar 3 — MUTABAKAT (kritik): OİS transkripti ↔ yeni sistem transkripti otomatik karşılaştırma

Göçün asıl güvencesi budur: göç sonrası **her öğrenci için** OİS transkripti ile
yeni sistem transkripti **otomatik karşılaştırılır**. Karşılaştırma saf,
deterministik **`reconcileTranscripts`** (`migration/reconcile.ts`) ile yapılır.

- **Karşılaştırma kuralları:**
  - **GNO:** **tolerans dahilinde** eşleşmelidir (`gpaTolerance`, ör. `0.01`
    yuvarlama farkı kabul). Sapma toleransı aşarsa istisna.
  - **Toplam kredi**, **ders sayısı** ve **harf notları**: **tam eşleşme**
    beklenir.
  - **Eksik/fazla ders:** OİS'te olup yeni sistemde olmayan ders `missing:<ders>`,
    yeni sistemde olup OİS'te olmayan ders `extra:<ders>` istisnası üretir.
- **`reconciliation_exceptions`:** uyuşmayan her alan (öğrenci no, alan, OİS
  değeri, yeni değer) bir istisna kaydına düşer. Boş liste = **tam mutabakat**.
- **`goLiveReadiness` — canlıya geçiş kapısı:** bir koşumda **çözülmemiş
  mutabakat istisnası VEYA çözülmemiş karantina** varsa canlıya geçiş
  **ENGELLENİR**. Kapı `canGoLive = (unresolvedExceptions === 0 &&
  unresolvedQuarantine === 0)` olarak açıktır. Kural nettir:
  **"istisna raporu sıfırlanmadan canlıya geçilmez."**

### Karar 4 — Prova (`dry_run`) göçü + geri dönüş

Canlı göç tek seferde denenmez. Aynı koşum altyapısı `migration_runs.mode` ile
**prova** (`dry_run`) ve **canlı** (`live`) ayrımını taşır; canlıdan önce prova
yapılır.

- **En az 3 tam prova:** göç uçtan uca en az üç kez prova (`dry_run`) koşulur;
  her koşumda mutabakat sıfırlanana kadar mapping/config ve karantina çözümü
  iyileştirilir.
- **Süre ölçümü:** her provanın süresi ölçülür ki canlı **kesinti penceresi**
  gerçekçi planlansın.
- **Geri dönüş planı:** provalar, canlı göç yanlış giderse geri dönülebileceğini
  kanıtlar. Canlı kesme senaryosu şudur (mimari not): kesinti penceresi açılır →
  ana göç + **delta göçü** (pencere içinde değişen kayıtlar) uygulanır →
  eski OİS **salt-okunur arşive** alınır. Bu senaryonun **koşum altyapısı**
  bugün `migration_runs.mode` ile mevcuttur; delta/arşiv adımlarının somut
  bağlanışı kurum verisiyle netleşir (§Notlar).

## Sonuçlar

### Artılar

- **Kaynağa dayanıklı göç:** eşleme config'te olduğu için yeni kolon/kaynak
  geldiğinde kod değişmez; göç tek seferlik değil, tekrarlanabilir ve gözden
  geçirilebilir bir artefakttır.
- **Veri kaybı yok, sessiz hata yok:** kirli satır atlanmaz da göçü kilitlemez;
  sebebiyle karantinaya düşer ve ÖİDB tarafından elle çözülür.
- **Doğruluk kanıtlanır, umut edilmez:** mutabakat her öğrencinin transkriptini
  OİS ile birebir karşılaştırır; `goLiveReadiness` kapısı istisna/karantina
  sıfırlanmadan canlıya geçişi yapısal olarak engeller.
- **Risk provayla düşürülür:** `dry_run`/`live` ayrımı sayesinde göç canlıdan
  önce defalarca prova edilir; süre ve geri dönüş önceden bilinir.

### Eksiler / Ödünler

- **Config disiplini ister:** mapping'in doğruluğu config'in doğruluğuna bağlıdır;
  yanlış eşleme sessiz hata değil ama **yanlış-eşleşmiş** kayıt üretebilir —
  mutabakat bunu yakalar, yine de config gözden geçirilmelidir.
- **Karantina insan emeği ister:** kirli veri otomatik onarılmaz; ÖİDB'nin elle
  çözmesi gerekir. Kirli veri çoksa bu, göç takviminin darboğazıdır.
- **Mutabakat girdiye bağımlı:** karşılaştırma, OİS transkript özetinin doğru
  üretilmesine dayanır; OİS export'u eksik/yanlış özet verirse mutabakat da onu
  yansıtır. Gerçek OİS export bağlantısı kurum verisiyle kurulur (§Notlar).

### Notlar

- **Paralel çalıştırma (ilk dönem):** canlıya geçişten sonra ilk dönem, **kritik
  GNO/mezuniyet** kararları **iki sistemde** (OİS + OBS) doğrulanır; tam güven
  oturana kadar eski sistem doğrulama referansı olarak paralel tutulur.
- **Gerçek OİS export bağlantısı** (kolon adları, kodlamalar, delta yakalama)
  **kurum verisiyle** kurulur; bu ADR eşleme/staging/mutabakat/prova
  **iskeletini** ve kurallarını sabitler, somut kaynak bağlanışını değil.
- Prova sayısı (≥3), GNO toleransı ve zorunlu alanlar bu belgede **parametre**
  olarak geçer; koda gömülü sabit değildir.

## İlgili

- ADR-0003 — RLS ile tenant izolasyonu (tüm göç tabloları kiracı-izole).
- ADR-0005 — Öğrenci durum makinesi (göçün hedef akademik çekirdeği).
- ADR-0006 — Versiyonlu parametre (eşleme, tolerans ve zorunlulukların koda
  gömülmemesi çizgisi).
- `FAZ-8-DEMO.md` — Prova başlatma, mapping ile yükleme, mutabakat ve canlıya
  geçiş hazırlık kontrolünün uçtan uca demosu.
