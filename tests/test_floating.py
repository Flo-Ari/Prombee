import sys
from pathlib import Path
import tempfile
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from prombee.floating import morph_layout, FloatingPreferences

class FloatingTests(unittest.TestCase):
    def test_head_alignment_across_negative_monitor_coordinates(self):
        editor=(-1200,100,1080,800);orb=(50,800,520,420);logo={'x':42,'y':73}
        union,payload=morph_layout(editor,orb,logo)
        self.assertEqual(union,(-1200,100,1770,1120))
        self.assertEqual((union[0]+payload['to']['x'],union[1]+payload['to']['y']),(-1158,173))
        self.assertEqual((union[0]+payload['from']['x'],union[1]+payload['from']['y']),(336,1002))
        self.assertEqual(payload['editor']['width'],1080)
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
            controller.x=SimpleNamespace(input_region=lambda orb,full=False:regions.append(full),move=no_move)
            controller.input_region=lambda full=False:regions.append(full)
            controller.place=no_move
            controller.command({'action':'scene','index':3})
            controller.command({'action':'sceneEnd'})
            self.assertEqual(regions,[True,False])

    def test_direction_is_saved_and_head_alignment_tracks_facing(self):
        with tempfile.TemporaryDirectory() as folder:
            prefs=FloatingPreferences(folder);self.assertEqual(prefs.direction,'right')
            prefs.save(False,'left');restored=FloatingPreferences(folder)
            self.assertEqual(restored.direction,'left');self.assertFalse(restored.enabled)
            restored.save(True);self.assertEqual(FloatingPreferences(folder).direction,'left')
        editor=(0,0,1080,800);orb=(600,400,520,420);logo={'x':42,'y':73}
        _,right=morph_layout(editor,orb,logo,'right');_,left=morph_layout(editor,orb,logo,'left')
        self.assertEqual(right['from']['x']-left['from']['x'],52)
        self.assertEqual(right['to'],left['to'])

    def test_fedora_drag_is_one_native_grab_with_no_resize_loop_or_click(self):
        from types import SimpleNamespace
        from prombee.floating_gtk import GtkFloating
        control=GtkFloating.__new__(GtkFloating)
        grabs=[];opened=[];messages=[];states=[]
        device=object()
        control.mode='orb';control.menu_open=False;control.drag_press=None;control.drag_started=False
        control.Gtk=SimpleNamespace(EventSequenceState=SimpleNamespace(CLAIMED='claimed',DENIED='denied'))
        control.view=SimpleNamespace(grab_focus=lambda:None)
        control.orb=SimpleNamespace(get_surface=lambda:SimpleNamespace(begin_move=lambda *args:grabs.append(args)))
        control.emit=lambda *args:messages.append(args)
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
