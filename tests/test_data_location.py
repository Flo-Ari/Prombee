from pathlib import Path
import json
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from prombee.adapters.data_location import resolve_data_folder, writable_folder

class DataLocationTests(unittest.TestCase):
    def test_first_start_uses_project_data_and_never_opens_picker(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve()
            path=resolve_data_folder(root,choose=lambda:self.fail('unnecessary picker'))
            self.assertEqual(path,root/'data')
            self.assertEqual(resolve_data_folder(root),path)

    def test_explicit_and_remembered_choices_are_honored(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve();app=root/'app';app.mkdir();selected=root/'chosen';selected.mkdir()
            (app/'data-location.json').write_text(json.dumps({'path':str(selected)}))
            self.assertEqual(resolve_data_folder(app),selected)
            self.assertEqual(resolve_data_folder(app,root/'explicit'),root/'explicit')
            self.assertFalse((app/'data').exists())

    def test_readonly_install_automatically_uses_and_remembers_writable_data(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve();app=root/'installed';app.mkdir();user=root/'user'
            def writable(path):
                if Path(path)==app/'data':raise PermissionError('read only')
                return writable_folder(path)
            def persist(path,text):
                if Path(path).parent==app:raise PermissionError('read only')
                Path(path).write_text(text)
            with patch('prombee.adapters.data_location.writable_folder',side_effect=writable), patch('prombee.adapters.data_location.atomic_write',side_effect=persist):
                path=resolve_data_folder(app,choose=lambda:self.fail('unnecessary picker'),user_directory=user)
                self.assertEqual(path,user/'data')
                self.assertTrue((user/'data-location.json').exists())
                self.assertEqual(resolve_data_folder(app,choose=lambda:self.fail('repeated picker'),user_directory=user),path)

    def test_readonly_install_reuses_legacy_registry_without_moving_files(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve();app=root/'installed';app.mkdir();user=root/'user';user.mkdir()
            registry=user/'library.json';registry.write_text('{"active":"old"}')
            def writable(path):
                if Path(path)==app/'data':raise PermissionError('read only')
                return writable_folder(path)
            with patch('prombee.adapters.data_location.writable_folder',side_effect=writable):
                self.assertEqual(resolve_data_folder(app,user_directory=user),user)
            self.assertEqual(registry.read_text(),'{"active":"old"}')

    def test_user_record_outranks_stale_unwritable_installation_record(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve();app=root/'app';app.mkdir();user=root/'user';user.mkdir();chosen=root/'chosen';chosen.mkdir()
            (app/'data-location.json').write_text(json.dumps({'path':str(root/'missing')}))
            (user/'data-location.json').write_text(json.dumps({'path':str(chosen),'application':str(app)}))
            self.assertEqual(resolve_data_folder(app,choose=lambda:self.fail('repeated picker'),user_directory=user),chosen)

    def test_old_application_data_remains_in_place(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve();old=root/'Prombee-data';old.mkdir();(old/'library.json').write_text('{}')
            self.assertEqual(resolve_data_folder(root),old)
            self.assertFalse((root/'data').exists())

    def test_missing_saved_location_does_not_silently_create_an_empty_session(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder).resolve();(root/'data-location.json').write_text(json.dumps({'path':str(root/'missing')}))
            with self.assertRaisesRegex(ValueError,'重新选择'):resolve_data_folder(root)
            self.assertIsNone(resolve_data_folder(root,choose=lambda:None))
            self.assertFalse((root/'data').exists())
