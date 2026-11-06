# Build from repository root: work/build-venv/bin/python -m PyInstaller Prombee.spec --noconfirm
from pathlib import Path
root=Path(SPECPATH)
processes=Path('/usr/libexec/webkitgtk-6.0')
a=Analysis([str(root/'desktop.py')],pathex=[str(root/'src')],
    binaries=[(str(f),'webkit-processes') for f in processes.iterdir() if f.is_file()],
    datas=[(str(root/'web'),'web'),(str(root/'seed.json'),'.')],
    hiddenimports=['gi.repository.Gtk','gi.repository.Gdk','gi.repository.WebKit','gi.repository.JavaScriptCore'],
    hookspath=[str(root/'scripts')],
    hooksconfig={'gi':{'module-versions':{'Gtk':'4.0','Gdk':'4.0','WebKit':'6.0','JavaScriptCore':'6.0','Soup':'3.0'},'icons':[],'themes':[],'languages':[]}},
    excludes=['tkinter','matplotlib','numpy','PyQt5','PyQt6','PySide6'],noarchive=False)
pyz=PYZ(a.pure)
exe=EXE(pyz,a.scripts,a.binaries,a.datas,[],name='Prombee',debug=False,bootloader_ignore_signals=False,strip=False,upx=False,console=False)
