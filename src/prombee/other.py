"""Device preferences and user-selected destinations for successful prompt copies."""
import ast
import ctypes
from ctypes import wintypes
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import threading
from urllib.parse import urlsplit
from .library import atomic_write
from .filelock import exclusive_file_lock


def clean_environment():
    env=os.environ.copy()
    if 'LD_LIBRARY_PATH_ORIG' in env:env['LD_LIBRARY_PATH']=env['LD_LIBRARY_PATH_ORIG']
    else:env.pop('LD_LIBRARY_PATH',None)
    env.pop('WEBKIT_EXEC_PATH',None)
    env['PYINSTALLER_RESET_ENVIRONMENT']='1'
    bundle=getattr(sys,'_MEIPASS',None)
    if bundle and env.get('PATH'):
        root=str(Path(bundle).resolve()).casefold()
        env['PATH']=os.pathsep.join(p for p in env['PATH'].split(os.pathsep) if p and not (str(Path(p).resolve()).casefold()==root or str(Path(p).resolve()).casefold().startswith(root+os.sep)))
    return env


def launch_context():
    from gi.repository import Gio
    context=Gio.AppLaunchContext()
    cleaned=clean_environment()
    for key in ('LD_LIBRARY_PATH','WEBKIT_EXEC_PATH','PATH','PYINSTALLER_RESET_ENVIRONMENT'):
        if key in cleaned:context.setenv(key,cleaned[key])
        else:context.unsetenv(key)
    return context


def valid_url(value):
    if not isinstance(value,str) or len(value)>4096: raise ValueError('请输入有效的网页地址')
    parsed=urlsplit(value.strip())
    if parsed.scheme not in ('http','https') or not parsed.hostname: raise ValueError('网页地址须以 http:// 或 https:// 开头')
    return value.strip()


class DeviceTargets:
    def __init__(self):
        self.apps={}
        self.lock=threading.RLock()

    def xprop(self):
        bundled=Path(getattr(sys,'_MEIPASS',''))/'xprop'
        return str(bundled) if getattr(sys,'frozen',False) and bundled.is_file() else shutil.which('xprop')

    def run_xprop(self,*arguments):
        executable=self.xprop()
        if not executable or not os.environ.get('DISPLAY'): return ''
        result=subprocess.run([executable,*arguments],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=3,env=clean_environment())
        return result.stdout if result.returncode==0 else ''

    def linux_window(self,xid):
        if not re.fullmatch(r'0x[0-9a-fA-F]+',xid):return None
        raw=self.run_xprop('-id',xid,'_NET_WM_NAME','WM_NAME','WM_CLASS','_NET_WM_PID','_NET_WM_WINDOW_TYPE')
        properties={}
        for line in raw.splitlines():
            if ' = ' in line:
                key,value=line.split(' = ',1);properties[key.split('(')[0]]=value
        if any(value in properties.get('_NET_WM_WINDOW_TYPE','') for value in ('DESKTOP','DOCK','TOOLTIP','NOTIFICATION')):return None
        def literal(value):
            try:return ast.literal_eval('['+value+']')
            except (ValueError,SyntaxError):return []
        names=literal(properties.get('_NET_WM_NAME',properties.get('WM_NAME','')))
        classes=literal(properties.get('WM_CLASS',''))
        pid=properties.get('_NET_WM_PID','').strip()
        if not names or not isinstance(names[0],str) or not names[0].strip() or not pid.isdigit() or int(pid)==os.getpid():return None
        return {'kind':'window','id':'x11:'+str(int(xid,16)), 'name':names[0][:300],
                'identity':str(classes[-1]) if classes else '', 'pid':int(pid)}

    def windows(self):
        if sys.platform=='win32':return self.windows_native()
        raw=self.run_xprop('-root','_NET_CLIENT_LIST_STACKING') or self.run_xprop('-root','_NET_CLIENT_LIST')
        result=[]
        for xid in re.findall(r'0x[0-9a-fA-F]+',raw)[-150:]:
            window=self.linux_window(xid)
            if window:result.append(window)
        return list(reversed(result))

    def windows_native(self):
        user=ctypes.windll.user32;kernel=ctypes.windll.kernel32
        user.IsWindowVisible.argtypes=[wintypes.HWND];user.GetWindowTextLengthW.argtypes=[wintypes.HWND]
        user.GetWindowTextW.argtypes=[wintypes.HWND,wintypes.LPWSTR,ctypes.c_int]
        user.GetWindowThreadProcessId.argtypes=[wintypes.HWND,ctypes.POINTER(wintypes.DWORD)]
        kernel.OpenProcess.argtypes=[wintypes.DWORD,wintypes.BOOL,wintypes.DWORD];kernel.OpenProcess.restype=wintypes.HANDLE
        kernel.QueryFullProcessImageNameW.argtypes=[wintypes.HANDLE,wintypes.DWORD,wintypes.LPWSTR,ctypes.POINTER(wintypes.DWORD)]
        kernel.CloseHandle.argtypes=[wintypes.HANDLE]
        result=[]
        callback_type=ctypes.WINFUNCTYPE(wintypes.BOOL,wintypes.HWND,wintypes.LPARAM)
        @callback_type
        def callback(hwnd,_):
            if not user.IsWindowVisible(hwnd):return True
            length=user.GetWindowTextLengthW(hwnd)
            if not length:return True
            pid=wintypes.DWORD();user.GetWindowThreadProcessId(hwnd,ctypes.byref(pid))
            if pid.value==os.getpid():return True
            name=ctypes.create_unicode_buffer(length+1);user.GetWindowTextW(hwnd,name,length+1)
            identity=''
            handle=kernel.OpenProcess(0x1000,False,pid.value)
            if handle:
                try:
                    size=wintypes.DWORD(32768);path=ctypes.create_unicode_buffer(size.value)
                    if kernel.QueryFullProcessImageNameW(handle,0,path,ctypes.byref(size)):identity=Path(path.value).name
                finally:kernel.CloseHandle(handle)
            result.append({'kind':'window','id':'win:'+str(int(hwnd)),'name':name.value[:300],'identity':identity,'pid':pid.value})
            return True
        user.EnumWindows.argtypes=[callback_type,wintypes.LPARAM]
        user.EnumWindows(callback,0)
        return result

    def applications(self):
        apps={};result=[]
        if sys.platform=='win32':
            roots=[Path(os.environ[key])/'Microsoft/Windows/Start Menu/Programs' for key in ('APPDATA','PROGRAMDATA') if os.environ.get(key)]
            for root in roots:
                if not root.is_dir():continue
                for path in sorted(root.rglob('*.lnk')):
                    key='app:'+hashlib.sha256(str(path).encode()).hexdigest()[:24]
                    apps[key]=path;result.append({'kind':'application','id':key,'name':path.stem,'identity':''})
        else:
            try:
                from gi.repository import Gio
                for app in Gio.AppInfo.get_all():
                    key=app.get_id()
                    if not key or not app.should_show() or key=='prombee.desktop':continue
                    key='app:'+key;apps[key]=app
                    identity=app.get_startup_wm_class() if hasattr(app,'get_startup_wm_class') else None
                    result.append({'kind':'application','id':key,'name':app.get_display_name(),
                                   'identity':identity or app.get_id().removesuffix('.desktop')})
            except ImportError:pass
        with self.lock:self.apps=apps
        return sorted(result,key=lambda value:value['name'].casefold())

    def catalog(self):
        windows=self.windows();apps=self.applications()
        return {'windows':windows,'applications':apps}

    def activate_window(self,target):
        if sys.platform=='win32':
            candidates=self.windows_native()
            current=next((w for w in candidates if w['id']==target['id'] and w['pid']==target['pid']),None)
        else:
            number=target.get('id','').removeprefix('x11:')
            current=self.linux_window(hex(int(number))) if number.isdigit() else None
            if current and current['pid']!=target.get('pid'):current=None
        if current is None:
            current=next((w for w in self.windows() if w['identity']==target.get('identity') and w['name']==target.get('name')),None)
        if not current:raise ValueError('目标窗口已关闭，请在其他设置中重新选择')
        if sys.platform=='win32':
            user=ctypes.windll.user32;hwnd=wintypes.HWND(int(current['id'].split(':')[1]))
            user.IsIconic.argtypes=[wintypes.HWND];user.ShowWindowAsync.argtypes=[wintypes.HWND,ctypes.c_int]
            user.SetForegroundWindow.argtypes=[wintypes.HWND];user.SetForegroundWindow.restype=wintypes.BOOL
            if user.IsIconic(hwnd):user.ShowWindowAsync(hwnd,9)
            if not user.SetForegroundWindow(hwnd):raise ValueError('系统未允许切换到该窗口')
        else:
            from .floating_gtk import XDesktop
            desktop=XDesktop()
            try:
                atom=desktop.x.XInternAtom(desktop.display,b'_NET_ACTIVE_WINDOW',0)
                desktop.message(int(current['id'].split(':')[1]),atom,[2,0,0,0,0])
                desktop.x.XFlush(desktop.display)
            finally:desktop.x.XCloseDisplay(desktop.display)

    def startfile(self,path):
        # Restore the system loader while launching an external app from a frozen build.
        with self.lock:
            kernel=ctypes.windll.kernel32
            kernel.GetDllDirectoryW.argtypes=[wintypes.DWORD,wintypes.LPWSTR]
            kernel.SetDllDirectoryW.argtypes=[wintypes.LPCWSTR]
            original=ctypes.create_unicode_buffer(32768)
            kernel.GetDllDirectoryW(len(original),original)
            old_path=os.environ.get('PATH')
            cleaned=clean_environment()
            kernel.SetDllDirectoryW(None)
            try:
                if 'PATH' in cleaned:os.environ['PATH']=cleaned['PATH']
                os.startfile(str(path))
            finally:
                kernel.SetDllDirectoryW(original.value or None)
                if old_path is None:os.environ.pop('PATH',None)
                else:os.environ['PATH']=old_path

    def activate(self,target):
        if target['kind']=='window':self.activate_window(target)
        elif target['kind']=='url':
            url=valid_url(target['url'])
            if sys.platform=='win32':self.startfile(url)
            else:
                from gi.repository import Gio
                if not Gio.AppInfo.launch_default_for_uri(url,launch_context()):raise ValueError('无法打开目标网页')
        elif target['kind']=='application':
            self.applications()
            with self.lock:app=self.apps.get(target['id'])
            if app is None:raise ValueError('目标应用已移除，请重新选择')
            identity=target.get('identity','').casefold()
            window=next((w for w in self.windows() if identity and identity in w['identity'].casefold().split('.')),None)
            if window:self.activate_window(window)
            elif sys.platform=='win32':self.startfile(app)
            elif not app.launch([],launch_context()):raise ValueError('无法打开目标应用')
        else:raise ValueError('跳转目标无效')


class OtherSettings:
    def __init__(self,folder,targets=None):
        self.path=Path(folder)/'other.json';self.targets=targets or DeviceTargets()
    def load(self):
        try:
            value=json.loads(self.path.read_text(encoding='utf-8'))
            if not isinstance(value,dict) or not isinstance(value.get('enabled'),bool):raise ValueError()
            return {'enabled':value['enabled'],'target':value.get('target'),'recognizeMarkdown':value.get('recognizeMarkdown') is not False}
        except (OSError,ValueError):return {'enabled':False,'target':None,'recognizeMarkdown':True}
    def snapshot(self):return {**self.load(),**self.targets.catalog()}
    def save(self,payload):
        enabled=payload.get('enabled');target=payload.get('target')
        if not isinstance(enabled,bool):raise ValueError('跳转开关无效')
        if target is not None:
            if not isinstance(target,dict):raise ValueError('请选择跳转目标')
            if target.get('kind')=='url':
                url=valid_url(target.get('url'));target={'kind':'url','url':url,'name':url}
            else:
                catalog=self.targets.catalog();available=catalog['windows']+catalog['applications']
                found=next((t for t in available if t['kind']==target.get('kind') and t['id']==target.get('id')),None)
                if not found:
                    previous=self.load()['target']
                    if not enabled and isinstance(previous,dict) and previous.get('id')==target.get('id'):found=previous
                    else:raise ValueError('目标已不可用，请刷新后重新选择')
                target=found
        if enabled and target is None:raise ValueError('请先选择跳转目标')
        self.path.parent.mkdir(parents=True,exist_ok=True)
        with exclusive_file_lock(self.path.with_suffix('.lock')):
            recognize=payload.get('recognizeMarkdown',self.load()['recognizeMarkdown'])
            if not isinstance(recognize,bool):raise ValueError('Markdown 开关无效')
            result={'enabled':enabled,'target':target,'recognizeMarkdown':recognize}
            atomic_write(self.path,json.dumps(result,ensure_ascii=False))
        return result
    def markdown(self,value):
        if not isinstance(value,bool):raise ValueError('Markdown 开关无效')
        self.path.parent.mkdir(parents=True,exist_ok=True)
        with exclusive_file_lock(self.path.with_suffix('.lock')):
            result=self.load();result['recognizeMarkdown']=value
            atomic_write(self.path,json.dumps(result,ensure_ascii=False))
        return result
    def jump(self):
        value=self.load()
        if not value['enabled']:return {'jumped':False}
        if not value['target']:raise ValueError('请先设置复制后的跳转目标')
        try:self.targets.activate(value['target'])
        except Exception as error:raise ValueError('跳转失败：'+str(error)) from error
        return {'jumped':True}
