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


def main():
    parser=argparse.ArgumentParser(description='Prombee · 提示蜂')
    parser.add_argument('--data-dir',type=Path)
    parser.add_argument('--smoke-test',action='store_true',help=argparse.SUPPRESS)
    parser.add_argument('--screenshot',type=Path,help=argparse.SUPPRESS)
    args=parser.parse_args()
    if getattr(sys,'frozen',False):
        exe=Path(sys.executable).resolve()
        project=exe.parent.parent
        default_data=project/'data' if (project/'web/index.html').exists() else exe.parent/'Prombee-data'
    else:
        default_data=ROOT/'data'
    data=args.data_dir or Path(os.environ.get('PROMBEE_DATA_DIR',str(default_data)))
    if getattr(sys,'frozen',False):
        os.environ['WEBKIT_EXEC_PATH']=str(ROOT/'webkit-processes')
    import gi
    gi.require_version('Gtk','4.0')
    gi.require_version('WebKit','6.0')
    from gi.repository import Gtk,Gdk,Gio,GLib,WebKit
    server=start_server(ROOT,data)
    url=f'http://127.0.0.1:{server.server_port}/'
    result=[0]

    class Application(Gtk.Application):
        def __init__(self):
            super().__init__(application_id='app.prombee.Prombee',flags=Gio.ApplicationFlags.NON_UNIQUE if args.smoke_test else Gio.ApplicationFlags.DEFAULT_FLAGS)
            self.connect('activate',self.activate)
            self.connect('shutdown',lambda app:server.shutdown())

        def activate(self,app):
            existing=self.get_active_window()
            if existing:
                existing.present();return
            self.window=Gtk.ApplicationWindow(application=self,title='Prombee · 提示蜂')
            self.window.set_default_size(1080,800)
            self.window.set_size_request(640,450)
            header=Gtk.HeaderBar()
            header.set_title_widget(Gtk.Label(label='Prombee · 提示蜂'))
            self.window.set_titlebar(header)
            self.web=WebKit.WebView()
            self.closing=False
            self.saved_close=False
            manager=self.web.get_user_content_manager()
            manager.register_script_message_handler('clipboard',None)
            manager.connect('script-message-received::clipboard',lambda m,value:Gdk.Display.get_default().get_clipboard().set(value.to_string()))
            manager.register_script_message_handler('theme',None)
            manager.connect('script-message-received::theme',lambda m,value:Gtk.Settings.get_default().set_property('gtk-application-prefer-dark-theme',value.to_boolean()))
            manager.register_script_message_handler('close',None)
            manager.connect('script-message-received::close',self.close_finished)
            self.window.connect('close-request',self.close_requested)
            self.web.get_settings().set_enable_developer_extras(True)
            self.web.connect('decide-policy',self.navigation)
            self.window.set_child(self.web)
            self.web.load_uri(url)
            self.window.present()
            if args.smoke_test:
                self.tries=0
                GLib.timeout_add(500,self.check)

        def close_requested(self,window):
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
                self.window.close()
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
                assert value['title']=='Prombee · 提示蜂' and value['rows']>0 and value['clipped']==0,value
                print('DESKTOP_OK '+json.dumps(value,ensure_ascii=False),flush=True)
                if args.screenshot:
                    self.web.get_snapshot(WebKit.SnapshotRegion.VISIBLE,WebKit.SnapshotOptions.NONE,None,self.snapshot,None)
                else:
                    self.quit()
            except Exception as exc:
                print('DESKTOP_ERROR '+str(exc),flush=True);result[0]=1;self.quit()

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
