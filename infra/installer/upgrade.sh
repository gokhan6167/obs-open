#!/usr/bin/env bash
# Sürüm yükseltme (Faz 9): yedek al -> migrate -> sağlık kontrolü -> başarısızsa
# otomatik geri al. Kullanım: ./upgrade.sh <yeni-sürüm>
set -euo pipefail
cd "$(dirname "$0")"
COMPOSE="docker compose -f docker-compose.prod.yml"

NEW_VERSION="${1:?kullanım: ./upgrade.sh <yeni-sürüm>}"
set -a; . ./.env; set +a
OLD_VERSION="${OBS_VERSION:-latest}"

set_version() { sed -i.bak "s/^OBS_VERSION=.*/OBS_VERSION=$1/" .env && rm -f .env.bak; set -a; . ./.env; set +a; }

rollback() {
  echo "!! GERİ ALINIYOR -> $OLD_VERSION"
  set_version "$OLD_VERSION"
  $COMPOSE up -d --wait app caddy || true
  ./restore.sh latest || true
  echo "Geri alındı: $OLD_VERSION"
}

echo "== OBS yükseltme: $OLD_VERSION -> $NEW_VERSION =="
echo "-> 1) Yedek"; ./backup.sh
echo "-> 2) Yeni sürüm işaretleniyor"; set_version "$NEW_VERSION"

echo "-> 3) Migrate (geriye uyumlu / expand-contract)"
if ! $COMPOSE run --rm app node dist/db/migrate.js; then
  echo "migrate başarısız"; rollback; exit 1
fi

echo "-> 4) Uygulama güncelleniyor"
$COMPOSE up -d --wait app caddy

echo "-> 5) Sağlık kontrolü"
if $COMPOSE exec -T app node -e \
  "fetch('http://localhost:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"; then
  echo "✓ Yükseltme başarılı: $NEW_VERSION"
else
  echo "sağlık kontrolü başarısız"; rollback; exit 1
fi
