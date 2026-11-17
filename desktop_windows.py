"""Windows desktop host: shared editor, native WebView2, explicitly located data."""
import argparse
import ctypes
from ctypes import wintypes
import json
import os
from pathlib import Path
import sys
import threading
import time

LOG_FOLDER = None
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / 'backend'))
from prombee.server import start_server
from prombee.adapters.branding import app_name, ui_language


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


BRIDGE = """
window.webkit = {messageHandlers: {
  clipboard: {postMessage: text => window.pywebview.api.clipboard(text)},
  theme: {postMessage: dark => window.pywebview.api.theme(dark)},
  close: {postMessage: value => window.pywebview.api.close_finished(value)},
  mascot: {postMessage: value => window.pywebview.api.mascot(JSON.parse(value))}
}};
"""


def main():
    parser = argparse.ArgumentParser(description=app_name())
    parser.add_argument('--data-dir', type=Path)
    parser.add_argument('--smoke-test', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--smoke-result', type=Path, help=argparse.SUPPRESS)
    parser.add_argument('--smoke-install-runtime', action='store_true', help=argparse.SUPPRESS)
    args = parser.parse_args()
    if os.name != 'nt':
        parser.error('This entry point requires Windows; use desktop.py on Linux.')
    from prombee.adapters.data_location import resolve_data_folder, choose_windows_folder
    application = Path(sys.executable).resolve().parent if getattr(sys, 'frozen', False) else ROOT
    explicit = args.data_dir or os.environ.get('PROMBEE_DATA_DIR')
    # Existing data is never silently moved or discarded. The user can explicitly
    # choose its folder; otherwise new data lives beside the executable.
    if not explicit and not (application/'Prombee-data').exists() and not (application/'data-location.json').exists():
        legacy = Path(os.environ.get('LOCALAPPDATA', ''))/'Prombee'
        if (legacy/'library.json').exists():
            answer = ctypes.windll.user32.MessageBoxW(None,
                '检测到旧版本数据：\n'+str(legacy)+'\n\n是否自行选择要继续使用的数据文件夹？\n选择“否”将在软件文件夹内创建新数据，旧数据会保留。', app_name(), 0x23)
            if answer == 2: return 0
            if answer == 6:
                explicit = choose_windows_folder()
                if not explicit: return 0
                from prombee.adapters.storage import atomic_write
                atomic_write(application/'data-location.json', json.dumps({'path':str(Path(explicit).resolve())},ensure_ascii=False))
    data = resolve_data_folder(application, explicit, choose_windows_folder)
    if data is None: return 0
    global LOG_FOLDER
    LOG_FOLDER = data
    startup_log('Starting Prombee')
    from prombee.adapters.windows_runtime import ensure_runtime, runtime_version
    # Exercise the packaged installer and native preparation window in CI even
    # when the runner image already contains WebView2.
    first_probe = [args.smoke_test and args.smoke_install_runtime]
    def probe():
        if first_probe[0]:
            first_probe[0] = False
            return None
        return runtime_version()
    prepared = ensure_runtime(ROOT, startup_log, probe=probe)
    import webview
    webview.settings['ALLOW_FILE_URLS'] = False
    webview.settings['DRAG_REGION_SELECTOR'] = '.window-chrome'
    webview.settings['DRAG_REGION_DIRECT_TARGET_ONLY'] = False
    server = start_server(ROOT, data, native_bridge=True)
    result = {'ok': False, 'runtimePrepared': prepared, 'dataDir': str(data.resolve())}
    closing = threading.Event()
    allow_close = threading.Event()

    class Api:
        def clipboard_files(self):return clipboard_files()

        def clipboard(self, text, files=None):
            clipboard_text(text,server.attachments.paths(files or []))

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
                floating.focus_suspended=False
                window.run_js("document.getElementById('status').textContent='暂时无法保存，请先复制文字保留内容'")

    window = webview.create_window(app_name(), f'http://127.0.0.1:{server.server_port}/?desktop=windows&lang={ui_language()}',
                                   js_api=Api(), width=1080, height=800, min_size=(640, 450), text_select=True,
                                   frameless=True, easy_drag=False)

    from prombee.adapters.floating_windows import WindowsFloating
    floating = WindowsFloating(webview,window,f'http://127.0.0.1:{server.server_port}/',data,lambda:window.destroy())
    server.floating_changed=floating.preferences_changed

    def pick_path(kind, initial=''):
        options = {'directory': initial} if initial and Path(initial).is_dir() else {}
        if kind in ('file','save'): options['file_types'] = ('TXT (*.txt)',)
        if kind=='saveAttachment': options['save_filename']=Path(initial).name
        selected = window.create_file_dialog(webview.FileDialog.FOLDER if kind == 'folder' else webview.FileDialog.SAVE if kind in ('save','saveAttachment') else webview.FileDialog.OPEN, **options)
        return selected[0] if selected else None
    server.pick_path = pick_path

    def on_loaded():
        window.run_js(BRIDGE+";if(window.prombeeReady)window.pywebview.api.mascot({action:'editorReady'});")

    def on_closing():
        if allow_close.is_set():
            return True
        if not closing.is_set():
            floating.focus_suspended=True
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
            assert state['title'] == app_name(), state
            # Exercise a real held mouse gesture over the header, not a synthetic JS move.
            region=json.loads(window.run_js("JSON.stringify(document.querySelector('.drag-space').getBoundingClientRect().toJSON())"))
            user=ctypes.windll.user32
            hwnd=int(window.native.Handle.ToInt64())
            user.GetWindowRect.argtypes=[wintypes.HWND,ctypes.POINTER(wintypes.RECT)]
            before=wintypes.RECT();user.GetWindowRect(hwnd,ctypes.byref(before))
            scale=float(window.native._scale)
            px=before.left+round((region['x']+region['width']/2)*scale)
            py=before.top+round((region['y']+region['height']/2)*scale)
            user.SetCursorPos(px,py);time.sleep(.1)
            user.mouse_event(2,0,0,0,0);time.sleep(.15)
            for step in range(1,9):user.SetCursorPos(px+step*6,py+step*3);time.sleep(.06)
            user.mouse_event(4,0,0,0,0);time.sleep(.3)
            after=wintypes.RECT();user.GetWindowRect(hwnd,ctypes.byref(after))
            assert (after.left,after.top)!=(before.left,before.top),'Header mouse drag did not move the window'
            result['headerDrag']=True
            assert not floating.orb.native.Visible and floating.mode=='editor','Startup displayed the orb alongside the editor'
            result['startupEditorOnly']=True
            destinations=server.other.snapshot()
            assert isinstance(destinations['windows'],list) and isinstance(destinations['applications'],list)
            result['destinations']={key:len(destinations[key]) for key in ('windows','applications')}
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
            assert floating.completed_switches==2,'Native window switching did not complete both directions'
            foreground=ctypes.windll.user32.GetForegroundWindow()
            if foreground:
                expected=int(window.native.Handle.ToInt64());deadline=time.monotonic()+2
                while ctypes.windll.user32.GetForegroundWindow()!=expected and time.monotonic()<deadline:floating.activate_editor();time.sleep(.05)
                assert ctypes.windll.user32.GetForegroundWindow()==expected,'Editor did not regain foreground'
                result['foregroundRestore']=True
            result['floatingRoundTrip']=True
            marker = 'Prombee Windows 测试 🐝'
            attachment=data/'clipboard-附件.txt';attachment.write_text('fixture',encoding='utf-8')
            clipboard_text(marker,[str(attachment.resolve())])
            assert clipboard_text() == marker, 'Unicode clipboard round trip failed'
            assert clipboard_files()==[str(attachment.resolve())], 'File clipboard round trip failed'
            result['attachmentClipboard']=True
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
        startup_log('WebView2 startup error: '+str(error))
        if not args.smoke_test:
            ctypes.windll.user32.MessageBoxW(None,
                f'无法启动 {app_name()}。\n\n' + str(error) + '\n\n启动日志：'+str(data/'startup.log'),
                app_name(), 0x10)
    finally:
        server.speech.stop();server.shutdown()
        server.server_close()
        if args.smoke_result:
            args.smoke_result.parent.mkdir(parents=True, exist_ok=True)
            args.smoke_result.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    return 0 if not args.smoke_test or result['ok'] else 1


def startup_log(message):
    if LOG_FOLDER is None: return
    folder=LOG_FOLDER
    folder.mkdir(parents=True,exist_ok=True)
    with (folder/'startup.log').open('a',encoding='utf-8') as log:
        log.write(time.strftime('%Y-%m-%d %H:%M:%S ') + str(message) + '\n')


def launch():
    try:
        return main()
    except Exception:
        import traceback
        details=traceback.format_exc()
        try:startup_log(details)
        except OSError:pass
        if os.name=='nt':
            ctypes.windll.user32.MessageBoxW(None,
                '无法启动提示蜂。\n\n'+details.splitlines()[-1]+
                ('\n\n启动日志：'+str(LOG_FOLDER/'startup.log') if LOG_FOLDER else ''), app_name(), 0x10)
        return 1


if __name__ == '__main__':
    raise SystemExit(launch())
