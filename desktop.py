#!/usr/bin/env python3
"""Desktop entry point; the same web/ files are used by dev.py."""
import argparse
import sys
import os
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'src'))
from prombee.server import start_server
from prombee.floating import SWITCH_DURATION_MS
from prombee.branding import app_name, ui_language


def main():
    parser=argparse.ArgumentParser(description=app_name())
    parser.add_argument('--data-dir',type=Path)
    parser.add_argument('--smoke-test',action='store_true',help=argparse.SUPPRESS)
    parser.add_argument('--screenshot',type=Path,help=argparse.SUPPRESS)
    parser.add_argument('--floating-smoke-test',action='store_true',help=argparse.SUPPRESS)
    args=parser.parse_args()
    if args.floating_smoke_test:args.smoke_test=True
    if getattr(sys,'frozen',False):
        exe=Path(sys.executable).resolve()
        project=exe.parent.parent
        default_data=project/'data' if (project/'web/index.html').exists() else exe.parent/'Prombee-data'
    else:
        default_data=ROOT/'data'
    data=args.data_dir or Path(os.environ.get('PROMBEE_DATA_DIR',str(default_data)))
    if getattr(sys,'frozen',False):
        os.environ['WEBKIT_EXEC_PATH']=str(ROOT/'webkit-processes')
    if os.environ.get('DISPLAY'):
        os.environ.setdefault('GDK_BACKEND','x11')
    import gi
    gi.require_version('Gtk','4.0')
    gi.require_version('WebKit','6.0')
    gi.require_version('GdkX11','4.0')
    from gi.repository import Gtk,Gdk,Gio,GLib,WebKit,GdkX11
    import threading
    GLib.set_application_name(app_name())
    server=start_server(ROOT,data)
    url=f'http://127.0.0.1:{server.server_port}/'
    result=[0]

    class Application(Gtk.Application):
        def __init__(self):
            super().__init__(application_id='app.prombee.Prombee',flags=Gio.ApplicationFlags.NON_UNIQUE if args.smoke_test else Gio.ApplicationFlags.DEFAULT_FLAGS)
            self.connect('activate',self.activate)
            self.connect('shutdown',lambda app:(server.speech.stop(),server.shutdown()))

        def activate(self,app):
            if hasattr(self,'window'):
                if hasattr(self,'floating') and self.floating.mode=='orb':self.floating.open()
                else:
                    if hasattr(self,'floating'):
                        self.floating.mode='editor';self.floating.hidden_by_user=False
                    self.window.unminimize();self.window.present()
                return
            self.window=Gtk.ApplicationWindow(application=self,title=app_name())
            self.window.set_default_size(1080,800)
            self.window.set_size_request(640,450)
            # Keep GTK client-side resize edges while the visible title bar lives in WebKit.
            self.window.set_titlebar(Gtk.Box())
            server.pick_path = self.pick_path
            self.web=WebKit.WebView()
            self.closing=False
            self.saved_close=False
            self.file_picker_cancel=None
            manager=self.web.get_user_content_manager()
            manager.register_script_message_handler('clipboardWrite',None)
            manager.connect('script-message-received::clipboardWrite',self.clipboard_write)
            manager.register_script_message_handler('clipboard',None)
            manager.connect('script-message-received::clipboard',lambda m,value:Gdk.Display.get_default().get_clipboard().set(value.to_string()))
            manager.register_script_message_handler('theme',None)
            manager.connect('script-message-received::theme',lambda m,value:Gtk.Settings.get_default().set_property('gtk-application-prefer-dark-theme',value.to_boolean()))
            manager.register_script_message_handler('close',None)
            manager.connect('script-message-received::close',self.close_finished)
            self.window.connect('close-request',self.close_requested)
            settings = self.web.get_settings()
            # WebKitGTK's wheel animator queues high-resolution deltas, producing
            # input lag (WebKit bug 258926). Let native deltas scroll directly;
            # explicit CSS smooth scroll for the top/bottom controls still works.
            settings.set_enable_smooth_scrolling(False)
            settings.set_enable_developer_extras(True)
            self.web.connect('decide-policy',self.navigation)
            self.window.set_child(self.web)
            manager.register_script_message_handler('mascot',None)
            manager.connect('script-message-received::mascot',lambda m,value:self.floating.command(json.loads(value.to_string())))
            self.web.load_uri(url+'?desktop=gtk&lang='+ui_language())
            self.window.present()
            from prombee.floating_gtk import GtkFloating
            self.floating=GtkFloating(self,self.window,self.web,url,data)
            # Capture the native pointer device/time before the asynchronous JS bridge.
            gesture=Gtk.GestureClick();gesture.set_button(1)
            gesture.set_propagation_phase(Gtk.PropagationPhase.CAPTURE)
            gesture.connect('pressed',lambda g,count,x,y:setattr(self.floating,'window_press',
                (g.get_current_event_device(),g.get_current_event_time(),x,y)))
            gesture.connect('released',lambda *args:setattr(self.floating,'window_press',None))
            self.web.add_controller(gesture)
            server.floating_changed=lambda:GLib.idle_add(self.floating.preferences_changed)
            if args.smoke_test:
                self.tries=0
                GLib.timeout_add(500,self.check)

        def pick_path(self, kind, initial=''):
            finished = threading.Event()
            result = {}
            def begin():
                cancellable = Gio.Cancellable()
                self.file_picker_cancel = cancellable
                if not hasattr(Gtk, 'FileDialog'):
                    chooser = Gtk.FileChooserNative.new('选择保存位置' if kind == 'folder' else '打开 TXT 词集', self.window,
                        Gtk.FileChooserAction.SELECT_FOLDER if kind == 'folder' else Gtk.FileChooserAction.OPEN, '选择', '取消')
                    if initial and Path(initial).is_dir(): chooser.set_current_folder(Gio.File.new_for_path(initial))
                    if kind == 'file':
                        file_filter=Gtk.FileFilter();file_filter.set_name('TXT');file_filter.add_pattern('*.txt');file_filter.add_pattern('*.TXT');chooser.add_filter(file_filter)
                    def complete(chooser, response):
                        if finished.is_set(): return False
                        selected=chooser.get_file() if response == Gtk.ResponseType.ACCEPT else None
                        result['path']=selected.get_path() if selected else None
                        chooser.destroy();self.file_picker_cancel=None;finished.set()
                        return False
                    chooser.connect('response', complete)
                    cancellable.connect('cancelled',lambda _:GLib.idle_add(complete,chooser,Gtk.ResponseType.CANCEL))
                    chooser.show()
                    return False
                dialog = Gtk.FileDialog()
                dialog.set_title('选择保存位置' if kind == 'folder' else '打开 TXT 词集')
                if initial and Path(initial).is_dir(): dialog.set_initial_folder(Gio.File.new_for_path(initial))
                if kind == 'file':
                    filters = Gio.ListStore.new(Gtk.FileFilter)
                    file_filter = Gtk.FileFilter();file_filter.set_name('TXT');file_filter.add_pattern('*.txt');file_filter.add_pattern('*.TXT')
                    filters.append(file_filter);dialog.set_filters(filters)
                def done(dialog, response, _):
                    try:
                        selected = dialog.select_folder_finish(response) if kind == 'folder' else dialog.open_finish(response)
                        result['path'] = selected.get_path() if selected else None
                    except GLib.Error as error:
                        if error.matches(Gtk.dialog_error_quark(), Gtk.DialogError.DISMISSED) or error.matches(Gtk.dialog_error_quark(), Gtk.DialogError.CANCELLED): result['path'] = None
                        else: result['error'] = error.message
                    finally:
                        self.file_picker_cancel = None
                        finished.set()
                try:
                    if kind == 'folder': dialog.select_folder(self.window, cancellable, done, None)
                    else: dialog.open(self.window, cancellable, done, None)
                except Exception as error:
                    result['error'] = str(error);finished.set()
                return False
            def guarded_begin():
                try: return begin()
                except Exception as error:
                    result['error']=str(error);self.file_picker_cancel=None;finished.set()
                    return False
            GLib.idle_add(guarded_begin)
            finished.wait()
            if 'error' in result: raise ValueError(result['error'])
            return result.get('path')

        def clipboard_write(self,manager,value):
            request=json.loads(value.to_string())
            ok=True
            try:Gdk.Display.get_default().get_clipboard().set(request['text'])
            except Exception:ok=False
            response=json.dumps({'id':request['id'],'ok':ok})
            self.web.evaluate_javascript("window.dispatchEvent(new CustomEvent('prombee-clipboard',{detail:"+response+"}))",-1,None,None,None,None,None)

        def close_requested(self,window):
            if self.file_picker_cancel: self.file_picker_cancel.cancel()
            if self.saved_close:
                return False
            if not self.closing:
                self.closing=True
                self.web.evaluate_javascript("window.dispatchEvent(new Event('prombee-close'))",-1,None,None,None,None,None)
            return True

        def close_finished(self,manager,value):
            self.closing=False
            if value.to_string()=='saved':
                self.saved_close=True
                self.quit()
            else:
                self.web.evaluate_javascript("document.getElementById('status').textContent='暂时无法保存，请先复制文字保留内容'",-1,None,None,None,None,None)

        def navigation(self,view,decision,kind):
            if kind==WebKit.PolicyDecisionType.NAVIGATION_ACTION:
                uri=decision.get_navigation_action().get_request().get_uri()
                if not uri.startswith(url):
                    decision.ignore();return True
            return False

        def check(self):
            self.tries+=1
            if self.tries>40:
                print('Desktop smoke test timed out',flush=True);result[0]=1;self.quit();return False
            self.web.evaluate_javascript("JSON.stringify({ready:!!window.prombeeReady,title:document.title,rows:document.querySelectorAll('.row').length,clipped:[...document.querySelectorAll('.content')].filter(e=>{const r=document.createRange();r.selectNodeContents(e);const b=e.getBoundingClientRect();return [...r.getClientRects()].some(x=>x.top<b.top-1||x.bottom>b.bottom+1)}).length})",-1,None,None,None,self.checked,None)
            return False

        def checked(self,view,async_result,user_data):
            try:
                value=json.loads(view.evaluate_javascript_finish(async_result).to_string())
                if not value['ready']:
                    GLib.timeout_add(500,self.check);return
                assert value['title']==app_name() and value['rows']>0 and value['clipped']==0,value
                destinations=server.other.snapshot()
                assert isinstance(destinations['windows'],list) and isinstance(destinations['applications'],list)
                print('TARGETS_OK '+json.dumps({key:len(destinations[key]) for key in ('windows','applications')}),flush=True)
                print('DESKTOP_OK '+json.dumps(value,ensure_ascii=False),flush=True)
                if args.floating_smoke_test:
                    self.floating_stage=0;self.floating_tries=0
                    self.floating.collapse()
                    GLib.timeout_add(75,self.check_floating)
                elif args.screenshot:
                    self.web.get_snapshot(WebKit.SnapshotRegion.VISIBLE,WebKit.SnapshotOptions.NONE,None,self.snapshot,None)
                else:
                    self.quit()
            except Exception as exc:
                print('DESKTOP_ERROR '+str(exc),flush=True);result[0]=1;self.quit()

        def check_floating(self):
            self.floating_tries+=1
            if self.floating_tries>70:
                self.floating.view.evaluate_javascript("JSON.stringify({state:window.prombeeMascot?.state(),errors:window.prombeeErrors,size:[innerWidth,innerHeight],visibility:document.visibilityState})",-1,None,None,None,self.floating_failed,None)
                return False
            if self.floating_stage==0 and self.floating.mode=='orb':
                assert not self.window.get_visible() and self.floating.orb.get_visible()
                self.floating_stage=1;self.floating.open()
            elif self.floating_stage==1 and self.floating.mode=='editor':
                assert self.window.get_visible() and not self.floating.orb.get_visible()
                if self.floating.completed_switches!=2:
                    self.floating.view.evaluate_javascript("JSON.stringify({state:window.prombeeMascot?.state(),errors:window.prombeeErrors,size:[innerWidth,innerHeight],visibility:document.visibilityState})",-1,None,None,None,self.floating_failed,None)
                    return False
                print('FLOATING_OK '+json.dumps({'roundTrip':True,'switches':2,'durationMs':SWITCH_DURATION_MS}),flush=True)
                self.quit();return False
            return True

        def floating_failed(self,view,result_value,_):
            print('FLOATING_ERROR '+self.floating.mode+' completed='+str(self.floating.completed_switches)+' '+view.evaluate_javascript_finish(result_value).to_string(),flush=True)
            result[0]=1;self.quit()

        def snapshot(self,view,async_result,user_data):
            try:
                texture=view.get_snapshot_finish(async_result)
                assert texture.save_to_png(str(args.screenshot))
            except Exception as exc:
                print('SNAPSHOT_ERROR '+str(exc),flush=True);result[0]=1
            self.quit()

    app=Application()
    app.run([])
    return result[0]


if __name__=='__main__':
    raise SystemExit(main())
