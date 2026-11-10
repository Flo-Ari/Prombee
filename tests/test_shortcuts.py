import sys,json,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from prombee.shortcuts import Shortcuts,IDS

class ShortcutsTests(unittest.TestCase):
    def test_settings_survive_restart_without_changing_prompt_documents(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'test.txt';p.write_text('用户提示词')
            store=Shortcuts(folder);self.assertEqual(store.load(),{'bindings':{}})
            mapping={name:'' for name in IDS};mapping.update(insert='Ctrl+N',previous='ArrowUp',next='ArrowDown')
            store.save({'bindings':mapping})
            self.assertEqual(Shortcuts(folder).load()['bindings'],mapping)
            self.assertEqual(p.read_text(),'用户提示词')
            store.path.write_text('broken')
            self.assertEqual(store.load(),{'bindings':{}})
    def test_conflicts_and_os_reserved_bindings_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            store=Shortcuts(folder);mapping={name:'' for name in IDS}
            for key in ['Ctrl+Alt+Delete','Ctrl+Alt+Backspace','Alt+F4','A']:
                with self.assertRaises(ValueError):store.save({'bindings':{**mapping,'insert':key}})
            with self.assertRaises(ValueError):store.save({'bindings':{**mapping,'insert':'Ctrl+N','save':'Ctrl+N'}})
            with self.assertRaises(ValueError):store.save({'bindings':{'insert':'Ctrl+N'}})
            self.assertFalse(store.path.exists())
