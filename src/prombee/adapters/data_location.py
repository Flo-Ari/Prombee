"""Store data only in a user-chosen folder or alongside the application."""
import json
from pathlib import Path
import tempfile

from .storage import atomic_write


def writable_folder(folder):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryFile(dir=folder): pass
    return folder.resolve()


def resolve_data_folder(application_dir, explicit=None, choose=None):
    application_dir = Path(application_dir).resolve()
    if explicit:
        return writable_folder(Path(explicit).expanduser())
    pointer = application_dir / 'data-location.json'
    if pointer.exists():
        try:
            value = json.loads(pointer.read_text(encoding='utf-8'))
            folder = Path(value['path'])
            if not folder.is_absolute() or not folder.is_dir(): raise ValueError('数据文件夹不可用')
            return writable_folder(folder)
        except (OSError, ValueError, KeyError, TypeError):
            if not choose: raise ValueError('上次的数据文件夹不可用，请重新选择')
            selected = choose()
            if not selected: return None
            folder = writable_folder(selected)
            atomic_write(pointer, json.dumps({'path': str(folder)}, ensure_ascii=False))
            return folder
    try:
        return writable_folder(application_dir / 'Prombee-data')
    except OSError:
        if not choose: raise ValueError('软件文件夹不可写，请选择数据保存位置或更换安装位置')
        selected = choose()
        if not selected: return None
        folder = writable_folder(selected)
        # Never fall back to AppData, HOME, Documents or an inferred location.
        try: atomic_write(pointer, json.dumps({'path': str(folder)}, ensure_ascii=False))
        except OSError: pass
        return folder


def choose_windows_folder():
    import ctypes as C
    from ctypes import wintypes as W
    class BrowseInfo(C.Structure):
        _fields_ = [('hwndOwner', W.HWND), ('pidlRoot', C.c_void_p), ('pszDisplayName', W.LPWSTR),
                    ('lpszTitle', W.LPCWSTR), ('ulFlags', W.UINT), ('lpfn', C.c_void_p),
                    ('lParam', W.LPARAM), ('iImage', C.c_int)]
    shell, ole = C.windll.shell32, C.windll.ole32
    shell.SHBrowseForFolderW.argtypes = [C.POINTER(BrowseInfo)]
    shell.SHBrowseForFolderW.restype = C.c_void_p
    shell.SHGetPathFromIDListEx.argtypes = [C.c_void_p, W.LPWSTR, W.DWORD, W.DWORD]
    ole.CoTaskMemFree.argtypes = [C.c_void_p]
    initialized = ole.CoInitialize(None) in (0, 1)
    try:
        info = BrowseInfo(None, None, C.create_unicode_buffer(260), '选择提示蜂数据保存文件夹', 0x41, None, 0, 0)
        pidl = shell.SHBrowseForFolderW(C.byref(info))
        if not pidl: return None
        try:
            path = C.create_unicode_buffer(32768)
            if not shell.SHGetPathFromIDListEx(pidl, path, len(path), 0): raise ValueError('所选位置不是文件夹')
            return path.value
        finally: ole.CoTaskMemFree(pidl)
    finally:
        if initialized: ole.CoUninitialize()


def choose_gtk_folder(Gtk, Gio, GLib):
    Gtk.init()
    loop = GLib.MainLoop()
    result = [None]
    chooser = Gtk.FileChooserNative.new('选择提示蜂数据保存文件夹', None,
                                        Gtk.FileChooserAction.SELECT_FOLDER, '选择', '取消')
    def response(dialog, code):
        if code == Gtk.ResponseType.ACCEPT and dialog.get_file(): result[0] = dialog.get_file().get_path()
        dialog.destroy(); loop.quit()
    chooser.connect('response', response)
    chooser.show(); loop.run()
    return result[0]
