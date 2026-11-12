# ADR-0006: Parametre Versiyonlama — DB'de Versiyonlu, Yürürlük-Tarihli, Tenant/Program Bazlı

## Durum

Kabul edildi — 2026-07-16

## Bağlam

Akademik mevzuat değerleri (harf notu ölçeği, GNO/AGNO politikası, akademik kural
seti: AKTS limitleri, devamsızlık eşikleri, mezuniyet GNO'su vb.) üniversiteden
üniversiteye, hatta aynı üniversite içinde programdan programa değişir. Dahası
**zamanla da değişir**: bir üniversite yönetmeliğini güncelleyebilir.

Master prompt §2 bu konuda nettir: **"hiçbir mevzuat değeri hard-code edilmez;
tenant+program+yönetmelik-yılı bazında parametre."** (Bkz. `ASSUMPTIONS.md` — tüm
sayısal değerlerin parametre olduğu envanteri.)

İki kritik zorlanma noktası var:

1. **Çok boyutluluk.** Aynı parametrenin (ör. AA'nın alt sınırı) değeri
   tenant'a ve programa göre farklı olabilir.
2. **Zaman.** Yönetmelik 2026'da değişirse, **2024 kohortu eski kurallarla**,
   yeni kayıtlar yeni kurallarla okunmalı. Geçmişe dönük hesaplar
   (transkript, GNO) **değişmemeli** — yani bir öğrencinin/dönemin geçmişi,
   o an yürürlükte olan parametreyle sabit kalmalı.

Naif yaklaşım (tek satır, üzerine yazılan güncel değer) her ikisini de bozar:
program ayrımı yoktur ve eski değer üzerine yazıldığında geçmiş hesap değişir.

## Karar

Mevzuat parametreleri DB'de **versiyonlu + yürürlük-tarihli + tenant/program
bazlı** tutulur. Üç parametre ailesi için üç tablo:

- `grade_scales` — harf notu ölçeği (harf → alt eşik + katsayı).
- `gpa_policies` — GNO/AGNO politikası (yuvarlama, basamak, geçerli-not seçimi).
- `academic_rule_sets` — akademik kural seti (AKTS alt/üst limiti, devamsızlık
  eşikleri, mezuniyet GNO'su vb.).

### Boyutlar

Her satır şu boyutları taşır:

- `tenant_id` — kiracı (üniversite). RLS ile izole (bkz. ADR-0003).
- `program_id` — program (fakülte/bölüm). **`NULL` = tenant geneli** (o
  üniversitedeki tüm programlar için varsayılan).
- `effective_from` — yürürlük başlangıcı, **dahil**.
- `effective_to` — yürürlük bitişi, **hariç** (`NULL` = süresiz/açık uçlu).

Yani yürürlük aralığı yarı-açık `[effective_from, effective_to)` biçimindedir:
başlangıç dahil, bitiş hariç. Bu, komşu sürümlerin sınırda çakışmamasını (ör.
bir sürümün `effective_to`'su, ardılının `effective_from`'una eşit) garanti eder.

### Çözümleme (`selectEffective`)

Belirli bir `(tenant, program, tarih)` için yürürlükteki parametre şöyle seçilir:

1. **Tarih filtresi:** `effective_from <= tarih AND (effective_to IS NULL OR
   effective_to > tarih)`.
2. **Kapsam önceliği:** aynı tarihte hem program-özel (`program_id = <program>`)
   hem tenant-geneli (`program_id IS NULL`) satır varsa, **program-özel
   kazanır** (daha özgül olan öncelikli).
3. **Sürüm önceliği:** aynı kapsamda birden çok yürürlükteki satır varsa
   (aralıklar disiplinli tutulsa da savunmacı davranırız), **en yeni
   `effective_from`** kazanır.

Kısaca öncelik: **program-özel > tenant-geneli**, eşitlikte **en yeni
`effective_from`**.

### Geçmişe dönük tutarlılık

Hesaplama, "bugünün parametresi" ile değil, **ilgili bağlamın tarihine** ait
yürürlükteki parametre ile yapılır (ör. bir dönemin GNO'su, o dönemin/kohortun
tabi olduğu yürürlük tarihine göre çözümlenir). Yeni yönetmelik yürürlüğe
girdiğinde eski satır **silinmez/üzerine yazılmaz**; yalnızca `effective_to`'su
kapatılır ve yeni bir satır eklenir. Böylece **eski müfredat/öğrenci eski
kurallarla okunur** — geçmiş transkript ve GNO değişmez.

## Sonuçlar

### Artılar

- **Hard-code yok:** tüm mevzuat değerleri veri olarak yaşar; §2 karşılanır.
- **Çok kiracı + çok program:** aynı kod tabanı, tenant/program bazında farklı
  değerlerle çalışır. Tenant-geneli varsayılan + program-özel istisna deseni
  tekrarı azaltır.
- **Zaman-tutarlılığı:** yürürlük tarihleriyle geçmiş hesaplar sabit kalır;
  yönetmelik değişimi eski kohortları bozmaz.
- **Denetlenebilirlik:** her parametre değişimi yeni bir sürüm satırıdır; tarihçe
  DB'de görünür.

### Eksiler / Ödünler

- **Çözümleme her okumada gerekir:** parametre "sadece oku" değil, `(tenant,
  program, tarih)` ile **çözümlenerek** okunur; bu mantık tek bir
  `selectEffective` katmanında toplanır ki dağılmasın.
- **Aralık disiplini:** `effective_from`/`effective_to` aralıklarının çakışmaması
  yazım tarafında dikkat ister; savunmacı "en yeni kazanır" kuralı ile emniyete
  alınır, ama seed/yazım disiplini gerekir.
- **Seed sorumluluğu:** başlangıç değerleri (bkz. `ASSUMPTIONS.md`) **VARSAYIMDIR**
  ve öğrenci işlerine doğrulatılana kadar üretim gerçeği değildir.

## İlgili

- ADR-0003 — RLS ile tenant izolasyonu (`tenant_id` her parametre satırında).
- `ASSUMPTIONS.md` — parametre değerlerinin varsayım envanteri ve doğrulama
  süreci.
- ADR-0005 — Öğrenci durum makinesi; izinli-geçiş kümesi ileride bu modelle
  parametrikleştirilebilir.
