import sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from prombee.layout import LayoutPreferences

class LayoutTests(unittest.TestCase):
    def test_positions_are_device_local_and_merge_between_instances(self):
        with tempfile.TemporaryDirectory() as folder:
            a=LayoutPreferences(folder);b=LayoutPreferences(folder)
            self.assertEqual(a.load(),{'positions':{}})
            a.save({'page':'editor','position':'top'})
            b.save({'page':'preview','position':'left'})
            self.assertEqual(a.load(),{'positions':{'editor':'top','preview':'left'}})
            self.assertEqual(list(Path(folder).glob('*.txt')),[])

    def test_invalid_positions_do_not_overwrite_preferences_and_corrupt_file_recovers(self):
        with tempfile.TemporaryDirectory() as folder:
            store=LayoutPreferences(folder);store.save({'page':'template','position':'left'})
            for payload in [{'page':'other','position':'right'},{'page':[],'position':'top'},{'page':'unknown','position':'left'}]:
                with self.assertRaises(ValueError):store.save(payload)
            self.assertEqual(store.load()['positions'],{'template':'left'})
            store.path.write_text('broken',encoding='utf-8');self.assertEqual(store.load(),{'positions':{}})
