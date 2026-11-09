"""GTK transparent desktop companion; X11 also works through XWayland."""
import base64
import ctypes as C
import ctypes.util
import json
import math
from .branding import app_name, ui_language
from .floating import FloatingPreferences, ORB_WIDTH, ORB_HEIGHT, morph_layout


class ClientData(C.Union):
    _fields_=[('b',C.c_char*20),('s',C.c_short*10),('l',C.c_long*5)]

class ClientMessage(C.Structure):
    _fields_=[('type',C.c_int),('serial',C.c_ulong),('send_event',C.c_int),
              ('display',C.c_void_p),('window',C.c_ulong),('message_type',C.c_ulong),
              ('format',C.c_int),('data',ClientData)]

class XEvent(C.Union):
    _fields_=[('client',ClientMessage),('pad',C.c_long*24)]


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
            'XSendEvent': ([C.c_void_p,C.c_ulong,C.c_int,C.c_long,C.POINTER(XEvent)],C.c_int),
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
        # Mapped windows must request WM state through ClientMessage (EWMH).
        # Replacing _NET_WM_STATE after mapping is ignored/overwritten by Mutter.
        atom=lambda name:self.x.XInternAtom(self.display,name.encode(),0)
        xid=window.get_surface().get_xid()
        states=['_NET_WM_STATE_ABOVE','_NET_WM_STATE_SKIP_TASKBAR',
                '_NET_WM_STATE_SKIP_PAGER','_NET_WM_STATE_STICKY']
        if not window.get_mapped():
            value=(C.c_ulong*len(states))(*(atom(name) for name in states))
            self.x.XChangeProperty(self.display,xid,atom('_NET_WM_STATE'),4,32,0,value,len(states))
            desktop=C.c_ulong(0xffffffff)
            self.x.XChangeProperty(self.display,xid,atom('_NET_WM_DESKTOP'),6,32,0,C.byref(desktop),1)
        else:
            for first,second in zip(states[::2],states[1::2]):
                self.message(xid,atom('_NET_WM_STATE'),[1,atom(first),atom(second),1,0])
            self.message(xid,atom('_NET_WM_DESKTOP'),[0xffffffff,1,0,0,0])
        self.x.XFlush(self.display)

    def message(self,xid,kind,values):
        event=XEvent()
        event.client.type=33;event.client.send_event=1
        event.client.display=self.display;event.client.window=xid
        event.client.message_type=kind;event.client.format=32
        event.client.data.l[:]=values
        self.x.XSendEvent(self.display,self.root,0,(1<<20)|(1<<19),C.byref(event))

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
        self.GLib,self.WebKit,self.Gtk,self.Gdk=GLib,WebKit,Gtk,Gdk
        self.hidden_by_user=False
        self.menu_open=False;self.drag_press=None;self.drag_started=False;self.last_cursor=None
        self.app,self.editor,self.window=app,editor,window
        self.preferences=FloatingPreferences(data)
        self.transition=0;self.completed_morphs=0;self.mode='editor';self.ready=False;self.pending=False;self.orb_rect=None;self.layout=None
        self.x=XDesktop()
        self.orb=Gtk.Window(title=app_name())
        app.add_window(self.orb)
        self.orb.set_decorated(False);self.orb.set_default_size(ORB_WIDTH,ORB_HEIGHT)
        self.orb.add_css_class('prombee-orb')
        css=Gtk.CssProvider();css.load_from_data(b'window.prombee-orb {background: transparent; box-shadow:none; border:none;}')
        Gtk.StyleContext.add_provider_for_display(Gdk.Display.get_default(),css,Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION)
        self.view=WebKit.WebView();rgba=Gdk.RGBA();rgba.parse('rgba(0,0,0,0)');self.view.set_background_color(rgba)
        self.orb.set_child(self.view)
        # Handle the grab at the native parent, before WebKit's pointer capture.
        # The window manager owns movement; no JS/Python/resize loop runs per pixel.
        self.drag_gesture=Gtk.GestureDrag()
        self.drag_gesture.set_button(1)
        self.drag_gesture.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
        self.drag_gesture.connect('drag-begin',self.drag_begin)
        self.drag_gesture.connect('drag-update',self.drag_update)
        self.drag_gesture.connect('drag-end',self.drag_end)
        self.drag_gesture.connect('cancel',self.drag_cancel)
        self.orb.add_controller(self.drag_gesture)
        manager=self.view.get_user_content_manager();manager.register_script_message_handler('mascot',None)
        manager.connect('script-message-received::mascot',lambda m,v:self.command(json.loads(v.to_string())))
        self.orb.connect('close-request',lambda w:self.hide())
        self.view.load_uri(url+'mascot.html?host=gtk&lang='+ui_language())
        self.orb.realize();self.x.above(self.orb)
        self.orb.connect("map",lambda orb:self.x.above(orb))
        self.orb.get_surface().connect("notify::state",self.orb_state_changed)
        self.window.get_surface().connect("notify::state",self.editor_state_changed)
        self.GLib.timeout_add(33,self.track)

    def editor_state_changed(self,surface,_):
        minimized=bool(surface.get_state() & self.Gdk.ToplevelState.MINIMIZED)
        if not minimized and self.mode!='hidden':
            self.hidden_by_user=False
        elif self.mode=='editor' and not self.hidden_by_user:
            # Also handle taskbar / WM keyboard minimization. Restore without focus
            # so WebKit can capture a valid frame before hiding the editor.
            self.window.unminimize()
            self.collapse()

    def orb_state_changed(self,surface,_):
        if self.mode in ('orb','closing','opening'):
            if surface.get_state() & self.Gdk.ToplevelState.MINIMIZED:
                self.orb.unminimize()
            if not surface.get_state() & self.Gdk.ToplevelState.ABOVE:
                self.x.above(self.orb)

    def emit(self,command,data=None):
        js='window.prombeeMascot?.receive('+json.dumps(command)+','+json.dumps(data or {})+')'
        self.view.evaluate_javascript(js,-1,None,None,None,None,None)

    def track(self):
        if self.mode=='orb':
            x,y=self.x.cursor(self.orb.get_scale_factor());r=self.x.position(self.orb)
            cursor=(x-r[0],y-r[1])
            if cursor!=self.last_cursor:
                self.last_cursor=cursor;self.emit('cursor',dict(x=cursor[0],y=cursor[1]))
        return True

    def drag_begin(self,gesture,x,y):
        if self.mode!='orb' or self.menu_open:
            gesture.set_state(self.Gtk.EventSequenceState.DENIED);return
        self.drag_press=(gesture.get_current_event_device(),gesture.get_current_event_time(),x,y)
        self.drag_started=False
        gesture.set_state(self.Gtk.EventSequenceState.CLAIMED)
        self.view.grab_focus();self.emit('interaction')

    def drag_update(self,gesture,dx,dy):
        if self.drag_press is None or self.drag_started or math.hypot(dx,dy)<=5:return
        device,timestamp,x,y=self.drag_press
        if device is None:return
        self.drag_started=True
        self.orb.get_surface().begin_move(device,1,x,y,timestamp)

    def drag_end(self,gesture,dx,dy):
        if self.drag_press is None:return
        click=not self.drag_started and self.mode=='orb' and not self.menu_open
        self.drag_press=None;self.drag_started=False
        if click:self.open()

    def drag_cancel(self,gesture,sequence):
        self.drag_press=None;self.drag_started=False

    def command(self,msg):
        action=msg.get('action')
        if action=='ready':
            self.ready=True;self.emit('settings',{'enabled':self.preferences.enabled,'direction':self.preferences.direction,'nativeDrag':True})
            if self.pending:self.pending=False;self.collapse()
        elif action=='collapse':self.collapse()
        elif action=='menu':
            self.menu_open=True;self.x.input_region(self.orb,True)
        elif action=='menuClose':
            self.menu_open=False;self.x.input_region(self.orb)
        elif action=='scene':
            self.x.input_region(self.orb,True)
        elif action=='sceneEnd':
            self.x.input_region(self.orb)
        elif action=='open':self.open()
        elif action=='morphDone':
            self.completed_morphs+=1;self.finished(msg.get('direction'))
        elif action=='hide':self.hide()
        elif action=='settings':
            self.preferences.save(msg.get('enabled',True),msg.get('direction'))
            if self.mode=='orb':self.x.input_region(self.orb)

    def collapse(self):
        if self.mode!='editor':return
        if not self.ready:self.pending=True;return
        self.hidden_by_user=False
        self.transition+=1;self.mode='preparing'
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
            self.layout,self.payload=morph_layout(self.editor_rect,self.orb_rect,logo,self.preferences.direction)
            self.payload['top']=self.top
            self.payload['dark']=logo.get('dark',False)
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
        self.menu_open=False
        self.orb_rect=self.x.position(self.orb)
        # Recalculate union if the user dragged the companion between transitions.
        logo={'x':self.payload['to']['x']+self.layout[0]-self.editor_rect[0], 'y':self.payload['to']['y']+self.layout[1]-self.editor_rect[1]}
        self.layout,new=morph_layout(self.editor_rect,self.orb_rect,logo,self.preferences.direction);self.payload.update(new)
        self.x.move(self.orb,self.layout);self.transition+=1;self.mode='opening'
        self.GLib.timeout_add(50,self.animate_open)

    def animate_open(self):
        self.x.move(self.orb,self.layout)
        self.x.input_region(self.orb,True)
        self.emit('morph',{**self.payload,'direction':'open'});self.watchdog('opening');return False

    def watchdog(self,mode):
        token=self.transition
        def finish():
            if self.mode==mode and self.transition==token:self.finished('open' if mode=='opening' else 'close')
            return False
        self.GLib.timeout_add(2000,finish)

    def finished(self,direction):
        if direction=='close' and self.mode=='closing':
            self.menu_open=False
            self.x.move(self.orb,self.orb_rect);self.emit('show');self.mode='orb'
            self.x.input_region(self.orb)
        elif direction=='open' and self.mode=='opening':
            self.window.unminimize();self.window.present();self.orb.set_visible(False);self.emit('pause');self.mode='editor'

    def hide(self):
        self.menu_open=False;self.hidden_by_user=True;self.mode='hidden'
        self.orb.set_visible(False);self.emit('pause');self.window.present();self.window.minimize();return True
