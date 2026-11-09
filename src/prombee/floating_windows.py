"""Transparent WebView2 companion, native pointer tracking and window snapshots."""
import base64
import ctypes as C
from ctypes import wintypes as W
import json
import struct
import threading
import time
import zlib
from .floating import FloatingPreferences, ORB_WIDTH, ORB_HEIGHT, morph_layout


def capture_window(window):
    """Capture only this application window; no desktop or other apps are recorded."""
    user,gdi=C.windll.user32,C.windll.gdi32
    hwnd=int(window.native.Handle.ToInt64())
    user.GetWindowDC.argtypes=[W.HWND];user.GetWindowDC.restype=W.HDC
    user.ReleaseDC.argtypes=[W.HWND,W.HDC]
    user.PrintWindow.argtypes=[W.HWND,W.HDC,W.UINT]
    gdi.CreateCompatibleDC.argtypes=[W.HDC];gdi.CreateCompatibleDC.restype=W.HDC
    gdi.CreateCompatibleBitmap.argtypes=[W.HDC,C.c_int,C.c_int];gdi.CreateCompatibleBitmap.restype=W.HBITMAP
    gdi.SelectObject.argtypes=[W.HDC,W.HGDIOBJ];gdi.SelectObject.restype=W.HGDIOBJ
    gdi.GetDIBits.argtypes=[W.HDC,W.HBITMAP,W.UINT,W.UINT,C.c_void_p,C.c_void_p,W.UINT]
    gdi.DeleteObject.argtypes=[W.HGDIOBJ];gdi.DeleteDC.argtypes=[W.HDC]
    r=W.RECT();user.GetWindowRect(W.HWND(hwnd),C.byref(r));w,h=r.right-r.left,r.bottom-r.top
    dc=user.GetWindowDC(hwnd);memory=gdi.CreateCompatibleDC(dc);bitmap=gdi.CreateCompatibleBitmap(dc,w,h);old=gdi.SelectObject(memory,bitmap)
    try:
        if not user.PrintWindow(hwnd,memory,2):raise OSError('Window capture failed')
        gdi.SelectObject(memory,old)
        # Top-down BGRA -> RGB PNG. No third-party imaging dependency.
        header=struct.pack('<IiiHHIIiiII',40,w,-h,1,32,0,w*h*4,0,0,0,0)
        info=C.create_string_buffer(header);pixels=C.create_string_buffer(w*h*4)
        if not gdi.GetDIBits(memory,bitmap,0,h,pixels,info,0):raise OSError('Window bitmap read failed')
        raw=pixels.raw;rows=[]
        for y in range(h):
            row=raw[y*w*4:(y+1)*w*4];rgb=bytearray(w*3)
            rgb[0::3]=row[2::4];rgb[1::3]=row[1::4];rgb[2::3]=row[0::4];rows.append(b'\0'+rgb)
        def chunk(kind,data):return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)
        png=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',w,h,8,2,0,0,0))+chunk(b'IDAT',zlib.compress(b''.join(rows),3))+chunk(b'IEND',b'')
        return 'data:image/png;base64,'+base64.b64encode(png).decode()
    finally:
        gdi.DeleteObject(bitmap);gdi.DeleteDC(memory);user.ReleaseDC(hwnd,dc)


class WindowsFloating:
    def __init__(self,webview,window,url,data,close):
        self.window,self.close=window,close
        self.preferences=FloatingPreferences(data)
        self.transition=0;self.completed_morphs=0;self.mode='editor';self.ready=False;self.orb_rect=None;self.payload=None;self.layout=None
        self.lock=threading.RLock();self.stop=threading.Event();self.allow_close=False
        owner=self
        class Api:
            def mascot(self,msg):owner.command(msg)
        self.orb=webview.create_window('提示蜂 · 桌面悬浮球',url+'mascot.html',js_api=Api(),
            width=ORB_WIDTH,height=ORB_HEIGHT,min_size=(100,100),hidden=True,
            frameless=True,easy_drag=False,transparent=True,on_top=True,shadow=False,text_select=False)
        self.orb.events.loaded+=self.loaded
        self.orb.events.closing+=self.on_closing
        self.thread=threading.Thread(target=self.track,daemon=True);self.thread.start()

    def on_closing(self):
        if self.allow_close:return True
        self.hide();return False

    def rect(self,window):return (window.x,window.y,window.width,window.height)
    def place(self,rect):self.orb.move(int(rect[0]),int(rect[1]));self.orb.resize(int(rect[2]),int(rect[3]))
    def emit(self,command,data=None):
        self.orb.run_js('window.prombeeMascot?.receive('+json.dumps(command)+','+json.dumps(data or {})+')')
    def loaded(self):
        self.emit('settings',{'enabled':self.preferences.enabled,'direction':self.preferences.direction});self.emit('pause');self.ready=True

    def track(self):
        while not self.stop.wait(.033):
            if self.mode!='orb':continue
            try:
                p=W.POINT();C.windll.user32.GetCursorPos(C.byref(p));r=self.rect(self.orb)
                scale=float(self.orb.native._scale)
                self.emit('cursor',dict(x=p.x/scale-r[0],y=p.y/scale-r[1]))
            except Exception:pass

    def command(self,msg):
        action=msg.get('action')
        if action=='collapse':self.collapse()
        elif action=='menu':self.input_region(True)
        elif action=='menuClose':self.input_region(False)
        elif action=='scene':
            self.input_region(True)
        elif action=='sceneEnd':
            self.input_region(False)
        elif action=='open':self.open()
        elif action=='morphDone':
            self.completed_morphs+=1;self.finished(msg.get('direction'))
        elif action=='settings':
            self.preferences.save(msg.get('enabled',True),msg.get('direction'))
            if self.mode=='orb':self.input_region(False)
        elif action=='hide':self.hide()
        elif action=='minimize':self.window.minimize()
        elif action=='maximize':self.toggle_maximize()
        elif action=='close':self.close()
        elif action=='drag' and self.mode=='orb':
            r=self.rect(self.orb);self.orb.move(int(r[0]+msg.get('dx',0)),int(r[1]+msg.get('dy',0)));self.orb_rect=self.rect(self.orb)

    def input_region(self,full=False):
        user,gdi=C.windll.user32,C.windll.gdi32
        user.SetWindowRgn.argtypes=[W.HWND,W.HRGN,W.BOOL]
        hwnd=int(self.orb.native.Handle.ToInt64())
        if full:user.SetWindowRgn(hwnd,None,True);return
        gdi.CreateEllipticRgn.argtypes=[C.c_int,C.c_int,C.c_int,C.c_int];gdi.CreateEllipticRgn.restype=W.HRGN
        scale=float(self.orb.native._scale);cx=ORB_WIDTH/2;cy=ORB_HEIGHT/2
        region=gdi.CreateEllipticRgn(round((cx-175)*scale),round((cy-110)*scale),round((cx+175)*scale),round((cy+110)*scale))
        # Ownership of a successful region is transferred to Windows.
        if not user.SetWindowRgn(hwnd,region,True):
            gdi.DeleteObject.argtypes=[W.HGDIOBJ];gdi.DeleteObject(region)

    def toggle_maximize(self):
        if getattr(self,'maximized',False):self.window.restore()
        else:self.window.maximize()
        self.maximized=not getattr(self,'maximized',False)

    def collapse(self):
        with self.lock:
            if self.mode!='editor' or not self.ready:return
            self.transition+=1;self.mode='preparing'
        try:
            logo=json.loads(self.window.run_js('JSON.stringify(window.prombeeLogoTarget())'))
            self.editor_rect=self.rect(self.window)
            if not self.orb_rect:
                x,y,w,h=self.editor_rect;self.orb_rect=(x+w-ORB_WIDTH+70,y+h-ORB_HEIGHT+50,ORB_WIDTH,ORB_HEIGHT)
            self.layout,self.payload=morph_layout(self.editor_rect,self.orb_rect,logo,self.preferences.direction)
            self.payload['dark']=logo.get('dark',False)
            self.payload['snapshot']=capture_window(self.window)
            self.input_region(True);self.place(self.layout);self.orb.show();time.sleep(.05)
            self.mode='closing';self.emit('morph',{**self.payload,'direction':'close'});self.window.hide();self.watchdog('closing')
        except Exception:
            self.mode='editor';self.window.show();raise

    def open(self):
        with self.lock:
            if self.mode!='orb':return
            self.transition+=1;self.mode='opening'
        self.orb_rect=self.rect(self.orb)
        logo={'x':self.payload['to']['x']+self.layout[0]-self.editor_rect[0], 'y':self.payload['to']['y']+self.layout[1]-self.editor_rect[1]}
        self.layout,new=morph_layout(self.editor_rect,self.orb_rect,logo,self.preferences.direction);self.payload.update(new)
        self.input_region(True);self.place(self.layout);time.sleep(.05);self.emit('morph',{**self.payload,'direction':'open'});self.watchdog('opening')

    def watchdog(self,mode):
        token=self.transition
        def finish():
            if self.mode==mode and self.transition==token:self.finished('open' if mode=='opening' else 'close')
        timer=threading.Timer(2,finish);timer.daemon=True;timer.start()

    def finished(self,direction):
        with self.lock:
            if direction=='close' and self.mode=='closing':
                self.place(self.orb_rect);self.emit('show');self.mode='orb';self.input_region(False)
            elif direction=='open' and self.mode=='opening':
                self.window.show();self.orb.hide();self.emit('pause');self.mode='editor'

    def hide(self):
        self.orb.hide();self.emit('pause');self.window.show();self.window.minimize();self.mode='editor'
