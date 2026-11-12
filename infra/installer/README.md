# OBS On-Premise Kurulum

OBS'yi kendi altyapınızda (üniversite BT ortamı) tek komutla ayağa kaldıran
üretim yığını: **app + PostgreSQL + Redis + MinIO + Caddy (otomatik TLS)**.
İnternetsiz (air-gapped) ortamlar desteklenir.

> On-premise OBS'nin birincil dağıtım modelidir (bkz. `docs/ADR/0004`,
> `docs/ADR/0012`). Bu dizin ürünün birinci sınıf parçasıdır.

## Ön koşullar

- **Docker** ve **Docker Compose** (compose v2) kurulu bir sunucu.
- 80 ve 443 portları dışarı açık (otomatik TLS için).
- Gerçek TLS sertifikası isteniyorsa, alan adının (`OBS_DOMAIN`) sunucuya
  yönlendirilmiş olması (Let's Encrypt doğrulaması için).

Kontrol:

```bash
docker --version
docker compose version
```

## Hızlı kurulum

Alan adınızı verip tek komut çalıştırın:

```bash
OBS_DOMAIN=obs.uni.edu.tr ./install.sh
```

`install.sh` şunları yapar:

1. `.env` yoksa **rastgele secretlarla** üretir (DB/app-DB/MinIO şifreleri, JWT
   secretları) ve `chmod 600` ile korur.
2. Altyapıyı (PostgreSQL, Redis, MinIO) ayağa kaldırır.
3. Migration'ları çalıştırır (şema + RLS + `obs_app` rolü).
4. `obs_app` rol şifresini `.env` ile eşitler.
5. Uygulama + Caddy TLS reverse proxy'yi ayağa kaldırır.

Bittiğinde sağlık ucu: `https://obs.uni.edu.tr/api/v1/health`

> **Not:** `OBS_DOMAIN` vermezseniz `localhost` kullanılır (Caddy dahili
> self-signed sertifika üretir); yerel deneme için uygundur.

## Air-gapped (internetsiz) kurulum

İnternete çıkışı olan bir makinede imajları paketleyin:

```bash
./airgap-export.sh <sürüm>      # obs-airgap-<sürüm>.tar üretir
```

Üretilen tar'ı hedef (internetsiz) sunucuya taşıyın, ardından orada:

```bash
./airgap-import.sh obs-airgap-<sürüm>.tar   # imajları docker load ile yükler
OBS_DOMAIN=obs.uni.edu.tr ./install.sh      # aynı kurulum akışı
```

## Yükseltme

Yeni sürüme geçiş tek komuttur; **otomatik geri alma** içerir:

```bash
./upgrade.sh <yeni-sürüm>
```

Adımlar: **yedek al → sürümü işaretle → migrate → uygulamayı güncelle → sağlık
kontrolü.** Migrate veya sağlık kontrolü başarısız olursa yükseltme kendini
**otomatik geri alır** (eski sürüme döner ve son yedeği geri yükler). Yükseltme
ya başarıyla ya da bilinen eski hâlle biter.

## Yedekleme ve geri yükleme

Yedek al (isteğe bağlı şifreli):

```bash
./backup.sh                                  # backups/obs-<ts>.sql.gz (şifresiz)
BACKUP_PASSPHRASE='güçlü-parola' ./backup.sh # backups/obs-<ts>.sql.gz.gpg (gpg şifreli)
```

Her yedek `backups/latest` ile işaretlenir.

> Üretimde **`BACKUP_PASSPHRASE` kullanmanız önerilir.** Verilmezse yedek
> şifresizdir ve yalnızca disk şifrelemesine güvenir.

Geri yükle:

```bash
./restore.sh latest                          # son yedeği geri yükler
./restore.sh backups/obs-20260718-030000.sql.gz   # belirli bir yedeği geri yükler
```

Şifreli (`.gpg`) yedeği geri yüklerken aynı `BACKUP_PASSPHRASE` gerekir.

> **RPO/RTO hedefleri:** RPO ≤ 15 dk (yedek sıklığını buna göre — ör. cron ile —
> planlayın), RTO ≤ 4 saat. Bkz. `docs/ADR/0012` §Karar 3.

## Yönetim komutları

```bash
docker compose -f docker-compose.prod.yml ps      # servis durumları
docker compose -f docker-compose.prod.yml logs -f # canlı loglar (app için: logs -f app)
docker compose -f docker-compose.prod.yml down     # yığını durdur (veriler volume'da kalır)
```

Veri kalıcıdır: PostgreSQL (`pgdata`), Redis (`redisdata`), MinIO (`miniodata`)
ve Caddy sertifikaları (`caddydata`) Docker volume'larında saklanır; `down` bu
verileri **silmez**.
