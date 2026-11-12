# KVKK Veri İşleme Envanteri (İskelet)

> **Durum:** İSKELET / TASLAK. Bu belge, 6698 sayılı Kişisel Verilerin Korunması
> Kanunu (KVKK) kapsamında hazırlanacak **VERBİS uyumlu veri işleme envanterinin**
> mimari iskeletidir. Kesin hukuki metin, üniversitenin **Veri Sorumlusu** ve
> hukuk/uyum birimi ile birlikte tamamlanmalıdır. Saklama süreleri ve bazı hukuki
> dayanaklar **parametriktir** ve yönetmelik/kuruma göre değişir.
>
> **Not:** Sistem biyometrik veri **işlemez**. Yüz/parmak izi gibi biyometrik
> kimlik doğrulama tasarımda yoktur (kimlik doğrulama Argon2id parola + TOTP 2FA).

## 1. İşlenen kişisel veri kategorileri

| Kategori | Örnek veri alanları | Özel nitelikli mi | Not |
|---|---|---|---|
| Kimlik | Ad, soyad, T.C. kimlik no, doğum tarihi/yeri, uyruk, öğrenci no | Hayır (T.C. no kritik) | YÖKSİS ile eşleşir |
| İletişim | E-posta, telefon, adres | Hayır | Bildirimler için |
| Akademik | Ders kayıtları, notlar, GNO, devamsızlık, transkript, mezuniyet | Hayır | Sistemin çekirdeği |
| Mali | Harç/ödeme durumu, burs, taksit, banka referansı | Hayır | Banka ile aktarım |
| **Sağlık (özel nitelikli)** | Sağlık raporlu mazeret, engellilik durumu, klinik uygulama sağlık kaydı | **Evet** | KVKK m.6 — ek koruma |
| Görsel | Öğrenci fotoğrafı (kimlik kartı) | Hayır | Kimlik kartı için |
| İşlem güvenliği | IP, oturum kayıtları, audit log | Hayır | Güvenlik/denetim |
| Biyometrik | — | — | **İşlenmez** |

## 2. İşleme amacı, hukuki dayanak, saklama süresi

| Veri kategorisi | İşleme amacı | Hukuki dayanak (KVKK m.5/m.6) | Saklama süresi | Parametrik mi |
|---|---|---|---|---|
| Kimlik | Öğrenci kaydı, kimlik doğrulama, resmi belge | Kanunda öngörülme / sözleşme / hukuki yükümlülük | Öğrencilik + mevzuat süresi (örn. arşiv: süresiz belge) | Evet |
| İletişim | Bildirim, resmi tebligat | Meşru menfaat / sözleşme | Öğrencilik süresi + X yıl | Evet |
| Akademik | Ders/not/mezuniyet işlemleri, transkript | Kanunda öngörülme / hukuki yükümlülük | Kalıcı (diploma/transkript arşivi) | Evet |
| Mali | Harç/burs tahsilatı ve takibi | Sözleşme / hukuki yükümlülük (mali mevzuat) | Mali mevzuat süresi (örn. 10 yıl) | Evet |
| **Sağlık** | Mazeret/devamsızlık, klinik uygulama uygunluğu, engelli desteği | **Açık rıza** ve/veya **KVKK m.6** özel şartları | İlgili işlem + mevzuat süresi | Evet |
| Görsel | Kimlik kartı | Sözleşme / meşru menfaat | Öğrencilik süresi | Evet |
| İşlem güvenliği | Güvenlik, denetim izi (audit) | Meşru menfaat / hukuki yükümlülük | Log saklama süresi (örn. 2 yıl) | Evet |

> Saklama süreleri **VARSAYIM/PARAMETRİK**; kesin süreler üniversitenin
> imha politikası ve ilgili mevzuatla (arşiv, mali, YÖK) belirlenir.

## 3. Veri sahibi hakları (KVKK m.11) — sistem karşılığı

| Hak | Sistem yeteneği | Not |
|---|---|---|
| Bilgi talep etme / erişim | Öğrenci kendi verisini görüntüler; talep üzerine kopya | RLS ile kendi kiracısı/kaydıyla sınırlı |
| Düzeltme | Kişisel veri düzeltme akışı (bazı alanlar onaylı) | Audit'e kaydedilir |
| **Dışa aktarma (taşınabilirlik)** | Kişisel verinin makine-okunur dışa aktarımı | Öğrenci işleri onaylı |
| **Silme / yok etme** | Silme talebi akışı | Yasal saklama yükümlülüğü olan kayıtlar hariç |
| **Anonimleştirme** | Saklama süresi sonunda anonimleştirme | Raporlama için anonim veri korunabilir |
| İşlemeye itiraz | İtiraz kaydı ve değerlendirme akışı | Manuel süreç desteği |

> Silme ile yasal saklama yükümlülüğü çatıştığında, kayıt silinmez;
> **erişim kısıtlanır ve anonimleştirme** hedeflenir.

## 4. Veri aktarımı (üçüncü taraflar / yurt içi)

| Alıcı | Aktarılan veri | Amaç | Hukuki dayanak | Not |
|---|---|---|---|---|
| **YÖKSİS** (YÖK) | Kimlik, akademik, kayıt/mezuniyet | Yasal bildirim yükümlülüğü | Kanunda öngörülme | Zorunlu entegrasyon |
| **e-Devlet** | Kimlik, öğrenci belgesi/transkript | Vatandaşa belge sunumu | Kanunda öngörülme | Kimlik doğrulamalı |
| **Banka** | Kimlik (kısmi), harç/borç bilgisi | Harç tahsilatı | Sözleşme | Asgari veri ilkesi |

> Yurt dışına aktarım tasarımda **yoktur** (on-prem birincil model; SaaS'ta veri
> yurt içinde tutulur). Aksi bir durum ayrıca KVKK m.9 değerlendirmesi gerektirir.

## 5. Açık rıza gerektiren durumlar

| Durum | Neden açık rıza | Not |
|---|---|---|
| **Veli/vasi erişimi** (18 yaş üstü öğrenci) | Reşit öğrencinin verisi veliyle paylaşılıyorsa öğrencinin açık rızası | Rıza geri alınabilir; sistemde yönetilir |
| Sağlık verisinin işlenmesi (m.6 kapsamı dışında kalan haller) | Özel nitelikli veri | Rıza kaydı audit'lenir |
| Zorunlu olmayan bildirim/pazarlama kanalları | İletişim rızası | Opt-in / opt-out |

## 6. Teknik ve idari tedbirler

| Tedbir | Uygulama |
|---|---|
| **Şifreleme (aktarımda)** | Tüm HTTP trafiği TLS |
| **Şifreleme (dinlenimde)** | DB/dosya depolama (MinIO) şifreleme; hassas alanlar için ek koruma değerlendirilir |
| **Parola güvenliği** | Argon2id ile parola özetleme |
| **Çok faktörlü kimlik doğrulama** | TOTP 2FA (özellikle personel/yönetici) |
| **Kiracı izolasyonu** | PostgreSQL Row-Level Security (RLS) — çift kilit (bkz. ADR-0003) |
| **Yetkilendirme** | Rol tabanlı erişim; asgari yetki ilkesi |
| **Denetim izi (audit log)** | Kritik veri erişim/değişikliklerinin loglanması |
| **Veri minimizasyonu** | Yalnızca amaca uygun asgari veri |
| **Erişim ayrımı** | `app` rolü RLS'i atlayamaz; `migrate` rolü ayrı (bkz. ADR-0003) |
| **Yedekleme/geri yükleme** | Düzenli yedek; erişim kısıtlı |
| **İmha** | Saklama süresi sonunda silme/anonimleştirme prosedürü |

## 7. Tamamlanacaklar (TODO)

- [ ] VERBİS kaydı için Veri Sorumlusu bilgileri.
- [ ] Her kategori için kesin saklama süreleri (imha politikası ile).
- [ ] Sağlık verisi işleme envanterinin klinik/tıp programlarına göre detaylandırılması.
- [ ] Aydınlatma metni ve açık rıza metinlerinin hukuk birimince onayı.
- [ ] Kişisel Veri İşleme Envanteri'nin (KVİE) resmi formatta çıktısı.
- [ ] Veri ihlali müdahale planı.
