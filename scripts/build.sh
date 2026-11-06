#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")/.."
if [ ! -x work/build-venv/bin/python ]; then
  python3 -m venv --system-site-packages work/build-venv
  work/build-venv/bin/python -m pip install 'PyInstaller==6.22.3'
fi
work/build-venv/bin/python -m PyInstaller Prombee.spec --noconfirm --workpath work/pyinstaller --distpath dist
