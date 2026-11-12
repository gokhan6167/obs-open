# ADR-0001: Yığın Seçimi ve Modüler Monolit Mimarisi

## Durum

Kabul edildi — 2026-07-15

## Bağlam

Çok kiracılı (multi-tenant) bir Üniversite Öğrenci Bilgi Sistemi (OBS) SaaS'ı inşa
ediyoruz. İlk pilot müşteri Demo Üniversitesi,
sağlık ağırlıklı vakıf üniversitesi. Ürünün iki dağıtım modu var: **on-premise**
(birincil satış modeli — üniversite sistemi kendi altyapısında çalıştırır) ve
**SaaS** (bulutta bizim işlettiğimiz paylaşımlı ortam).

Sistemin çözmesi gereken temel gerilimler:

1. **Hatasızlık mandası.** Not girişi, GNO hesabı, kontenjan düşümü gibi işlemler
   akademik olarak kritik. Bir öğrencinin notunun yanlış hesaplanması veya bir
   dersin kontenjanının aşılması kabul edilemez. Bu işlemler **tek bir ACID
   transaction** içinde, güçlü tutarlılıkla yürütülmeli.
2. **Zirve yük.** Ders kayıt döneminde ~20.000 eşzamanlı öğrenci sisteme yüklenir.
   Kısa süreli, yoğun, patlamalı bir yük profili.
3. **Multi-tenancy.** Tek kod tabanı birden çok üniversiteye hizmet edecek; kiracı
   izolasyonu veritabanı seviyesinde garanti altına alınmalı.
4. **Kurulum basitliği.** On-premise müşteri, ideal olarak `docker compose up` ile
   sistemi ayağa kaldırabilmeli; kurulumu ve bakımı bir üniversite BT ekibi
   yürütebilmeli.

Bu gerilimler ışığında iki temel mimari seçenek değerlendirildi: **mikroservis
mimarisi** ve **modüler monolit**.

## Karar

Backend, **TypeScript + NestJS** üzerinde bir **modüler monolit** olarak inşa
edilecek. Mikroservis mimarisi **reddedildi**.

Süreç ayrımı bugünden şu şekilde yapılır:

- **web** süreci: HTTP/REST API'yi karşılar (stateless, yatay ölçeklenir).
- **worker** süreci: BullMQ ile arka plan işlerini (rapor üretimi, toplu e-posta,
  YÖKSİS senkronizasyonu, ağır hesaplamalar) yürütür.

İkisi de **aynı kod tabanını ve aynı NestJS modüllerini** paylaşır; yalnızca giriş
noktaları (bootstrap) farklıdır. Bu, tek imzalı bir Docker imajıyla iki farklı
süreç rolü çalıştırmayı mümkün kılar.

### Gerekçe (mikroservisin reddi)

**1. Birincil satış modeli on-premise → tek imzalı imaj çok daha basit.**
Üniversite kendi sunucusunda `docker compose up` diyerek sistemi kurabilmeli.
Mikroservis mimarisinde her müşteri, 8-15 ayrı servisi, servisler arası ağ
topolojisini, service discovery'yi, mesaj kuyruğu kümesini ve dağıtık gözlemi
kurmak ve işletmek zorunda kalırdı. Bir üniversite BT ekibi için bu operasyonel
yük gerçekçi değil. Modüler monolit + tek Postgres + tek Redis, on-premise için
sürdürülebilir tek gerçekçi seçenek.

**2. Hatasızlık mandası → distributed transaction/saga karmaşasından kaçınmak.**
Not/GNO/kontenjan işlemleri tek ACID transaction'da tutulmalı. Mikroservis
mimarisinde "ders kaydı" bir servisin, "kontenjan" başka bir servisin, "not" üçüncü
bir servisin sorumluluğuna dağılsaydı, tutarlılık ancak **saga / iki-fazlı commit /
eventual consistency + telafi işlemleri** ile sağlanabilirdi. Bu, kritik akademik
kayıtlarda kabul edilemez karmaşıklık ve hata yüzeyi demek. Modüler monolitte tüm
ilgili tablolar tek veritabanında; `BEGIN ... COMMIT` içinde atomik güncelleme
doğal ve garantidir.

**3. Multi-tenant + RLS, paylaşımlı tek DB'de temiz.**
PostgreSQL Row-Level Security ile kiracı izolasyonu tek veritabanında zarif biçimde
çözülür (bkz. ADR-0003). Mikroservis mimarisinde her servis kendi veritabanına
sahip olsaydı, RLS politikalarını N ayrı şemada tekrarlamak ve tutarlı tutmak
gerekirdi.

**4. 20k eşzamanlı yük, stateless app'i yatay ölçekleyerek çözülür.**
Zirve yük problemi bir **ölçeklenebilirlik** problemidir, **mimari ayrıştırma**
problemi değil. web süreci stateless olduğu için, ders kayıt döneminde onu 2, 5,
10 kopyaya çıkarmak (bir yük dengeleyici arkasında) yeterlidir. Darboğaz
veritabanıdır ve bu darboğaz mikroservisle de aynen kalırdı — hatta daha kötü
olurdu, çünkü tek işlem birden çok servis çağrısına yayılırdı. Mikroservis burada
sorun çözmez, yeni sorun ekler.

## Sonuçlar

### Artılar

- **Basit dağıtım:** on-premise için tek imaj, `docker compose up`.
- **Güçlü tutarlılık:** kritik akademik işlemler tek ACID transaction'da.
- **Düşük operasyonel yük:** tek Postgres, tek Redis, tek uygulama imajı.
- **Hızlı geliştirme:** servisler arası ağ, sözleşme, sürüm uyumu derdi yok;
  refactor tek repoda atomik.
- **Kolay yerel test:** tüm sistem bir geliştirici makinesinde ayağa kalkar.
- **Net kiracı izolasyonu:** RLS tek DB'de merkezi.

### Eksiler / Ödünler

- **Tek dağıtım birimi:** küçük bir değişiklik tüm uygulamanın yeniden
  dağıtılmasını gerektirir. (Kabul edilebilir; deploy zaten tek imaj.)
- **Takım ölçeklenmesi:** çok sayıda takımın tamamen bağımsız deploy etmesi
  mikroservisteki kadar kolay değil. (Solo/küçük ekip için sorun değil.)
- **Modül sınırı disiplini geliştiriciye kalır:** dil/altyapı zorlamadığı için
  sınır ihlallerini kod incelemesi ve lint kuralları ile korumak gerekir.
- **Kaynak izolasyonu yok:** bir modülün CPU/bellek tüketimi diğerlerini etkiler.
  (worker/web ayrımı bunun en kritik kısmını hafifletir.)

## Kaçış Kapısı (Escape Hatch)

Monolith-first yaklaşımı benimsiyoruz: bugün monolit, gerekirse yarın ayrıştırma.
Bunu ileride mümkün kılmak için **bugünden** şu disiplinler uygulanır:

- **Sıkı modül sınırları.** Her domain modülü (kayıt, not, kontenjan, kimlik,
  finans...) kendi klasöründe; modüller birbirinin iç servislerine değil, yalnızca
  açıkça dışa açılan (public) arayüzlerine ve **domain event'lerine** bağlanır.
  Doğrudan tablolar arası bağımlılık ve modüller-arası import lint ile kısıtlanır.
- **Domain event'leri.** Modüller arası iletişim, senkron çağrının yanı sıra event
  yayınıyla da modellenebilir. Böylece bir modül ileride ayrı bir servise
  taşınırsa, senkron çağrı yerini mesaj kuyruğuna bırakabilir.
- **web/worker süreç ayrımı** zaten mevcut; bir sonraki doğal bölünme sınırı buradan
  geçer.

Bir modül gerçekten bağımsız ölçeklenme veya izolasyon ihtiyacı gösterirse (kanıta
dayalı, spekülatif değil), sıkı sınırları sayesinde ayrı bir servis olarak
çıkarılabilir. Ama bu **erteleme** kararıdır; bugün YAGNI gereği yapılmaz.
