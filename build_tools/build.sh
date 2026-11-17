#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")/.."
if [ ! -x work/build-venv/bin/python ]; then
  python3 -m venv --system-site-packages work/build-venv
fi
work/build-venv/bin/python -m pip install -r requirements-build.txt
npm --prefix frontend run build
work/build-venv/bin/python -m PyInstaller build_tools/Prombee.spec --noconfirm --workpath work/pyinstaller --distpath dist
