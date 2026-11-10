import sys,json,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from prombee.shortcuts import Shortcuts,IDS

class ShortcutsTests(unittest.TestCase):
    def test_settings_survive_restart_without_changing_prompt_documents(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'test.txt';p.write_text('用户提示词',encoding='utf-8')
            store=Shortcuts(folder);self.assertEqual(store.load(),{'bindings':{}})
            mapping={name:'' for name in IDS};mapping.update(insert='Ctrl+N',previous='ArrowUp',next='ArrowDown')
            store.save({'bindings':mapping})
            self.assertEqual(Shortcuts(folder).load()['bindings'],mapping)
            self.assertEqual(p.read_text(encoding='utf-8'),'用户提示词')
            store.path.write_text('broken',encoding='utf-8')
            self.assertEqual(store.load(),{'bindings':{}})
    def test_conflicts_and_os_reserved_bindings_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            store=Shortcuts(folder);mapping={name:'' for name in IDS}
            for key in ['Ctrl+Alt+Delete','Ctrl+Alt+Backspace','Alt+F4','A']:
                with self.assertRaises(ValueError):store.save({'bindings':{**mapping,'insert':key}})
            with self.assertRaises(ValueError):store.save({'bindings':{**mapping,'insert':'Ctrl+N','save':'Ctrl+N'}})
            with self.assertRaises(ValueError):store.save({'bindings':{'insert':'Ctrl+N'}})
            self.assertFalse(store.path.exists())
    def test_legacy_alternate_redo_is_removed_without_resetting_custom_keys(self):
        with tempfile.TemporaryDirectory() as folder:
            store=Shortcuts(folder)
            value={name:'' for name in IDS}
            value.update(insert='Ctrl+K',redo='Ctrl+Shift+Z',redoAlt='Ctrl+Y')
            store.path.write_text(json.dumps(value),encoding='utf-8')
            loaded=store.load()['bindings']
            self.assertNotIn('redoAlt',loaded)
            self.assertEqual(loaded['insert'],'Ctrl+K')
            self.assertEqual(loaded['redo'],'Ctrl+Shift+Z')
            value['redo']=''
            store.path.write_text(json.dumps(value),encoding='utf-8')
            self.assertEqual(store.load()['bindings']['redo'],'Ctrl+Y')
