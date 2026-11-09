"""Windows desktop host: shared editor, native WebView2, per-user data."""
import argparse
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import sys
import threading
import time

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'src'))
from prombee.server import start_server


def clipboard_text(text=None):
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
        buffer = ctypes.create_unicode_buffer(str(text))
        handle = kernel32.GlobalAlloc(0x0002, ctypes.sizeof(buffer))
        if not handle:
            raise ctypes.WinError()
        pointer = kernel32.GlobalLock(handle)
        if not pointer:
            kernel32.GlobalFree(handle)
            raise ctypes.WinError()
        ctypes.memmove(pointer, buffer, ctypes.sizeof(buffer))
        kernel32.GlobalUnlock(handle)
        user32.EmptyClipboard()
        if not user32.SetClipboardData(13, handle):
            kernel32.GlobalFree(handle)
            raise ctypes.WinError()
    finally:
        user32.CloseClipboard()


BRIDGE = """
window.webkit = {messageHandlers: {
  clipboard: {postMessage: text => window.pywebview.api.clipboard(text)},
  theme: {postMessage: dark => window.pywebview.api.theme(dark)},
  close: {postMessage: value => window.pywebview.api.close_finished(value)},
  mascot: {postMessage: value => window.pywebview.api.mascot(JSON.parse(value))}
}};
"""


def main():
    parser = argparse.ArgumentParser(description='Prombee · 提示蜂')
    parser.add_argument('--data-dir', type=Path)
    parser.add_argument('--smoke-test', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--smoke-result', type=Path, help=argparse.SUPPRESS)
    args = parser.parse_args()
    if os.name != 'nt':
        parser.error('This entry point requires Windows; use desktop.py on Linux.')
    data = args.data_dir or Path(os.environ.get('PROMBEE_DATA_DIR') or str(Path(os.environ['LOCALAPPDATA']) / 'Prombee'))
    data.mkdir(parents=True, exist_ok=True)
    import webview
    webview.settings['ALLOW_FILE_URLS'] = False
    server = start_server(ROOT, data, native_bridge=True)
    result = {'ok': False}
    closing = threading.Event()
    allow_close = threading.Event()

    class Api:
        def clipboard(self, text):
            clipboard_text(text)

        def theme(self, dark):
            # Editor theme is shared; Windows owns the native title bar appearance.
            pass

        def mascot(self, msg):
            floating.command(msg)

        def close_finished(self, value):
            if value == 'saved':
                allow_close.set()
                floating.stop.set()
                floating.allow_close=True
                floating.orb.destroy()
                window.destroy()
            else:
                closing.clear()
                window.run_js("document.getElementById('status').textContent='暂时无法保存，请先复制文字保留内容'")

    window = webview.create_window('Prombee · 提示蜂', f'http://127.0.0.1:{server.server_port}/?desktop=windows',
                                   js_api=Api(), width=1080, height=800, min_size=(640, 450), text_select=True,
                                   frameless=True, easy_drag=False)

    from prombee.floating_windows import WindowsFloating
    floating = WindowsFloating(webview,window,f'http://127.0.0.1:{server.server_port}/',data,lambda:window.destroy())

    def on_loaded():
        window.run_js(BRIDGE)

    def on_closing():
        if allow_close.is_set():
            return True
        if not closing.is_set():
            closing.set()
            threading.Thread(target=lambda: window.run_js("window.dispatchEvent(new Event('prombee-close'))"), daemon=True).start()
        return False

    def smoke():
        try:
            deadline = time.monotonic() + 45
            while time.monotonic() < deadline:
                state = json.loads(window.run_js("JSON.stringify({ready:!!window.prombeeReady,title:document.title,rows:document.querySelectorAll('.row').length,bridge:!!window.webkit?.messageHandlers?.close})"))
                if state and state['ready'] and state['bridge']:
                    break
                time.sleep(0.25)
            if not (state['ready'] and state['bridge'] and state['rows'] > 0):
                result['diagnostics'] = json.loads(window.run_js("JSON.stringify({status:document.getElementById('status')?.textContent,errors:window.prombeeErrors,userAgent:navigator.userAgent,resources:performance.getEntriesByType('resource').map(e=>({name:e.name,type:e.initiatorType,size:e.transferSize}))})"))
                raise AssertionError(state)
            assert state['title'] == 'Prombee · 提示蜂', state
            deadline=time.monotonic()+10
            while not floating.ready and time.monotonic()<deadline:time.sleep(.05)
            assert floating.ready,'Floating window did not load'
            floating.collapse()
            deadline=time.monotonic()+5
            while floating.mode!='orb' and time.monotonic()<deadline:time.sleep(.05)
            assert floating.mode=='orb','Collapse did not finish'
            floating.open()
            deadline=time.monotonic()+5
            while floating.mode!='editor' and time.monotonic()<deadline:time.sleep(.05)
            assert floating.mode=='editor','Expand did not finish'
            assert floating.completed_morphs==2,'Native animation renderer did not complete both transitions'
            result['floatingRoundTrip']=True
            marker = 'Prombee Windows 测试 🐝'
            clipboard_text(marker)
            assert clipboard_text() == marker, 'Unicode clipboard round trip failed'
            window.run_js("document.getElementById('newDoc').click(); const e=document.querySelector('.content'); e.textContent='Windows close-save 测试'; e.dispatchEvent(new Event('input',{bubbles:true}));")
            result.update(ok=True, ui=state, clipboard=True)
            window.destroy()  # Exercises close -> async save -> native close callback.
        except Exception as error:
            result.update(ok=False, error=str(error))
            allow_close.set()
            floating.stop.set()
            floating.allow_close=True
            floating.orb.destroy()
            window.destroy()

    window.events.loaded += on_loaded
    window.events.closing += on_closing
    try:
        webview.start(smoke if args.smoke_test else None, gui='edgechromium',
                      private_mode=False, storage_path=str(data / 'webview'))
        if args.smoke_test and result['ok']:
            registry = json.loads((data / 'library.json').read_text(encoding='utf-8'))
            saved = Path(next(entry['path'] for entry in registry['sets'] if entry['id'] == registry['active'])).read_text(encoding='utf-8')
            assert 'Windows close-save 测试' in saved, 'Close did not flush changes'
            result['closeSave'] = True
    except Exception as error:
        result.update(ok=False, error=str(error))
        if not args.smoke_test:
            ctypes.windll.user32.MessageBoxW(None,
                '无法启动 Prombee。请安装 Microsoft Edge WebView2 Runtime 后重试。\n\n' + str(error),
                'Prombee · 提示蜂', 0x10)
    finally:
        server.shutdown()
        server.server_close()
        if args.smoke_result:
            args.smoke_result.parent.mkdir(parents=True, exist_ok=True)
            args.smoke_result.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    return 0 if not args.smoke_test or result['ok'] else 1


if __name__ == '__main__':
    raise SystemExit(main())
