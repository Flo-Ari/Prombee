"""Transparent WebView2 companion, native pointer tracking and instant window switching."""
import ctypes as C
from ctypes import wintypes as W
import json
import os
import threading
from .hit_regions import bounded_regions
from .branding import app_name, ui_language
from .floating import FloatingPreferences, ORB_WIDTH, ORB_HEIGHT


class WindowsFloating:
    def __init__(self,webview,window,url,data,close):
        self.window,self.close=window,close
        self.preferences=FloatingPreferences(data)
        self.background=False;self.hidden_by_user=False;self.focus_seen=False;self.was_foreground=False;self.focus_suspended=False
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
            try:
                self.check_foreground()
                if self.mode!='orb':continue
                p=W.POINT();C.windll.user32.GetCursorPos(C.byref(p));r=self.rect(self.orb)
                scale=float(self.orb.native._scale)
                self.emit('cursor',dict(x=p.x/scale-r[0],y=p.y/scale-r[1]))
            except Exception:pass

    def preferences_changed(self):
        self.preferences.reload()
        if not self.preferences.orb_enabled and self.mode=='orb':
            if self.background:self.dismiss_background()
            else:self.open()

    def check_foreground(self):
        if self.allow_close or self.focus_suspended or not self.ready:return
        user=C.windll.user32
        user.GetForegroundWindow.restype=W.HWND
        user.GetWindowThreadProcessId.argtypes=[W.HWND,C.POINTER(W.DWORD)]
        foreground=user.GetForegroundWindow()
        main=int(self.window.native.Handle.ToInt64())
        if foreground==main:
            self.focus_seen=True;self.hidden_by_user=False
            if self.mode=='orb' and self.background:self.dismiss_background()
        elif self.was_foreground and self.focus_seen and foreground:
            pid=W.DWORD();user.GetWindowThreadProcessId(foreground,C.byref(pid))
            if (pid.value!=os.getpid() and self.preferences.orb_enabled
                and not self.hidden_by_user and self.mode=='editor'):
                self.collapse(background=True)
        self.was_foreground=foreground==main

    def dismiss_background(self):
        with self.lock:
            self.orb_rect=self.rect(self.orb);self.mode='editor';self.background=False
            self.orb.hide();self.emit('pause')

    def command(self,msg):
        action=msg.get('action')
        if action=='ready':
            self.ready=True
            self.emit('settings',{'enabled':self.preferences.enabled,'direction':self.preferences.direction})
            if self.mode=='editor':self.emit('pause')
        elif action=='collapse':self.collapse()
        elif action=='windowDrag':
            user=C.windll.user32
            user.SendMessageW.argtypes=[W.HWND,W.UINT,W.WPARAM,W.LPARAM]
            user.SendMessageW.restype=C.c_ssize_t
            user.ReleaseCapture()
            user.SendMessageW(int(self.window.native.Handle.ToInt64()),0xA1,2,0) # WM_NCLBUTTONDOWN / HTCAPTION
        elif action=='menu':self.input_region(True)
        elif action=='menuClose':self.input_region(False)
        elif action=='hitRegion':
            self.hit_rectangles=bounded_regions(msg.get('rectangles'))
            self.input_region(False)
        elif action=='scene':pass
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
        if not hasattr(self,'hit_rectangles'):return
        gdi.CreateRectRgn.argtypes=[C.c_int]*4;gdi.CreateRectRgn.restype=W.HRGN
        gdi.CombineRgn.argtypes=[W.HRGN,W.HRGN,W.HRGN,C.c_int]
        gdi.DeleteObject.argtypes=[W.HGDIOBJ]
        scale=float(self.orb.native._scale)
        region=gdi.CreateRectRgn(0,0,0,0)
        for x,y,w,h in getattr(self,'hit_rectangles',[]):
            part=gdi.CreateRectRgn(round(x*scale),round(y*scale),round((x+w)*scale),round((y+h)*scale))
            gdi.CombineRgn(region,region,part,2);gdi.DeleteObject(part)
        # Ownership of a successful region is transferred to Windows.
        if not user.SetWindowRgn(hwnd,region,True):
            gdi.DeleteObject.argtypes=[W.HGDIOBJ];gdi.DeleteObject(region)

    def toggle_maximize(self):
        if getattr(self,'maximized',False):self.window.restore()
        else:self.window.maximize()
        self.maximized=not getattr(self,'maximized',False)

    def collapse(self,background=False):
        if not self.preferences.orb_enabled:
            self.window.minimize();return
        with self.lock:
            if self.mode!='editor' or not self.ready:return
            if not self.orb_rect:
                x,y,w,h=self.rect(self.window)
                self.orb_rect=(x+w-ORB_WIDTH+70,y+h-ORB_HEIGHT+50,ORB_WIDTH,ORB_HEIGHT)
            self.background=background;self.hidden_by_user=False
            self.mode='orb';self.completed_switches+=1
            self.place(self.orb_rect)
            if background:
                user=C.windll.user32;user.ShowWindow.argtypes=[W.HWND,C.c_int]
                user.ShowWindow(int(self.orb.native.Handle.ToInt64()),4) # SW_SHOWNOACTIVATE
            else:self.orb.show()
            self.input_region(False);self.emit('show')
            if not background:self.window.hide()

    def open(self):
        with self.lock:
            if self.mode!='orb':return
            self.orb_rect=self.rect(self.orb);self.mode='editor';self.background=False;self.completed_switches+=1
            self.window.show();self.orb.hide();self.emit('pause')

    def hide(self):
        self.hidden_by_user=True;self.background=False
        self.orb.hide();self.emit('pause');self.window.show();self.window.minimize();self.mode='editor'
