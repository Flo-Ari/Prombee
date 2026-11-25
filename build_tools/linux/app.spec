# Build from repository root: .cache/prombee/build-venv/bin/python -m PyInstaller build_tools/linux/app.spec --noconfirm
from pathlib import Path
import shutil
root=Path(SPECPATH).parents[1]
processes=Path('/usr/libexec/webkitgtk-6.0')
a=Analysis([str(root/'backend/prombee/__main__.py')],pathex=[str(root/'backend')],
    binaries=[(str(f),'webkit-processes') for f in processes.iterdir() if f.is_file()] + ([(shutil.which('xprop'),'.')] if shutil.which('xprop') else []),
    datas=[(str(root/'frontend/dist'),'frontend/dist'),(str(root/'backend/prombee/resources/seed.json'),'backend/prombee/resources'),(str(root/'LICENSE'),'.'),(str(root/'NOTICE'),'.')],
    hiddenimports=['prombee.adapters.linux.host','gi.repository.Gtk','gi.repository.Gdk','gi.repository.GdkX11','gi.repository.WebKit','gi.repository.JavaScriptCore'],
    hookspath=[str(root/'build_tools/linux/hooks')],
    hooksconfig={'gi':{'module-versions':{'Gtk':'4.0','Gdk':'4.0','WebKit':'6.0','JavaScriptCore':'6.0','Soup':'3.0'},'icons':[],'themes':[],'languages':[]}},
    excludes=['tkinter','matplotlib','numpy','PyQt5','PyQt6','PySide6'],noarchive=False)
pyz=PYZ(a.pure)
exe=EXE(pyz,a.scripts,a.binaries,a.datas,[],name='Prombee',debug=False,bootloader_ignore_signals=False,strip=False,upx=False,console=False)
