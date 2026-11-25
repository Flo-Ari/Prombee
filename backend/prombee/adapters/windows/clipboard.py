"""Windows Unicode text, file-list and PNG clipboard adapter."""
import ctypes
from ctypes import wintypes
from pathlib import Path
import time


def clipboard_text(text=None,paths=None):
    """Read/write Unicode clipboard text using the Win32 clipboard API."""
    user32, kernel32 = ctypes.windll.user32, ctypes.windll.kernel32
    user32.OpenClipboard.argtypes = [wintypes.HWND]
    user32.OpenClipboard.restype = wintypes.BOOL
    user32.SetClipboardData.argtypes = [wintypes.UINT, wintypes.HANDLE]
    user32.SetClipboardData.restype = wintypes.HANDLE
    user32.GetClipboardData.argtypes = [wintypes.UINT]
    user32.GetClipboardData.restype = wintypes.HANDLE
    kernel32.GlobalAlloc.argtypes = [wintypes.UINT, ctypes.c_size_t]
    kernel32.GlobalAlloc.restype = wintypes.HGLOBAL
    kernel32.GlobalLock.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalLock.restype = ctypes.c_void_p
    kernel32.GlobalUnlock.argtypes = [wintypes.HGLOBAL]
    kernel32.GlobalFree.argtypes = [wintypes.HGLOBAL]
    for _ in range(20):
        if user32.OpenClipboard(None):
            break
        time.sleep(0.025)
    else:
        raise OSError('Clipboard is busy')
    try:
        if text is None:
            handle = user32.GetClipboardData(13)  # CF_UNICODETEXT
            pointer = kernel32.GlobalLock(handle)
            if not pointer:
                return ''
            try:
                return ctypes.wstring_at(pointer)
            finally:
                kernel32.GlobalUnlock(handle)
        user32.EmptyClipboard()
        def put(format_id,data):
            handle=kernel32.GlobalAlloc(0x0002,len(data))
            if not handle:raise ctypes.WinError()
            pointer=kernel32.GlobalLock(handle)
            if not pointer:kernel32.GlobalFree(handle);raise ctypes.WinError()
            ctypes.memmove(pointer,data,len(data));kernel32.GlobalUnlock(handle)
            if not user32.SetClipboardData(format_id,handle):kernel32.GlobalFree(handle);raise ctypes.WinError()
        put(13,(str(text)+'\0').encode('utf-16-le'))
        if paths:
            import struct
            # DROPFILES header: file list offset, POINT, fNC, fWide.
            put(15,struct.pack('<IiiII',20,0,0,0,1)+('\0'.join(paths)+'\0\0').encode('utf-16-le'))
            user32.RegisterClipboardFormatW.argtypes=[wintypes.LPCWSTR]
            user32.RegisterClipboardFormatW.restype=wintypes.UINT
            for path in paths:
                if Path(path).suffix.lower()=='.png':put(user32.RegisterClipboardFormatW('PNG'),Path(path).read_bytes());break
    finally:
        user32.CloseClipboard()


def clipboard_files():
    user=ctypes.windll.user32;shell=ctypes.windll.shell32
    user.OpenClipboard.argtypes=[wintypes.HWND];user.GetClipboardData.argtypes=[wintypes.UINT];user.GetClipboardData.restype=wintypes.HANDLE
    shell.DragQueryFileW.argtypes=[wintypes.HANDLE,wintypes.UINT,wintypes.LPWSTR,wintypes.UINT];shell.DragQueryFileW.restype=wintypes.UINT
    if not user.OpenClipboard(None):return []
    try:
        handle=user.GetClipboardData(15)
        if not handle:return []
        paths=[]
        for i in range(min(100,shell.DragQueryFileW(handle,0xffffffff,None,0))):
            length=shell.DragQueryFileW(handle,i,None,0);buffer=ctypes.create_unicode_buffer(length+1);shell.DragQueryFileW(handle,i,buffer,length+1)
            if Path(buffer.value).is_file():paths.append(buffer.value)
        return paths
    finally:user.CloseClipboard()
