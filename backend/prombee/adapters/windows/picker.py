"""Native Windows data-folder selection."""

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
