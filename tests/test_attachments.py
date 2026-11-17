import unittest,tempfile,sys,io,json
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from prombee.services.attachments import Attachments,MAX_SIZE
from prombee.services.display import DisplayPreferences
from prombee.services.floating import FloatingPreferences
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

 def test_duplicate_names_are_numbered_without_overwriting_concurrent_uploads(self):
  import concurrent.futures
  with tempfile.TemporaryDirectory() as folder:
   store=Attachments(folder);self.addCleanup(store.close)
   with concurrent.futures.ThreadPoolExecutor() as pool:
    assets=list(pool.map(lambda i:store.add('图.png',io.BytesIO(bytes([i])),1),range(4)))
   self.assertEqual({a['name'] for a in assets},{'图.png'})
   self.assertEqual(len({a['path'] for a in assets}),4)
   self.assertEqual({Path(a['path']).read_bytes() for a in assets},{bytes([i]) for i in range(4)})
   self.assertTrue(all(Path(a['path']).name==a['name'] for a in assets))

 def test_temporary_text_has_no_permanent_body_and_save_as_survives_cleanup(self):
  with tempfile.TemporaryDirectory() as folder:
   store=Attachments(folder);asset=store.add('粘贴内容.txt',io.BytesIO(b'complete original text'),22,temporary=True)
   self.assertFalse(Path(asset['path']).is_relative_to(Path(folder)))
   self.assertFalse(store.index.exists());self.assertEqual(store.references(asset['name']),[asset])
   destination=Path(folder)/'kept.txt';store.save_as(asset['id'],destination)
   temporary=Path(asset['path']);store.close()
   self.assertFalse(temporary.exists());self.assertEqual(destination.read_bytes(),b'complete original text')

 def test_name_collisions_only_consider_current_gallery_and_reference_stems(self):
  with tempfile.TemporaryDirectory() as folder:
   store=Attachments(folder);self.addCleanup(store.close)
   old=store.add('图.jpg',io.BytesIO(b'old'),3)
   fresh=store.add('图.jpg',io.BytesIO(b'new'),3,scope=[])
   self.assertEqual(fresh['name'],'图.jpg')
   duplicate=store.add('图.png',io.BytesIO(b'two'),3,scope=[fresh['id']])
   self.assertEqual(duplicate['name'],'图(1).png')
   third=store.add('图.jpg',io.BytesIO(b'3'),1,scope=[fresh['id'],duplicate['id']])
   self.assertEqual(third['name'],'图(2).jpg')
   reused=store.add('图.png',io.BytesIO(b'new'),3,scope=[fresh['id']])
   self.assertEqual(reused['name'],'图(1).png') # removed current item / history is ignored
   restored=store.import_file(third['path'],scope=[])
   self.assertEqual(restored['name'],'图.jpg')
   self.assertEqual(store.import_file(fresh['path'],scope=[fresh['id']])['id'],fresh['id'])
   self.assertEqual(store.references('图',scope=[fresh['id']]),[fresh])
