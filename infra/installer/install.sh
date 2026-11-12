#!/usr/bin/env bash
# OBS on-premise kurulum (Faz 9). Tek komut: ./install.sh
# .env yoksa rastgele secretlarla üretir, migrate eder, yığını ayağa kaldırır.
set -euo pipefail
cd "$(dirname "$0")"
COMPOSE="docker compose -f docker-compose.prod.yml"

command -v docker >/dev/null || { echo "HATA: docker gerekli"; exit 1; }
docker compose version >/dev/null 2>&1 || { echo "HATA: docker compose gerekli"; exit 1; }

gen() { openssl rand -hex 24; }

if [ ! -f .env ]; then
  echo "-> .env oluşturuluyor (rastgele secretlar)"
  cat > .env <<EOF
DEPLOYMENT_MODE=single-tenant
NODE_ENV=production
API_PORT=3000
OBS_DOMAIN=${OBS_DOMAIN:-localhost}
OBS_VERSION=${OBS_VERSION:-latest}
OBS_DB_PASSWORD=$(gen)
OBS_APP_DB_PASSWORD=$(gen)
OBS_MINIO_PASSWORD=$(gen)
JWT_ACCESS_SECRET=$(gen)
JWT_REFRESH_SECRET=$(gen)
AUTH_STUB_ENABLED=false
TZ=Europe/Istanbul
EOF
  chmod 600 .env
fi
set -a; . ./.env; set +a

echo "-> Veritabanı/altyapı ayağa kaldırılıyor"
$COMPOSE up -d --wait postgres redis minio

echo "-> Migrate (şema + RLS + obs_app rolü)"
$COMPOSE run --rm app node dist/db/migrate.js

# Üretim: obs_app rolünün şifresini .env'deki değerle eşitle (migration dev şifresi koyar).
echo "-> obs_app rolü şifresi ayarlanıyor"
$COMPOSE exec -T postgres psql -U obs -d obs -c \
  "ALTER ROLE obs_app LOGIN PASSWORD '${OBS_APP_DB_PASSWORD}';" >/dev/null

echo "-> Uygulama + TLS reverse proxy"
$COMPOSE up -d --wait

echo ""
echo "✓ OBS kuruldu: https://${OBS_DOMAIN}/api/v1/health"
echo "  Yönetim: docker compose -f docker-compose.prod.yml [logs|ps|down]"
