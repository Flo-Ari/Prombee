#!/bin/sh
set -eu
cd -- "$(dirname -- "$0")/../.."
if [ ! -x .cache/prombee/build-venv/bin/python ]; then
  python3 -m venv --system-site-packages .cache/prombee/build-venv
fi
.cache/prombee/build-venv/bin/python -m pip install -r backend/requirements/linux-build.txt
npm --prefix frontend run build
.cache/prombee/build-venv/bin/python -m PyInstaller build_tools/linux/app.spec --noconfirm --workpath .cache/prombee/pyinstaller --distpath dist
