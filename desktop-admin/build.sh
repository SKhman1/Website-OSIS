#!/bin/sh
set -eu
cd "$(dirname "$0")"
.venv/bin/python -m PyInstaller --noconfirm --clean --distpath dist-portable --workpath build-portable console.spec
cp README.md dist-portable/VND-Console/README.md
