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
