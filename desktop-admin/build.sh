#!/bin/sh
set -eu
cd "$(dirname "$0")"
project_dir=$(cd .. && pwd -P)
.venv/bin/python -m PyInstaller --noconfirm --clean --distpath build-portable/package --workpath build-portable console.spec
build-portable/package/VND-Console/VND-Console --self-test
if [ -L "$project_dir/_internal" ]; then
    echo 'Runtime output cannot be a link.' >&2
    exit 1
fi
rm -rf -- "$project_dir/_internal"
mv build-portable/package/VND-Console/_internal "$project_dir/_internal"
cp build-portable/package/VND-Console/VND-Console "$project_dir/VND-Console"
rm -rf -- "$project_dir/desktop-admin/build-portable/package"
printf 'Control panel: %s/VND-Console\n' "$project_dir"
