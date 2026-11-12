# ADR-0002: ORM Seçimi — Drizzle

## Durum

Kabul edildi — 2026-07-15

## Bağlam

Backend TypeScript + NestJS üzerinde modüler monolit olarak inşa ediliyor
(bkz. ADR-0001). Veritabanı PostgreSQL 16. Multi-tenancy stratejimiz shared
database + `tenant_id` + PostgreSQL Row-Level Security (RLS) üzerine kurulu
(bkz. ADR-0003).

Bu bağlamda ORM/query katmanının karşılaması gereken zorlu gereksinimler var:

1. **RLS ile tam uyum.** Her veritabanı bağlantısında `SET app.tenant_id`
   çalıştırabilmemiz, session/connection yaşam döngüsüne hakim olmamız gerekir.
   RLS politikaları, uygulama katmanının bağlantı yönetimine müdahalesini şart
   koşar.
2. **Raw SQL hakimiyeti.** Kontenjan düşümü (`... FOR UPDATE`, `SELECT ...
   SKIP LOCKED`), karmaşık GNO/AKTS toplama sorguları, pencere fonksiyonları gibi
   akademik hesaplamalar için SQL'e doğrudan ve öngörülebilir erişim şart.
3. **Migration şeffaflığı.** Üretilen migration SQL'i insan tarafından okunabilir
   ve gözden geçirilebilir olmalı; ürettiği DDL üzerinde tam kontrol istiyoruz
   (RLS `CREATE POLICY`, rol ayrımları, `ENABLE ROW LEVEL SECURITY` gibi ifadeleri
   migration'lara elle veya öngörülebilir biçimde ekleyeceğiz).
4. **Tip güvenliği.** TypeScript ile derleme zamanı güvence.

Aday ORM'ler: **Prisma** ve **Drizzle**.

## Karar

**Drizzle** ORM kullanılacak. Prisma **reddedildi**.

## Gerekçe

- **RLS ve bağlantı kontrolü.** Drizzle, standart bir `node-postgres` (veya
  eşdeğeri) bağlantı havuzunun üstünde ince bir katman olarak çalışır. Bir
  transaction/bağlantı başına `SET app.tenant_id = '<uuid>'` çalıştırmak
  doğrudan ve idiyomatik. Prisma'nın kendi bağlantı yönetimi ve sorgu motoru soyutlaması,
  session değişkeni ayarlama ve RLS için bağlantı-başına context enjeksiyonunu
  zorlaştırır; RLS için Prisma'yı zorlamak bilinen bir sürtünme noktasıdır.
- **Raw SQL, birinci sınıf.** Drizzle'da `sql` template ile ham SQL yazmak,
  tipli query builder ile karıştırmak doğaldır. Kontenjan kilitleme
  (`FOR UPDATE`/`SKIP LOCKED`) ve akademik toplama sorguları için kaçınılmaz olan
  ham SQL, Drizzle'da kaçış kapısı değil, birinci sınıf yol.
- **Migration şeffaflığı.** Drizzle Kit'in ürettiği migration'lar düz SQL
  dosyalarıdır — okunabilir, gözden geçirilebilir, elle düzenlenebilir. RLS
  politikalarını, rol tanımlarını ve `ENABLE ROW LEVEL SECURITY` ifadelerini
  migration akışına doğrudan koyabiliriz. Prisma'nın migration üretimi daha
  kapalı ve deklaratif şema odaklıdır; RLS gibi Prisma şema modelinin doğrudan
  ifade etmediği yapıları elle SQL migration'la eklemek gerekir, bu da şema ile
  gerçek DB arasında sürüklenme (drift) riski doğurur.
- **İnce soyutlama, öngörülebilir performans.** Drizzle çalışma zamanında ağır
  bir sorgu motoru veya ayrı bir binary taşımaz; ürettiği SQL öngörülebilir.
  Zirve ders-kayıt yükünde sorgu davranışına hakim olmak kritik.

## Sonuçlar

### Artılar

- RLS deseni ile temiz entegrasyon; bağlantı-başına `SET app.tenant_id` doğal.
- Ham SQL ve kilitleme desenlerine tam erişim.
- Okunabilir, versiyonlanabilir SQL migration'lar; DB üzerinde tam kontrol.
- Hafif runtime; ayrı sorgu motoru binary'si yok.
- Derleme zamanı tip güvenliği.

### Eksiler / Ödünler

- Prisma'ya kıyasla daha manuel: ilişki yükleme (relation loading) ve bazı
  ergonomiler daha az "sihirli", daha çok açık SQL düşünmeyi gerektirir.
- Ekosistem/araç olgunluğu Prisma'nınki kadar geniş değil; bazı yardımcıları
  kendimiz yazacağız. (RLS/raw SQL hakimiyeti karşısında kabul edilebilir.)
- Şema ve migration disiplini geliştiriciye daha çok bırakılır.

## Kaçış Kapısı

Drizzle ham SQL'e yakın durduğu için, gelecekte performans-kritik bir yol tamamen
elle yazılmış SQL'e veya saklı yordama (stored procedure) taşınabilir; ORM bu
geçişi engellemez. Katman ince olduğu için ORM'i tamamen atlayıp doğrudan
`node-postgres` ile de çalışmak her zaman mümkündür.
