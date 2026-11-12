# ADR-0004: Dağıtım Modları — On-Premise + SaaS, Tek Kod Tabanı

## Durum

Kabul edildi — 2026-07-15

## Bağlam

Ürünün iki müşteri gerçekliği var:

- **On-premise (birincil satış modeli).** Üniversite, OBS'yi kendi altyapısında
  çalıştırmak ister — veri egemenliği, KVKK/kurumsal politikalar, mevcut BT
  yatırımı ve "verimiz bizde kalsın" beklentisi nedeniyle. İlk pilot Demo de dahil,
  vakıf üniversitelerinin çoğu bunu tercih eder. Bu modda kurulumu bir üniversite
  BT ekibi yürütür; operasyonel basitlik pazarlık konusu değildir.
- **SaaS (ikincil).** Bulutta bizim işlettiğimiz, birden çok kiracının
  paylaşabildiği yönetilen ortam.

İki farklı kod tabanı (fork) tutmak sürdürülemez: özellik sürüklenmesi, iki katı
bakım, ikiye katlanan hata yüzeyi. Tek kod tabanı, iki dağıtım modunu da
desteklemeli.

## Karar

**Tek kod tabanı**, `DEPLOYMENT_MODE` ortam değişkeni ile iki modda çalışır:

- `DEPLOYMENT_MODE=single-tenant` → on-premise. Sistemde tek bir kiracı vardır;
  o üniversitenin sabit `tenant_id`'si kullanılır. Kiracı seçimi/çözümü,
  kayıt/faturalama gibi çok-kiracı SaaS akışları devre dışıdır.
- `DEPLOYMENT_MODE=multi-tenant` → SaaS. Kiracı, istek bağlamından (alan adı/
  JWT) çözümlenir; kiracı yönetimi ve izolasyon tam etkindir.

**İlke: mod farkları tek noktada toplanır.** RLS deseni, veri modeli, API sözleşmesi
ve iş mantığı iki modda **aynıdır** (bkz. ADR-0003 — on-prem'de bile
`app.tenant_id` ayarlanır). Fark yalnızca "kiracı nasıl çözümlenir" ve "hangi
SaaS-özel akışlar açık" sorularında; bu da yapılandırmayla, kod dallanmasıyla değil,
merkezi bir strateji katmanıyla ele alınır. `if (DEPLOYMENT_MODE === ...)`
kontrolleri iş mantığına dağıtılmaz.

## Installer Birinci Sınıf Üründür

On-premise birincil satış modeli olduğundan, **kurulum deneyimi (installer)
birinci sınıf bir üründür**, sonradan eklenen bir betik değil:

- **Tek komutla ayağa kaldırma.** İdeal hedef: üniversite `docker compose up` ile
  tüm sistemi (api/web, worker, PostgreSQL, Redis, MinIO) çalıştırabilsin.
- **Tek imzalı imaj.** web ve worker süreçleri aynı imajı paylaşır (bkz. ADR-0001).
- **Yapılandırma şeffaf ve doğrulanmış.** Ortam değişkenleri (`.env`) örneklerle
  belgelenir; başlangıçta config doğrulaması (eksik/hatalı değerde net hata) yapılır.
- **İlk kurulum akışı:** migration'ların çalıştırılması, ilk yönetici hesabının ve
  ilk kiracının (single-tenant'ta o üniversite) tohumlanması (seed), sağlık kontrolü.
- **Yükseltme yolu.** Sürüm geçişlerinde migration'lar geriye dönük uyumlu ve
  idempotent uygulanır; on-prem müşteri güvenle güncelleyebilmeli.
- **Belgeleme.** Kurulum, yedekleme/geri yükleme ve yükseltme adımları üretim
  kalitesinde belgelenir (installer ürünün parçası olduğundan).

## Sonuçlar

### Artılar

- Tek kod tabanı: tek bakım, tutarlı özellik seti, tek hata yüzeyi.
- On-prem için gerçekçi, düşük-sürtünmeli kurulum ⇒ satış kolaylığı.
- SaaS ve on-prem aynı çekirdeği paylaştığı için bir modda düzelen hata her ikisini
  düzeltir.
- `single-tenant`'ın da RLS deseni kullanması, iki modun davranışını aynı tutar;
  "sadece SaaS'ta çıkan" hata sınıfı azalır.

### Eksiler / Ödünler

- Her özellik iki modda da düşünülmeli; bazı SaaS-özel akışların
  (faturalama, kiracı sağlama) single-tenant'ta anlamsız olduğu net sınırlanmalı.
- Installer'ı üretim kalitesinde tutmak sürekli yatırım gerektirir.
- On-prem müşterinin sürüm/yükseltme temposunu biz kontrol etmediğimizden, geriye
  dönük uyumluluğa (özellikle DB migration'larında) titiz olmak zorundayız.

## Kaçış Kapısı

`DEPLOYMENT_MODE` tek anahtar olduğundan, ileride üçüncü bir mod (ör. yönetilen
tek-kiracı bulut) eklemek merkezi strateji katmanına yeni bir dal eklemekle
sınırlıdır; iş mantığı değişmez.
