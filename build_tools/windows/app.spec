# Build on Windows with: python -m PyInstaller build_tools/windows/app.spec --noconfirm
from pathlib import Path
from PyInstaller.utils.hooks import collect_all
root = Path(SPECPATH).parents[1]
datas, binaries, hiddenimports = collect_all('webview')
# Never ship a release that assumes WebView2 is preinstalled.
installer = root / '.cache/prombee/windows-runtime/MicrosoftEdgeWebView2RuntimeInstallerX64.exe'
if not installer.is_file() or not installer.with_suffix('.sha256').is_file():
    raise SystemExit('Missing verified offline WebView2 installer; use the Windows packaging workflow')
datas += [(str(installer), 'runtime'), (str(installer.with_suffix('.sha256')), 'runtime')]

a = Analysis([str(root / 'backend/prombee/__main__.py')], pathex=[str(root / 'backend')],
    binaries=binaries,
    datas=datas + [(str(root / 'frontend/dist'), 'frontend/dist'), (str(root / 'backend/prombee/resources/seed.json'), 'backend/prombee/resources'), (str(root / 'LICENSE'), '.'), (str(root / 'NOTICE'), '.')],
    hiddenimports=hiddenimports + ['prombee.adapters.windows.host'],
    excludes=['tkinter', 'matplotlib', 'numpy', 'gi', 'PyQt5', 'PyQt6', 'PySide6', 'cefpython3'],
    noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name='Prombee',
          debug=False, bootloader_ignore_signals=False, strip=False, upx=False,
          console=False, icon=str(root / 'build_tools' / 'packaging' / 'windows' / 'prombee.ico') if (root / 'build_tools' / 'packaging' / 'windows' / 'prombee.ico').exists() else None)
