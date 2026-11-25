"""Provision the bundled, Microsoft-signed offline WebView2 runtime before GUI import."""
import ctypes
from ctypes import wintypes
import hashlib
from pathlib import Path
import subprocess
import time

RUNTIME_ID = '{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}'
INSTALLER = 'MicrosoftEdgeWebView2RuntimeInstallerX64.exe'


def runtime_version():
    import winreg
    key = 'Software\\Microsoft\\EdgeUpdate\\Clients\\' + RUNTIME_ID
    for hive in (winreg.HKEY_CURRENT_USER, winreg.HKEY_LOCAL_MACHINE):
        for view in (winreg.KEY_WOW64_32KEY, winreg.KEY_WOW64_64KEY):
            try:
                with winreg.OpenKey(hive, key, 0, winreg.KEY_READ | view) as handle:
                    version = winreg.QueryValueEx(handle, 'pv')[0]
                parts = tuple(int(p) for p in version.split('.'))
                if len(parts) == 4 and parts > (0, 0, 0, 0):
                    return version
            except (OSError, ValueError, AttributeError, TypeError):
                pass
    return None


class PreparationWindow:
    """Small native window: WebView2 itself cannot show setup progress yet."""
    def __init__(self):
        self.user = ctypes.windll.user32
        create = self.user.CreateWindowExW
        create.restype = wintypes.HWND
        create.argtypes = [wintypes.DWORD, wintypes.LPCWSTR, wintypes.LPCWSTR,
                           wintypes.DWORD, ctypes.c_int, ctypes.c_int, ctypes.c_int,
                           ctypes.c_int, wintypes.HWND, wintypes.HMENU,
                           wintypes.HINSTANCE, ctypes.c_void_p]
        self.user.DestroyWindow.argtypes = [wintypes.HWND]
        self.user.UpdateWindow.argtypes = [wintypes.HWND]
        self.user.PeekMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND, wintypes.UINT, wintypes.UINT, wintypes.UINT]
        self.user.TranslateMessage.argtypes = [ctypes.POINTER(wintypes.MSG)]
        self.user.DispatchMessageW.argtypes = [ctypes.POINTER(wintypes.MSG)]
        from ..branding import app_name, ui_language
        text = ('正在准备首次运行所需组件，请稍候…\n完成后自动打开提示蜂，无需联网。'
                if ui_language() == 'zh' else
                'Preparing components for the first launch…\nPrombee will open automatically. No internet required.')
        width, height = 470, 145
        x = (self.user.GetSystemMetrics(0) - width) // 2
        y = (self.user.GetSystemMetrics(1) - height) // 2
        self.handle = create(0, 'STATIC', app_name(), 0x10000000 | 0x00C00000,
                             x, y, width, height, None, None, None, None)
        if self.handle:
            create(0, 'STATIC', text, 0x50000000, 22, 30, 425, 65, self.handle, None, None, None)
            self.user.UpdateWindow(self.handle)
        self.message = wintypes.MSG()

    def pump(self):
        while self.user.PeekMessageW(ctypes.byref(self.message), None, 0, 0, 1):
            self.user.TranslateMessage(ctypes.byref(self.message))
            self.user.DispatchMessageW(ctypes.byref(self.message))

    def close(self):
        if self.handle:
            self.user.DestroyWindow(self.handle)


def ensure_runtime(root, log=lambda message: None, *, probe=runtime_version,
                   run=None, progress=PreparationWindow):
    version = probe()
    if version:
        log('WebView2 ' + version)
        return False
    installer = Path(root) / 'runtime' / INSTALLER
    digest_file = installer.with_suffix('.sha256')
    if not installer.is_file() or not digest_file.is_file():
        raise RuntimeError('此程序缺少内置运行组件，请重新下载完整的 Windows EXE。')
    expected = digest_file.read_text(encoding='ascii').strip()
    with installer.open('rb') as source:
        actual = hashlib.file_digest(source, 'sha256').hexdigest()
    if len(expected) != 64 or actual != expected:
        raise RuntimeError('内置运行组件校验失败，请重新下载 Windows EXE。')
    log('Installing bundled offline WebView2 runtime')
    window = progress()
    try:
        if run is None:
            process = subprocess.Popen([str(installer), '/silent', '/install'],
                                       creationflags=subprocess.CREATE_NO_WINDOW)
            deadline = time.monotonic() + 240
            while process.poll() is None:
                window.pump()
                if time.monotonic() >= deadline:
                    process.kill(); process.wait()
                    raise RuntimeError('准备运行组件超时，请重新打开程序重试。')
                time.sleep(0.04)
            code = process.returncode
        else:
            code = run(installer)
        log('WebView2 installer exit ' + str(code))
        # Another process can finish installing the shared runtime at the same time.
        for _ in range(20):
            if probe():
                return True
            window.pump(); time.sleep(0.1)
        raise RuntimeError('运行组件安装未完成（代码 ' + str(code) + '）。请查看启动日志。')
    finally:
        window.close()
