#!/usr/bin/env bash
# Yedekten geri yükleme (Faz 9). Kullanım: ./restore.sh [yedek-dosyası|latest]
set -euo pipefail
cd "$(dirname "$0")"
COMPOSE="docker compose -f docker-compose.prod.yml"

SRC="${1:-latest}"
[ "$SRC" = "latest" ] && SRC="backups/$(readlink backups/latest)"
[ -f "$SRC" ] || { echo "HATA: yedek bulunamadı: $SRC"; exit 1; }

echo "-> Geri yükleniyor: $SRC"
decrypt() {
  case "$SRC" in
    *.gpg) gpg --batch --yes --passphrase "${BACKUP_PASSPHRASE:?gpg yedeği için BACKUP_PASSPHRASE gerekli}" -d "$SRC" ;;
    *) cat "$SRC" ;;
  esac
}
decrypt | gunzip | $COMPOSE exec -T postgres psql -U obs -d obs >/dev/null
echo "✓ Geri yükleme tamam"
