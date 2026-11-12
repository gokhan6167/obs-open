#!/usr/bin/env bash
# Air-gap imaj paketini yükle (Faz 9). Kullanım: ./airgap-import.sh <tar-dosyası>
set -euo pipefail
TAR="${1:?kullanım: ./airgap-import.sh <obs-airgap-*.tar>}"
[ -f "$TAR" ] || { echo "HATA: dosya yok: $TAR"; exit 1; }
echo "-> İmajlar yükleniyor: $TAR"
docker load -i "$TAR"
echo "✓ Yüklendi. Şimdi: ./install.sh"
