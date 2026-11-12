# ADR-0005: Öğrenci Durum Makinesi — Saf Durum Makinesi + Yetki + Audit

## Durum

Kabul edildi — 2026-07-16

## Bağlam

Bir öğrencinin kaydı, yaşam döngüsü boyunca birden çok **durumdan** geçer:
aktif öğrencilik, kayıt dondurma, pasife alınma, ilişik kesilmesi, mezuniyet,
azami süre dolması, aftan yararlanma vb. Bu durum, öğrencinin sisteme
erişiminden ders kaydına, harç/burs işlemlerinden mezuniyet hesabına kadar pek
çok kuralı tetikler; dolayısıyla **kritik** bir alandır.

Naif yaklaşım, `students` tablosunda serbestçe güncellenebilen bir `status`
sütunu tutmaktır. Ancak bu yaklaşım tehlikelidir:

- Bir kullanıcı (veya hatalı bir servis) öğrenciyi **doğrudan** herhangi bir
  duruma çekebilir — ör. `iliskigi_kesildi` durumundaki bir öğrenciyi
  hiçbir kurumsal işlem olmadan `mezun` yapabilir.
- Geçişin **kim tarafından, hangi gerekçeyle** yapıldığı kayıt altına alınmaz.
- Hangi geçişlerin **mevzuaten mümkün** olduğu koda dağılır ve tutarsızlaşır.

Master prompt §M1 bu konuda nettir: **"durum geçişleri sadece tanımlı kurallarla
ve yetkiyle olur; serbest update yok."**

Değerlendirilen durum kümesi (Demo pilotu için başlangıç varsayımı):

- `aktif`
- `kayit_dondurma`
- `pasif`
- `iliskigi_kesildi`
- `mezun`
- `azami_sure_doldu`
- `af_ogrencisi`

## Karar

Öğrenci durumu, `academic-core` içinde **saf (side-effect'siz) bir durum
makinesi** ile yönetilir. Kararın üç sacayağı vardır:

### 1. Serbest `status` update yasak — yalnızca tanımlı geçişler

Öğrencinin durumu **doğrudan** yazılmaz. Durum değişimi yalnızca bir **geçiş
(transition)** çağrısıyla olur: `(mevcut_durum, hedef_durum)` ikilisi, tanımlı
**izinli-geçiş tablosunda** yoksa geçiş reddedilir (uygulama katmanında `409`
tipinde bir çakışma/geçersiz-geçiş hatası). Böylece "her yerden her yere"
atlama yapısal olarak imkânsızdır.

Durum makinesi **saftır**: girdi olarak mevcut durumu ve istenen geçişi alır,
çıktı olarak ya yeni durumu ya da "izinsiz geçiş" sonucunu üretir. Yan etkisi
(DB yazımı, log, bildirim) yoktur; bu, birim testini önemsizleştirir ve mantığı
altyapıdan ayırır.

### 2. Her geçiş bir `action` etiketi taşır → authorize + audit

Her izinli geçiş, ayrık bir **action etiketi** ile ilişkilendirilir
(ör. `student.freeze`, `student.dismiss`, `student.graduate`). Servis katmanı
bir geçişi uygulamadan önce:

- **authorize:** çağıran kullanıcının/rolün ilgili `action` için yetkili olup
  olmadığını kontrol eder. Yetkisizse geçiş uygulanmaz (`403`).
- **audit:** geçiş uygulandığında, **kim** (kullanıcı), **hangi geçiş**
  (kaynak→hedef, action), **ne zaman** ve **gerekçe** (reason) denetim kaydına
  yazılır.

Yani tek bir yerde: geçiş geçerli mi (durum makinesi) → yetki var mı (authorize)
→ kayıt tut (audit) → durumu yaz. Bu üçlü atlanamaz.

### 3. Saf çekirdek, kabuk yan etkileri

- **Saf çekirdek** (`academic-core`): izinli-geçiş tablosu + geçiş fonksiyonu +
  action etiketleri. DB, HTTP, oturum bilmez.
- **Servis kabuğu**: authorize + audit + kalıcılık (persistence). Çekirdeği
  çağırır, sonucu kalıcılaştırır.

Bu ayrım, ADR-0001'deki modüler-monolit ve çekirdek-katman ayrımıyla tutarlıdır.

### İzinli geçiş kümesi — makul varsayılan

Başlangıç izinli-geçiş tablosu **makul bir varsayılandır** (Demo pilotu için).
Örnek (VARSAYIM — öğrenci işlerine doğrulatılacak):

| Kaynak durum | İzinli hedef durum(lar) |
|---|---|
| `aktif` | `kayit_dondurma`, `pasif`, `iliskigi_kesildi`, `mezun`, `azami_sure_doldu` |
| `kayit_dondurma` | `aktif`, `iliskigi_kesildi` |
| `pasif` | `aktif`, `iliskigi_kesildi` |
| `azami_sure_doldu` | `iliskigi_kesildi`, `af_ogrencisi` |
| `iliskigi_kesildi` | `af_ogrencisi` |
| `af_ogrencisi` | `aktif`, `iliskigi_kesildi` |
| `mezun` | *(terminal — çıkış geçişi yok)* |

> Bu küme koda gömülü **son söz değildir**. Durum kümesi ve izinli geçişler,
> tıpkı diğer mevzuat parametreleri gibi (bkz. ADR-0006) ileride
> **tenant/yönetmelik bazında parametrikleştirilebilir**. Faz 1'de tek, makul
> bir varsayılan tablo yeterlidir; parametrikleştirme, öğrenci işleri
> doğrulaması ve gerçek yönetmelik ihtiyacı ortaya çıktığında yapılır.

## Sonuçlar

### Artılar

- **Bütünlük:** geçersiz durum atlamaları yapısal olarak engellenir; "her yerden
  her yere" yazım imkânsızdır.
- **Yetki + iz:** her durum değişimi yetkilendirilir ve **kim/ne zaman/neden**
  ile denetim kaydına düşer — hesap verebilirlik sağlanır.
- **Test edilebilirlik:** saf durum makinesi, girdi→çıktı olarak birim testiyle
  tam kapsanır; altyapı gerektirmez.
- **Merkezîlik:** izinli geçiş mantığı tek bir tabloda; iş kodlarına dağılmaz.

### Eksiler / Ödünler

- **Ekstra dolaylılık:** basit bir durum güncellemesi yerine geçiş + authorize +
  audit zinciri gerekir; kısa vadede daha çok kod.
- **Varsayılan tablonun doğrulanması gerekir:** başlangıç izinli-geçiş kümesi
  varsayımdır; gerçek yönetmelikle çelişirse güncellenmeli.
- **Parametrikleştirme ertelendi:** Faz 1'de geçiş kümesi tek/sabit varsayılan;
  tenant başına farklılaşma ihtiyacı doğduğunda ek iş gerekir (bilinçli
  YAGNI kararı).

## İlgili

- ADR-0001 — Modüler monolit / çekirdek-katman ayrımı.
- ADR-0006 — Versiyonlu, yürürlük-tarihli parametre altyapısı (durum kümesinin
  ileride parametrikleştirileceği model).
