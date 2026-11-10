"""Transparent WebView2 companion, native pointer tracking and instant window switching."""
import ctypes as C
from ctypes import wintypes as W
import json
import threading
from .branding import app_name, ui_language
from .floating import FloatingPreferences, ORB_WIDTH, ORB_HEIGHT


class WindowsFloating:
    def __init__(self,webview,window,url,data,close):
        self.window,self.close=window,close
        self.preferences=FloatingPreferences(data)
        self.completed_switches=0;self.mode='editor';self.ready=False;self.orb_rect=None
        self.lock=threading.RLock();self.stop=threading.Event();self.allow_close=False
        owner=self
        class Api:
            def mascot(self,msg):owner.command(msg)
        self.orb=webview.create_window(app_name(),url+'mascot.html?host=windows&lang='+ui_language(),js_api=Api(),
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
        self.emit('settings',{'enabled':self.preferences.enabled,'direction':self.preferences.direction});self.emit('pause')

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
        if action=='ready':
            self.ready=True
            self.emit('settings',{'enabled':self.preferences.enabled,'direction':self.preferences.direction})
            if self.mode=='editor':self.emit('pause')
        elif action=='collapse':self.collapse()
        elif action=='menu':self.input_region(True)
        elif action=='menuClose':self.input_region(False)
        elif action=='scene':
            self.input_region(True)
        elif action=='sceneEnd':
            self.input_region(False)
        elif action=='open':self.open()
        elif action=='settings':
            self.preferences.save(msg.get('enabled',True),msg.get('direction'))
            if self.mode=='orb':self.input_region(False)
        elif action=='hide':self.hide()
        elif action=='minimize':self.collapse()
        elif action=='maximize':self.toggle_maximize()
        elif action=='close':self.close()
        elif action=='drag' and self.mode=='orb':
            r=self.rect(self.orb);self.orb.move(int(r[0]+msg.get('dx',0)),int(r[1]+msg.get('dy',0)));self.orb_rect=self.rect(self.orb)

    def input_region(self,full=False):
        user,gdi=C.windll.user32,C.windll.gdi32
        user.SetWindowRgn.argtypes=[W.HWND,W.HRGN,W.BOOL]
        hwnd=int(self.orb.native.Handle.ToInt64())
        if full:user.SetWindowRgn(hwnd,None,True);return
        gdi.CreateRoundRectRgn.argtypes=[C.c_int]*6;gdi.CreateRoundRectRgn.restype=W.HRGN
        scale=float(self.orb.native._scale);cx=ORB_WIDTH/2;cy=ORB_HEIGHT/2
        region=gdi.CreateRoundRectRgn(round((cx-220)*scale),round((cy-175)*scale),round((cx+220)*scale),round((cy+105)*scale),24,24)
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
            if not self.orb_rect:
                x,y,w,h=self.rect(self.window)
                self.orb_rect=(x+w-ORB_WIDTH+70,y+h-ORB_HEIGHT+50,ORB_WIDTH,ORB_HEIGHT)
            self.mode='orb';self.completed_switches+=1
            self.place(self.orb_rect);self.orb.show();self.input_region(False)
            self.emit('show');self.window.hide()

    def open(self):
        with self.lock:
            if self.mode!='orb':return
            self.orb_rect=self.rect(self.orb);self.mode='editor';self.completed_switches+=1
            self.window.show();self.orb.hide();self.emit('pause')

    def hide(self):
        self.orb.hide();self.emit('pause');self.window.show();self.window.minimize();self.mode='editor'
