#!/bin/sh
set -eu
cd "$(dirname "$0")"
.venv/bin/python -m PyInstaller --noconfirm --clean --distpath dist-secure --workpath build-portable console.spec
cp README.md dist-secure/VND-Console/README.md
