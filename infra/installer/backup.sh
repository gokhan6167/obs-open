#!/usr/bin/env bash
# Şifreli veritabanı yedeği (Faz 9). BACKUP_PASSPHRASE set ise gpg ile şifreler.
set -euo pipefail
cd "$(dirname "$0")"
COMPOSE="docker compose -f docker-compose.prod.yml"
mkdir -p backups
TS=$(date +%Y%m%d-%H%M%S)

if [ -n "${BACKUP_PASSPHRASE:-}" ]; then
  FILE="backups/obs-$TS.sql.gz.gpg"
  $COMPOSE exec -T postgres pg_dump -U obs -d obs \
    | gzip \
    | gpg --batch --yes --passphrase "$BACKUP_PASSPHRASE" -c > "$FILE"
else
  FILE="backups/obs-$TS.sql.gz"
  $COMPOSE exec -T postgres pg_dump -U obs -d obs | gzip > "$FILE"
  echo "UYARI: BACKUP_PASSPHRASE yok -> yedek şifresiz (disk şifrelemesine güveniliyor)"
fi

ln -sf "$(basename "$FILE")" backups/latest
echo "✓ Yedek: $FILE"
