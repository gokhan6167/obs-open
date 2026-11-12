#!/usr/bin/env bash
# Air-gapped kurulum için imajları tek tar'a paketle (Faz 9). İnternetsiz sunucuya
# taşınıp airgap-import.sh ile yüklenir. Kullanım: ./airgap-export.sh <sürüm>
set -euo pipefail
cd "$(dirname "$0")"
VERSION="${1:-latest}"
OUT="obs-airgap-${VERSION}.tar"

IMAGES=(
  "obs-api:${VERSION}"
  "postgres:16-alpine"
  "redis:7-alpine"
  "minio/minio:latest"
  "caddy:2-alpine"
)
echo "-> İmajlar paketleniyor: ${IMAGES[*]}"
docker save "${IMAGES[@]}" -o "$OUT"
echo "✓ Air-gap paketi: $OUT ($(du -h "$OUT" | cut -f1))"
echo "  Hedef sunucuya taşıyıp: ./airgap-import.sh $OUT && ./install.sh"
