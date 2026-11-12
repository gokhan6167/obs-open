# Akademik Mevzuat Varsayımları

> **KRİTİK UYARI — HİÇBİR DEĞER KODA GÖMÜLÜ DEĞİLDİR.**
>
> Bu dosyadaki tüm sayısal değerler ve kurallar **VARSAYIMDIR** ve yalnızca
> geliştirmeye başlamak için birer örnektir. **Hiçbiri gerçek mevzuat kaynağı
> değildir** ve üniversite Öğrenci İşleri Daire Başkanlığı'na (ilk pilot: Demo)
> **doğrulatılmadan** üretimde kullanılamaz.
>
> Mimari kural: harf notu eşikleri, GNO yuvarlama, devamsızlık limitleri, AKTS
> limitleri, tekrar politikası, onur eşikleri vb. **tamamı DB parametresidir** ve
> şu üç boyutta değişkendir:
>
> - **tenant** (üniversite),
> - **program** (fakülte/bölüm — tıp ile MYO farklı olabilir),
> - **yönetmelik yılı** (öğrencinin tabi olduğu yönetmelik sürümü — geriye dönük
>   değişmemesi için kohort bazında sabitlenir).
>
> Yani "AA'nın alt sınırı 90'dır" gibi bir cümle **koda değil, parametre
> tablosuna** aittir. Aşağıdaki tablolar bu parametrelerin envanteridir.

## Sütun açıklamaları

- **Konu** — parametrik kuralın adı.
- **Varsayılan değer (örnek)** — geliştirme için başlangıç örneği. **VARSAYIM.**
- **Kaynak / durum** — `VARSAYIM-doğrulanacak` (Öğrenci İşleri'ne teyit ettirilecek).
- **Parametrik mi** — DB'de tenant+program+yönetmelik-yılı bazında ayarlanabilir mi.

---

## 1. Harf notu aralıkları (ham puan → harf)

Her harf için alt eşik. Bağıl (çan) sistemde bu eşikler istatistiksel olarak
kayabilir (bkz. Bölüm 6).

| Konu | Varsayılan değer (örnek) | Kaynak / durum | Parametrik mi |
|---|---|---|---|
| AA alt sınırı | 90 | VARSAYIM-doğrulanacak | Evet |
| BA alt sınırı | 85 | VARSAYIM-doğrulanacak | Evet |
| BB alt sınırı | 75 | VARSAYIM-doğrulanacak | Evet |
| CB alt sınırı | 70 | VARSAYIM-doğrulanacak | Evet |
| CC alt sınırı | 60 | VARSAYIM-doğrulanacak | Evet |
| DC alt sınırı | 55 | VARSAYIM-doğrulanacak | Evet |
| DD alt sınırı | 50 | VARSAYIM-doğrulanacak | Evet |
| FD alt sınırı | 40 | VARSAYIM-doğrulanacak | Evet |
| FF üst sınırı | 39 (ve altı) | VARSAYIM-doğrulanacak | Evet |
| Harf → katsayı eşlemesi (AA=4.00, BA=3.50, ...) | AA 4.00 / BA 3.50 / BB 3.00 / CB 2.50 / CC 2.00 / DC 1.50 / DD 1.00 / FD 0.50 / FF 0.00 | VARSAYIM-doğrulanacak | Evet |
| Geçme koşulu (hangi harften itibaren "geçer") | CC ve üzeri koşulsuz geçer; DC/DD şartlı (GNO'ya bağlı) | VARSAYIM-doğrulanacak | Evet |
| Notsuz harfler (G/K/M/E/DZ vb. muaf/devamsız/eksik) | G=Geçer, K=Kalır, M=Muaf, DZ=Devamsız, E=Eksik | VARSAYIM-doğrulanacak | Evet |

## 2. GNO / AGNO hesabı ve yuvarlama

| Konu | Varsayılan değer (örnek) | Kaynak / durum | Parametrik mi |
|---|---|---|---|
| GNO ondalık basamak sayısı | 2 basamak | VARSAYIM-doğrulanacak | Evet |
| Yuvarlama kuralı | En yakına yuvarlama (0.005 yukarı) | VARSAYIM-doğrulanacak | Evet |
| GNO formülü | Σ(ders katsayısı × ders AKTS) / Σ(AKTS) | VARSAYIM-doğrulanacak | Evet |
| Ağırlık birimi (AKTS mi yerel kredi mi) | AKTS | VARSAYIM-doğrulanacak | Evet |
| Tekrar edilen dersin GNO'ya etkisi | Bkz. Bölüm 5 | VARSAYIM-doğrulanacak | Evet |

## 3. Devamsızlık sınırları

| Konu | Varsayılan değer (örnek) | Kaynak / durum | Parametrik mi |
|---|---|---|---|
| Teorik ders devam zorunluluğu | %70 (en fazla %30 devamsızlık) | VARSAYIM-doğrulanacak | Evet |
| Uygulama/laboratuvar devam zorunluluğu | %80 (en fazla %20 devamsızlık) | VARSAYIM-doğrulanacak | Evet |
| Devamsızlıktan kalma sonucu (harf) | DZ (Devamsız — sınava giremez) | VARSAYIM-doğrulanacak | Evet |
| Sağlık raporlu/mazeretli devamsızlık istisnası | Var — kurul kararına bağlı | VARSAYIM-doğrulanacak | Evet |

> Not (sağlık ağırlıklı üniversite): tıp/diş/klinik uygulamalarda devam kuralları
> teorik derslerden daha katı olabilir; program bazında ayrışması muhtemel.

## 4. AKTS alt-üst limitleri ve GNO'ya göre üst limit artışı

| Konu | Varsayılan değer (örnek) | Kaynak / durum | Parametrik mi |
|---|---|---|---|
| Dönemlik normal AKTS | 30 | VARSAYIM-doğrulanacak | Evet |
| Dönemlik AKTS alt limiti | 20 | VARSAYIM-doğrulanacak | Evet |
| Dönemlik AKTS üst limiti (standart) | 30 | VARSAYIM-doğrulanacak | Evet |
| Yüksek GNO ile üst limit artışı eşiği | GNO ≥ 3.00 | VARSAYIM-doğrulanacak | Evet |
| Yüksek GNO ile artırılmış üst limit | 40 AKTS | VARSAYIM-doğrulanacak | Evet |
| Son sınıf/mezuniyet aşamasında ek üst limit | +1 ders / +X AKTS | VARSAYIM-doğrulanacak | Evet |
| Alt limit muafiyeti (mezuniyet aşaması) | Var | VARSAYIM-doğrulanacak | Evet |

## 5. Tekrar ders politikası

| Konu | Varsayılan değer (örnek) | Kaynak / durum | Parametrik mi |
|---|---|---|---|
| Geçerli not seçimi (tekrar edilen ders) | **En son alınan not** geçerli | VARSAYIM-doğrulanacak | Evet |
| Alternatif politika | En yüksek not geçerli | VARSAYIM-doğrulanacak | Evet |
| Not yükseltmek için geçilen dersin tekrarı | İzinli (koşullu) | VARSAYIM-doğrulanacak | Evet |
| Tekrarda GNO/AGNO'ya sayılan not | Geçerli sayılan (son/en yüksek) not | VARSAYIM-doğrulanacak | Evet |
| Kaldığı dersi tekrar zorunluluğu (FF/FD/DZ) | Zorunlu | VARSAYIM-doğrulanacak | Evet |

## 6. Bağıl (çan) değerlendirme

| Konu | Varsayılan değer (örnek) | Kaynak / durum | Parametrik mi |
|---|---|---|---|
| Bağıl değerlendirme kullanılıyor mu | Program bazında değişir (bazı programlar mutlak) | VARSAYIM-doğrulanacak | Evet |
| Bağıl sistem parametreleri | Sınıf ortalaması + standart sapma temelli | VARSAYIM-doğrulanacak | Evet |
| Bağıl değerlendirme alt taban puanı (baraj) | 30 (bu puanın altı doğrudan FF) | VARSAYIM-doğrulanacak | Evet |
| Bağıla giren asgari öğrenci sayısı | 10 (altında mutlak sisteme geçiş) | VARSAYIM-doğrulanacak | Evet |

## 7. Azami öğrenim süresi

| Konu | Varsayılan değer (örnek) | Kaynak / durum | Parametrik mi |
|---|---|---|---|
| Lisans (4 yıllık) azami süre | 7 yıl | VARSAYIM-doğrulanacak | Evet |
| Lisans (5-6 yıllık, ör. tıp) azami süre | Program bazında (ör. tıp için farklı) | VARSAYIM-doğrulanacak | Evet |
| Önlisans azami süre | 4 yıl | VARSAYIM-doğrulanacak | Evet |
| Hazırlık sınıfı süreye dahil mi | Hariç (bazı hallerde) | VARSAYIM-doğrulanacak | Evet |
| Süre dolduğunda sonuç | İlişik kesme / ek sınav hakkı | VARSAYIM-doğrulanacak | Evet |

## 8. Onur / Yüksek onur eşikleri

| Konu | Varsayılan değer (örnek) | Kaynak / durum | Parametrik mi |
|---|---|---|---|
| Onur öğrencisi GNO alt sınırı | 3.00 | VARSAYIM-doğrulanacak | Evet |
| Yüksek onur öğrencisi GNO alt sınırı | 3.50 | VARSAYIM-doğrulanacak | Evet |
| Onur/yüksek onur için disiplin cezasız olma şartı | Evet | VARSAYIM-doğrulanacak | Evet |
| Onur değerlendirmesi kapsamı (dönem mi genel mi) | Dönem bazlı ve/veya mezuniyette genel | VARSAYIM-doğrulanacak | Evet |
| FF/DZ notu onuru iptal eder mi | Eder | VARSAYIM-doğrulanacak | Evet |

## 9. Staj / bitirme koşulları

| Konu | Varsayılan değer (örnek) | Kaynak / durum | Parametrik mi |
|---|---|---|---|
| Zorunlu staj gün/iş günü sayısı | Program bazında (ör. 20/40 iş günü) | VARSAYIM-doğrulanacak | Evet |
| Staj AKTS'ye dahil mi | Evet (program bazında) | VARSAYIM-doğrulanacak | Evet |
| Bitirme projesi/tezi zorunluluğu | Program bazında | VARSAYIM-doğrulanacak | Evet |
| Mezuniyet için asgari GNO | 2.00 | VARSAYIM-doğrulanacak | Evet |
| Mezuniyet için tamamlanması gereken toplam AKTS | 240 (4 yıllık lisans) | VARSAYIM-doğrulanacak | Evet |
| Klinik/intörnlük koşulları (sağlık programları) | Program bazında (tıp/diş için ayrı) | VARSAYIM-doğrulanacak | Evet |

---

## Doğrulama süreci

1. Bu dosya, Demo Öğrenci İşleri Daire Başkanlığı ile birlikte satır satır gözden
   geçirilir.
2. Her satırın `Kaynak / durum` alanı, teyit edildiğinde ilgili **yönetmelik madde
   referansı** ve **yönetmelik yılı** ile güncellenir; durum `DOĞRULANDI` olur.
3. Doğrulanan değerler koda değil, **parametre seed/konfigürasyon** verisine
   yazılır (tenant + program + yönetmelik-yılı).
4. Yönetmelik değiştiğinde, yeni bir yönetmelik-yılı sürümü oluşturulur; **eski
   kohortlar eski parametrelerle** hesaplanmaya devam eder (geriye dönük tutarlılık).

---

## Faz 1 — Parametre altyapısına bağlanan varsayımlar

Faz 1 ile birlikte, yukarıdaki envanterin bir kısmı artık **soyut bir liste
değil, gerçek DB tablolarına** bağlandı. Değerler hâlâ **VARSAYIMDIR**; yeni olan
tek şey, bu varsayımların nerede saklandığının netleşmesi. Parametrelerin
versiyonlu/yürürlük-tarihli/tenant-program bazlı tutulma modeli için bkz.
**ADR-0006**.

### Parametre aileleri → tablolar

| Parametre ailesi | Tablo | İçerik |
|---|---|---|
| Harf notu ölçeği (harf → alt eşik + katsayı) | `grade_scales` | Bölüm 1'deki eşik ve katsayılar |
| GNO / AGNO politikası | `gpa_policies` | Bölüm 2'deki yuvarlama, basamak, geçerli-not seçimi |
| Akademik kural seti | `academic_rule_sets` | AKTS alt/üst limitleri, devamsızlık eşikleri, mezuniyet GNO'su |

Bu tabloların her satırı `tenant_id`, `program_id` (`NULL` = tenant geneli),
`effective_from` (dahil) ve `effective_to` (hariç) taşır; çözümleme
**program-özel > tenant-geneli**, eşitlikte **en yeni `effective_from`**
önceliğiyle yapılır (bkz. ADR-0006, `selectEffective`).

### Demo seed'inin koyduğu ÖRNEK/VARSAYIM değerler

> **Uyarı:** Aşağıdakiler seed'in geliştirme için koyduğu **VARSAYIM**
> değerlerdir; hiçbiri doğrulanmış Demo mevzuatı değildir. Öğrenci İşleri Daire
> Başkanlığı'na **doğrulatılacaktır** (bkz. yukarıdaki "Doğrulama süreci").

- **`grade_scales` (harf notu ölçeği — Demo örnek):**
  `AA = alt sınır 90 / katsayı 4.00`, `BA = 85 / 3.50`, `BB = 75 / 3.00`,
  `CB = 70 / 2.50`, `CC = 60 / 2.00`, `DC = 55 / 1.50`, `DD = 50 / 1.00`,
  `FD = 40 / 0.50`, `FF = 0 (ve altı) / 0.00`. *(VARSAYIM)*
- **`gpa_policies` (GNO politikası):** geçerli-not seçimi = **son alınan not**;
  yuvarlama = **2 hane, half-up** (0.005 yukarı). *(VARSAYIM)*
- **`academic_rule_sets` (akademik kural seti):**
  - Mezuniyet için **asgari GNO = 2.00**. *(VARSAYIM)*
  - Dönemlik **AKTS: min 30 / max 45**. *(VARSAYIM)*
  - Devamsızlık üst sınırı: **teorik ders %30**, **uygulama/lab %20**. *(VARSAYIM)*

> Not: Bölüm 3-4'teki envanter değerleri (ör. teorik devamsızlık, dönemlik AKTS
> aralığı) ile seed değerleri arasında küçük farklar olabilir; envanter
> "mimari olarak neyin parametre olduğunu", seed ise "Demo için başlangıç
> tahmini değeri" yansıtır. Her ikisi de doğrulanana kadar VARSAYIM'dır.
