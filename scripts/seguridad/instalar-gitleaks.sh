#!/usr/bin/env bash
# Instala gitleaks con version y checksum fijados (SEC-18, SEC-31). No usa gitleaks-action (pide licencia
# en organizaciones). En GitHub Actions deja el binario en el PATH del resto del job.
set -euo pipefail

VERSION="8.30.1"
SHA256="551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb" # gitleaks_8.30.1_linux_x64.tar.gz
DESTINO="${RUNNER_TEMP:-/tmp}/gitleaks-bin"

mkdir -p "$DESTINO"
curl -fsSL --retry 3 -o "$DESTINO/gitleaks.tar.gz" \
  "https://github.com/gitleaks/gitleaks/releases/download/v${VERSION}/gitleaks_${VERSION}_linux_x64.tar.gz"
echo "${SHA256}  $DESTINO/gitleaks.tar.gz" | sha256sum --check --status || {
  echo "gitleaks: el checksum no coincide, no se instala" >&2
  exit 1
}
tar -xzf "$DESTINO/gitleaks.tar.gz" -C "$DESTINO" gitleaks
rm -f "$DESTINO/gitleaks.tar.gz"
if [ -n "${GITHUB_PATH:-}" ]; then
  echo "$DESTINO" >> "$GITHUB_PATH"
fi
"$DESTINO/gitleaks" version
