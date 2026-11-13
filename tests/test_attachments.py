import unittest,tempfile,sys,io,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from prombee.attachments import Attachments,MAX_SIZE
from prombee.display import DisplayPreferences
from prombee.floating import FloatingPreferences
class AssetPreferencesTests(unittest.TestCase):
 def test_uploaded_bytes_survive_restart_and_ids_cannot_escape(self):
  with tempfile.TemporaryDirectory() as folder:
   store=Attachments(folder);asset=store.add('../中文.txt',io.BytesIO(b'code'),4)
   self.assertEqual(Path(asset['path']).name,'中文.txt');self.assertEqual(Path(asset['path']).read_bytes(),b'code')
   self.assertEqual(Attachments(folder).paths([asset['id'],asset['id']]),[asset['path']])
   with self.assertRaises(ValueError):store.get('../../etc/passwd')
   with self.assertRaises(ValueError):store.add('large',io.BytesIO(),MAX_SIZE+1)
   with self.assertRaises(ValueError):store.add('short',io.BytesIO(b'x'),3)
   self.assertEqual(len(store.entries()),1)
 def test_display_and_orb_position_are_device_data_and_preserve_other_switches(self):
  with tempfile.TemporaryDirectory() as folder:
   display=DisplayPreferences(folder);display.save({'width':1372});self.assertEqual(DisplayPreferences(folder).load()['width'],1372)
   with self.assertRaises(ValueError):display.save({'width':True})
   prefs=FloatingPreferences(folder);prefs.save_position((311,408,520,420));other=FloatingPreferences(folder);other.save(False,'right')
   self.assertEqual(FloatingPreferences(folder).position,(311,408,520,420))
   self.assertFalse(FloatingPreferences(folder).enabled)
   self.assertEqual(FloatingPreferences(folder).direction,'right')

 def test_registered_references_follow_text_without_importing_unrelated_files(self):
  with tempfile.TemporaryDirectory() as folder:
   store=Attachments(folder);asset=store.add('图(1).txt',io.BytesIO(b'file'),4)
   text='[图]('+Path(asset['path']).as_uri()+')'
   self.assertEqual(store.references(text),[asset]);self.assertEqual(store.references('file:///etc/passwd'),[])
   self.assertEqual(store.import_file(asset['path'])['id'],asset['id']);self.assertEqual(len(store.entries()),1)
