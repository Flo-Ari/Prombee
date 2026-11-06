# Build on Windows with: python -m PyInstaller Prombee-windows.spec --noconfirm
from pathlib import Path
from PyInstaller.utils.hooks import collect_all
root = Path(SPECPATH)
datas, binaries, hiddenimports = collect_all('webview')
a = Analysis([str(root / 'desktop_windows.py')], pathex=[str(root / 'src')],
    binaries=binaries,
    datas=datas + [(str(root / 'web'), 'web'), (str(root / 'seed.json'), '.'), (str(root / 'LICENSE'), '.'), (str(root / 'NOTICE'), '.')],
    hiddenimports=hiddenimports,
    excludes=['tkinter', 'matplotlib', 'numpy', 'gi', 'PyQt5', 'PyQt6', 'PySide6', 'cefpython3'],
    noarchive=False)
pyz = PYZ(a.pure)
exe = EXE(pyz, a.scripts, a.binaries, a.datas, [], name='Prombee',
          debug=False, bootloader_ignore_signals=False, strip=False, upx=False,
          console=False, icon=str(root / 'assets' / 'prombee.ico') if (root / 'assets' / 'prombee.ico').exists() else None)
