"""GTK transparent desktop companion; X11 also works through XWayland."""
import base64
import ctypes as C
import ctypes.util
import json
from .floating import FloatingPreferences, ORB_WIDTH, ORB_HEIGHT, morph_layout


class XDesktop:
    def __init__(self):
        self.x = C.CDLL(ctypes.util.find_library('X11'))
        definitions = {
            'XOpenDisplay': ([C.c_char_p], C.c_void_p),
            'XDefaultRootWindow': ([C.c_void_p], C.c_ulong),
            'XTranslateCoordinates': ([C.c_void_p,C.c_ulong,C.c_ulong,C.c_int,C.c_int,C.POINTER(C.c_int),C.POINTER(C.c_int),C.POINTER(C.c_ulong)],C.c_int),
            'XMoveResizeWindow': ([C.c_void_p,C.c_ulong,C.c_int,C.c_int,C.c_uint,C.c_uint],C.c_int),
            'XInternAtom': ([C.c_void_p,C.c_char_p,C.c_int],C.c_ulong),
            'XChangeProperty': ([C.c_void_p,C.c_ulong,C.c_ulong,C.c_ulong,C.c_int,C.c_int,C.c_void_p,C.c_int],C.c_int),
            'XQueryPointer': ([C.c_void_p,C.c_ulong,C.POINTER(C.c_ulong),C.POINTER(C.c_ulong),C.POINTER(C.c_int),C.POINTER(C.c_int),C.POINTER(C.c_int),C.POINTER(C.c_int),C.POINTER(C.c_uint)],C.c_int),
            'XFlush': ([C.c_void_p],C.c_int),
            'XCloseDisplay': ([C.c_void_p],C.c_int),
        }
        for name,(args,result) in definitions.items():
            fn=getattr(self.x,name);fn.argtypes=args;fn.restype=result
        self.display=self.x.XOpenDisplay(None)
        if not self.display: raise RuntimeError('悬浮球需要 X11 / XWayland 显示服务')
        self.root=self.x.XDefaultRootWindow(self.display)
        self.shape=C.CDLL(ctypes.util.find_library('Xext'))
        self.shape.XShapeCombineRectangles.argtypes=[C.c_void_p,C.c_ulong,C.c_int,C.c_int,C.c_int,C.c_void_p,C.c_int,C.c_int,C.c_int]

    def position(self,window):
        x,y,child=C.c_int(),C.c_int(),C.c_ulong()
        self.x.XTranslateCoordinates(self.display,window.get_surface().get_xid(),self.root,0,0,C.byref(x),C.byref(y),C.byref(child))
        scale=window.get_scale_factor()
        return (x.value/scale,y.value/scale,window.get_width(),window.get_height())

    def move(self,window,rect):
        scale=window.get_scale_factor()
        window.set_default_size(int(rect[2]),int(rect[3]))
        self.x.XMoveResizeWindow(self.display,window.get_surface().get_xid(),int(rect[0]*scale),int(rect[1]*scale),int(rect[2]*scale),int(rect[3]*scale))
        self.x.XFlush(self.display)

    def above(self,window):
        atom=lambda name:self.x.XInternAtom(self.display,name.encode(),0)
        value=(C.c_ulong*2)(atom('_NET_WM_STATE_ABOVE'),atom('_NET_WM_STATE_SKIP_TASKBAR'))
        self.x.XChangeProperty(self.display,window.get_surface().get_xid(),atom('_NET_WM_STATE'),4,32,0,value,2)
        self.x.XFlush(self.display)

    def input_region(self,window,full=False):
        class Rect(C.Structure):
            _fields_=[('x',C.c_short),('y',C.c_short),('width',C.c_ushort),('height',C.c_ushort)]
        scale=window.get_scale_factor()
        if full:r=Rect(0,0,65535,65535)
        else:r=Rect(round((ORB_WIDTH/2-110)*scale),round((ORB_HEIGHT/2-85)*scale),round(220*scale),round(170*scale))
        self.shape.XShapeCombineRectangles(self.display,window.get_surface().get_xid(),2,0,0,C.byref(r),1,0,0)
        self.x.XFlush(self.display)

    def cursor(self,scale=1):
        root,child=C.c_ulong(),C.c_ulong();rx,ry,wx,wy=C.c_int(),C.c_int(),C.c_int(),C.c_int();mask=C.c_uint()
        self.x.XQueryPointer(self.display,self.root,C.byref(root),C.byref(child),C.byref(rx),C.byref(ry),C.byref(wx),C.byref(wy),C.byref(mask))
        return rx.value/scale,ry.value/scale


class GtkFloating:
    def __init__(self,app,window,editor,url,data):
        from gi.repository import Gtk,Gdk,GLib,WebKit
        self.GLib,self.WebKit=GLib,WebKit
        self.app,self.editor,self.window=app,editor,window
        self.preferences=FloatingPreferences(data)
        self.completed_morphs=0;self.mode='editor';self.ready=False;self.pending=False;self.orb_rect=None;self.layout=None;self.scene_expanded=False
        self.x=XDesktop()
        self.orb=Gtk.ApplicationWindow(application=app,title='提示蜂 · 桌面悬浮球')
        self.orb.set_decorated(False);self.orb.set_default_size(ORB_WIDTH,ORB_HEIGHT)
        self.orb.add_css_class('prombee-orb')
        css=Gtk.CssProvider();css.load_from_data(b'window.prombee-orb {background: transparent; box-shadow:none; border:none;}')
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(),css,Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
        self.view=WebKit.WebView();rgba=Gdk.RGBA();rgba.parse('rgba(0,0,0,0)');self.view.set_background_color(rgba)
        self.orb.set_child(self.view)
        manager=self.view.get_user_content_manager();manager.register_script_message_handler('mascot',None)
        manager.connect('script-message-received::mascot',lambda m,v:self.command(json.loads(v.to_string())))
        self.orb.connect('close-request',lambda w:self.hide())
        self.view.load_uri(url+'mascot.html')
        self.orb.realize();self.x.above(self.orb)
        self.GLib.timeout_add(33,self.track)

    def emit(self,command,data=None):
        js='window.prombeeMascot?.receive('+json.dumps(command)+','+json.dumps(data or {})+')'
        self.view.evaluate_javascript(js,-1,None,None,None,None,None)

    def track(self):
        if self.mode=='orb':
            x,y=self.x.cursor(self.orb.get_scale_factor());r=self.x.position(self.orb)
            self.emit('cursor',dict(x=x-r[0],y=y-r[1]))
        return True

    def command(self,msg):
        action=msg.get('action')
        if action=='ready':
            self.ready=True;self.emit('settings',{'enabled':self.preferences.enabled})
            if self.pending:self.pending=False;self.collapse()
        elif action=='collapse':self.collapse()
        elif action=='menu':self.x.input_region(self.orb,True)
        elif action=='menuClose':self.x.input_region(self.orb,self.scene_expanded)
        elif action=='scene':
            self.scene_bounds(msg.get('index')==3)
            self.x.input_region(self.orb,True)
        elif action=='sceneEnd':
            self.scene_bounds(False);self.x.input_region(self.orb)
        elif action=='open':self.open()
        elif action=='morphDone':
            self.completed_morphs+=1;self.finished(msg.get('direction'))
        elif action=='hide':self.hide()
        elif action=='settings':
            self.preferences.save(msg.get('enabled',True));self.scene_bounds(False)
            if self.mode=='orb':self.x.input_region(self.orb)
        elif action=='drag' and self.mode=='orb' and not self.scene_expanded:
            r=self.x.position(self.orb);self.orb_rect=(r[0]+msg.get('dx',0),r[1]+msg.get('dy',0),ORB_WIDTH,ORB_HEIGHT);self.x.move(self.orb,self.orb_rect)

    def scene_bounds(self,expand):
        if self.mode!='orb':return
        if expand and not self.scene_expanded:
            from gi.repository import Gdk
            self.orb_rect=self.x.position(self.orb)
            monitor=Gdk.Display.get_default().get_monitor_at_surface(self.orb.get_surface()).get_geometry()
            self.scene_expanded=True
            self.x.move(self.orb,(monitor.x,monitor.y,monitor.width,monitor.height))
            self.emit('anchor',{'x':self.orb_rect[0]-monitor.x+ORB_WIDTH/2,'y':self.orb_rect[1]-monitor.y+ORB_HEIGHT/2})
        elif not expand and self.scene_expanded:
            self.scene_expanded=False;self.x.move(self.orb,self.orb_rect);self.emit('anchor')

    def collapse(self):
        if self.mode!='editor':return
        if not self.ready:self.pending=True;return
        self.mode='preparing'
        self.editor.evaluate_javascript('JSON.stringify(window.prombeeLogoTarget())',-1,None,None,None,self.got_logo,None)

    def got_logo(self,view,result,_):
        try:
            logo=json.loads(view.evaluate_javascript_finish(result).to_string())
            self.editor_rect=self.x.position(self.window)
            self.top=self.window.get_height()-self.editor.get_height()
            logo['y']+=self.top
            if not self.orb_rect:
                x,y,w,h=self.editor_rect
                self.orb_rect=(x+w-ORB_WIDTH+70,y+h-ORB_HEIGHT+50,ORB_WIDTH,ORB_HEIGHT)
            self.layout,self.payload=morph_layout(self.editor_rect,self.orb_rect,logo)
            self.payload['top']=self.top
            self.editor.get_snapshot(self.WebKit.SnapshotRegion.VISIBLE,self.WebKit.SnapshotOptions.NONE,None,self.captured,None)
        except Exception:
            self.mode='editor';self.window.present();raise

    def captured(self,view,result,_):
        texture=view.get_snapshot_finish(result)
        self.payload['snapshot']='data:image/png;base64,'+base64.b64encode(texture.save_to_png_bytes().get_data()).decode()
        self.orb.present();self.x.move(self.orb,self.layout);self.x.above(self.orb)
        # Wait a frame for the compositor and canvas to adopt the expanded bounds.
        self.GLib.timeout_add(50,self.animate_close)

    def animate_close(self):
        self.x.move(self.orb,self.layout)
        self.x.input_region(self.orb,True)
        self.emit('morph',{**self.payload,'direction':'close'})
        self.window.set_visible(False);self.mode='closing';self.watchdog('closing');return False

    def open(self):
        if self.mode!='orb':
            if self.mode=='editor':self.window.present()
            return
        self.scene_bounds(False)
        self.orb_rect=self.x.position(self.orb)
        # Recalculate union if the user dragged the companion between transitions.
        logo={'x':self.payload['to']['x']+self.layout[0]-self.editor_rect[0], 'y':self.payload['to']['y']+self.layout[1]-self.editor_rect[1]}
        self.layout,new=morph_layout(self.editor_rect,self.orb_rect,logo);self.payload.update(new)
        self.x.move(self.orb,self.layout);self.mode='opening'
        self.GLib.timeout_add(50,self.animate_open)

    def animate_open(self):
        self.x.move(self.orb,self.layout)
        self.x.input_region(self.orb,True)
        self.emit('morph',{**self.payload,'direction':'open'});self.watchdog('opening');return False

    def watchdog(self,mode):
        def finish():
            if self.mode==mode:self.finished('open' if mode=='opening' else 'close')
            return False
        self.GLib.timeout_add(2000,finish)

    def finished(self,direction):
        if direction=='close' and self.mode=='closing':
            self.x.move(self.orb,self.orb_rect);self.emit('show');self.mode='orb'
            self.x.input_region(self.orb)
        elif direction=='open' and self.mode=='opening':
            self.window.present();self.orb.set_visible(False);self.emit('pause');self.mode='editor'

    def hide(self):
        self.scene_bounds(False)
        self.orb.set_visible(False);self.emit('pause');self.window.present();self.window.minimize();self.mode='editor';return True
