import sys
from pathlib import Path
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from prombee.floating import FloatingPreferences

class FloatingTests(unittest.TestCase):
    def test_animation_preference_round_trip_and_corrupt_file_recovery(self):
        with tempfile.TemporaryDirectory() as folder:
            prefs=FloatingPreferences(folder);self.assertTrue(prefs.enabled)
            prefs.save(False);self.assertFalse(FloatingPreferences(folder).enabled)
            prefs.path.write_text('broken');self.assertTrue(FloatingPreferences(folder).enabled)

    def test_native_idle_scenes_never_expand_to_monitor_bounds(self):
        from types import SimpleNamespace
        from prombee.floating_gtk import GtkFloating
        from prombee.floating_windows import WindowsFloating
        for cls in (GtkFloating,WindowsFloating):
            controller=cls.__new__(cls)
            regions=[]
            def no_move(*args):
                self.fail('An idle scene must not resize or move the companion')
            controller.orb=object()
            controller.x=SimpleNamespace(input_region=lambda orb,full=False,**kwargs:regions.append(full),move=no_move)
            controller.input_region=lambda full=False:regions.append(full)
            controller.place=no_move
            controller.command({'action':'scene','index':3})
            controller.command({'action':'sceneEnd'})
            self.assertEqual(regions,[False])

    def test_direction_is_saved_and_head_alignment_tracks_facing(self):
        with tempfile.TemporaryDirectory() as folder:
            prefs=FloatingPreferences(folder);self.assertEqual(prefs.direction,'left')
            prefs.save(False,'left');restored=FloatingPreferences(folder)
            self.assertEqual(restored.direction,'left');self.assertFalse(restored.enabled)
            restored.save(True);self.assertEqual(FloatingPreferences(folder).direction,'left')

    def test_windows_waits_for_source_artwork_before_marking_companion_ready(self):
        from types import SimpleNamespace
        from prombee.floating_windows import WindowsFloating
        controller=WindowsFloating.__new__(WindowsFloating)
        controller.ready=False;controller.mode='editor';controller.preferences=SimpleNamespace(enabled=True,direction='left')
        calls=[];controller.emit=lambda command,value=None:calls.append((command,value))
        controller.loaded();self.assertFalse(controller.ready)
        controller.command({'action':'ready'});self.assertTrue(controller.ready)
        self.assertEqual(calls[-1],('pause',None))

    def test_fedora_drag_is_one_native_grab_with_no_resize_loop_or_click(self):
        from types import SimpleNamespace
        from prombee.floating_gtk import GtkFloating
        control=GtkFloating.__new__(GtkFloating)
        grabs=[];opened=[];messages=[];states=[]
        device=object()
        control.mode='orb';control.menu_open=False;control.drag_press=None;control.drag_started=False
        control.Gtk=SimpleNamespace(EventSequenceState=SimpleNamespace(CLAIMED='claimed',DENIED='denied'))
        control.view=SimpleNamespace(grab_focus=lambda:None)
        control.orb=SimpleNamespace(get_surface=lambda:SimpleNamespace(begin_move=lambda *args,**kwargs:grabs.append(args)))
        control.emit=lambda *args,**kwargs:messages.append(args)
        control.open=lambda:opened.append(True)
        gesture=SimpleNamespace(set_state=states.append,get_current_event_device=lambda:device,get_current_event_time=lambda:123)
        control.drag_begin(gesture,260,210)
        control.drag_update(gesture,2,2);self.assertEqual(grabs,[])
        for dx in range(6,100):control.drag_update(gesture,dx,20)
        control.drag_end(gesture,99,20)
        self.assertEqual(grabs,[(device,1,260,210,123)])
        self.assertEqual(opened,[]);self.assertIn(('interaction',),messages)
        # Legacy JS drag packets never adjust the GTK window while the WM owns movement.
        for dx in range(10):control.command({'action':'drag','dx':dx,'dy':1})
        self.assertEqual(grabs,[(device,1,260,210,123)])
        control.drag_begin(gesture,260,210);control.drag_end(gesture,1,1)
        self.assertEqual(opened,[True])
        control.menu_open=True;control.drag_begin(gesture,260,210)
        self.assertEqual(states[-1],'denied')

    def test_cancelled_native_drag_never_opens_the_editor(self):
        from types import SimpleNamespace
        from prombee.floating_gtk import GtkFloating
        control=GtkFloating.__new__(GtkFloating)
        control.drag_press=('pointer',123,0,0);control.drag_started=True
        control.open=lambda:self.fail('Cancelled drag became a click')
        control.drag_cancel(None,None);control.drag_end(None,0,0)
        self.assertIsNone(control.drag_press)

    def test_minimize_converts_editor_to_orb_without_reopening_explicit_hide(self):
        from types import SimpleNamespace
        from prombee.floating_gtk import GtkFloating
        control=GtkFloating.__new__(GtkFloating)
        calls=[]
        control.Gdk=SimpleNamespace(ToplevelState=SimpleNamespace(MINIMIZED=1,ABOVE=16))
        control.window=SimpleNamespace(unminimize=lambda:calls.append('restore'))
        control.collapse=lambda:calls.append('collapse')
        control.preferences=SimpleNamespace(orb_enabled=True)
        control.mode='editor';control.hidden_by_user=False
        surface=SimpleNamespace(get_state=lambda:1)
        control.editor_state_changed(surface,None)
        self.assertEqual(calls,['restore','collapse'])
        control.mode='hidden';control.hidden_by_user=True;calls.clear()
        control.editor_state_changed(SimpleNamespace(get_state=lambda:0),None)
        control.editor_state_changed(surface,None)
        self.assertTrue(control.hidden_by_user);self.assertEqual(calls,[])

    def test_orb_recovers_minimize_and_lost_above_without_focus_stealing(self):
        from types import SimpleNamespace
        from prombee.floating_gtk import GtkFloating
        control=GtkFloating.__new__(GtkFloating);calls=[]
        control.Gdk=SimpleNamespace(ToplevelState=SimpleNamespace(MINIMIZED=1,ABOVE=16))
        control.mode='orb';control.orb=SimpleNamespace(unminimize=lambda:calls.append('restore'))
        control.x=SimpleNamespace(above=lambda orb:calls.append('above'))
        control.orb_state_changed(SimpleNamespace(get_state=lambda:1),None)
        self.assertEqual(calls,['restore','above'])
        calls.clear();control.mode='hidden'
        control.orb_state_changed(SimpleNamespace(get_state=lambda:1),None)
        self.assertEqual(calls,[])

    def test_both_hosts_switch_synchronously_without_snapshots_or_timers(self):
        from types import SimpleNamespace
        import threading
        from prombee.floating_gtk import GtkFloating
        from prombee.floating_windows import WindowsFloating
        for cls in (GtkFloating, WindowsFloating):
            calls=[]
            def window(name):
                return SimpleNamespace(x=0,y=0,width=1080,height=800,
                    present=lambda:calls.append(name+' show'),show=lambda:calls.append(name+' show'),
                    hide=lambda:calls.append(name+' hide'),set_visible=lambda value:calls.append(name+(' show' if value else ' hide')),
                    unminimize=lambda:None)
            control=cls.__new__(cls)
            control.window=window('editor');control.orb=window('orb')
            control.mode='editor';control.ready=True;control.orb_rect=None;control.completed_switches=0
            control.preferences=SimpleNamespace(orb_enabled=True,save_position=lambda rect:None)
            control.lock=threading.RLock()
            control.x=SimpleNamespace(position=lambda w:(w.x,w.y,w.width,w.height),move=lambda *args,**kwargs:None,above=lambda *args,**kwargs:None,input_region=lambda *args,**kwargs:None)
            control.place=lambda *args,**kwargs:None;control.input_region=lambda *args,**kwargs:None
            control.emit=lambda command,*args:calls.append(command)
            control.collapse()
            self.assertEqual(control.mode,'orb');self.assertIn('editor hide',calls);self.assertIn('show',calls)
            control.open()
            self.assertEqual(control.mode,'editor');self.assertEqual(control.completed_switches,2)
            self.assertEqual(calls[-2:],['orb hide','pause'])

    def test_orb_switch_is_persistent_and_independent_of_animation_and_direction(self):
        with tempfile.TemporaryDirectory() as folder:
            ui=FloatingPreferences(folder);mascot=FloatingPreferences(folder)
            ui.set_orb_enabled(False);mascot.save(False,'right')
            restored=FloatingPreferences(folder)
            self.assertFalse(restored.orb_enabled);self.assertFalse(restored.enabled)
            self.assertEqual(restored.direction,'right')
            ui.set_orb_enabled(True);self.assertFalse(FloatingPreferences(folder).enabled)
            with self.assertRaises(ValueError):ui.set_orb_enabled('yes')

    def test_disabled_orb_uses_normal_minimize_on_both_hosts(self):
        from types import SimpleNamespace
        from prombee.floating_gtk import GtkFloating
        from prombee.floating_windows import WindowsFloating
        for cls in (GtkFloating,WindowsFloating):
            calls=[];control=cls.__new__(cls)
            control.preferences=SimpleNamespace(orb_enabled=False)
            control.window=SimpleNamespace(minimize=lambda:calls.append('minimize'))
            control.collapse();self.assertEqual(calls,['minimize'])

    def test_focus_loss_ignores_dialogs_closing_and_disabled_switch(self):
        from types import SimpleNamespace
        from prombee.floating_gtk import GtkFloating
        control=GtkFloating.__new__(GtkFloating);calls=[]
        control.preferences=SimpleNamespace(orb_enabled=True)
        control.hidden_by_user=False;control.mode='editor';control.ready=True
        control.window=SimpleNamespace(is_active=lambda:False,get_visible=lambda:True)
        control.app=SimpleNamespace(closing=False,file_picker_cancel=None,get_windows=lambda:[])
        control.collapse=lambda **kw:calls.append(kw)
        control.background_if_external();self.assertEqual(calls,[{'background':True}]);calls.clear()
        control.app.file_picker_cancel=object();control.background_if_external()
        control.app.file_picker_cancel=None;control.app.closing=True;control.background_if_external()
        control.app.closing=False;control.preferences.orb_enabled=False;control.background_if_external()
        control.preferences.orb_enabled=True
        control.app.get_windows=lambda:[SimpleNamespace(is_active=lambda:True)]
        control.background_if_external();self.assertEqual(calls,[])

    def test_api_persists_switch_notifies_host_and_rejects_invalid_values(self):
        import json
        from urllib.request import Request,urlopen
        from urllib.error import HTTPError
        from prombee.server import start_server
        with tempfile.TemporaryDirectory() as folder:
            server=start_server(Path(__file__).resolve().parents[1],folder)
            changed=[];server.floating_changed=lambda:changed.append(True)
            url=f'http://127.0.0.1:{server.server_port}/api/floating'
            try:
                with urlopen(url) as response:self.assertEqual(json.load(response),{'enabled':True})
                with urlopen(Request(url,data=b'{"enabled":false}',headers={'Content-Type':'application/json'},method='POST')) as response:
                    self.assertEqual(json.load(response),{'enabled':False})
                self.assertEqual(changed,[True]);self.assertFalse(FloatingPreferences(folder).orb_enabled)
                for payload,headers,status in [(b'{"enabled":"false"}',{},400),(b'{"enabled":true}',{'Origin':'https://foreign.example'},403)]:
                    with self.assertRaises(HTTPError) as error:urlopen(Request(url,data=payload,headers=headers,method='POST'))
                    self.assertEqual(error.exception.code,status)
                self.assertFalse(FloatingPreferences(folder).orb_enabled)
            finally:server.shutdown();server.server_close()
