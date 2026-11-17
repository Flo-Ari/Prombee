from pathlib import Path
import json
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from prombee.adapters.data_location import resolve_data_folder

class DataLocationTests(unittest.TestCase):
    def test_default_is_always_beside_application(self):
        with tempfile.TemporaryDirectory() as folder:
            path=resolve_data_folder(folder)
            self.assertEqual(path,Path(folder).resolve()/'Prombee-data')
            self.assertEqual(list(path.iterdir()),[])

    def test_explicit_and_remembered_choices_are_honored(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve();app=root/'app';app.mkdir();selected=root/'chosen';selected.mkdir()
            (app/'data-location.json').write_text(json.dumps({'path':str(selected)}))
            self.assertEqual(resolve_data_folder(app),selected)
            self.assertEqual(resolve_data_folder(app,root/'explicit'),root/'explicit')
            self.assertFalse((app/'Prombee-data').exists())

    def test_unwritable_application_requires_choice_and_cancel_writes_nothing_else(self):
        with tempfile.TemporaryDirectory() as folder:
            app=Path(folder).resolve()/'app';app.mkdir();selected=Path(folder).resolve()/'selected';selected.mkdir()
            import prombee.adapters.data_location as module
            original=module.writable_folder
            def writable(path):
                if Path(path)==app/'Prombee-data':raise PermissionError('read only')
                return original(path)
            with patch.object(module,'writable_folder',side_effect=writable):
                with self.assertRaisesRegex(ValueError,'请选择'):resolve_data_folder(app)
                self.assertIsNone(resolve_data_folder(app,choose=lambda:None))
                self.assertEqual(resolve_data_folder(app,choose=lambda:selected),selected)
            self.assertFalse((app/'Prombee-data').exists())

    def test_missing_saved_location_is_not_replaced_with_an_inferred_folder(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve();(root/'data-location.json').write_text(json.dumps({'path':str(root/'missing')}))
            with self.assertRaisesRegex(ValueError,'重新选择'):resolve_data_folder(root)
            self.assertIsNone(resolve_data_folder(root,choose=lambda:None))
            self.assertFalse((root/'Prombee-data').exists())
