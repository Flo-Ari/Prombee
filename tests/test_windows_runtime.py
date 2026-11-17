import hashlib
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
from prombee.adapters.windows_runtime import ensure_runtime, INSTALLER

class RuntimeTests(unittest.TestCase):
    def test_installed_runtime_skips_setup_and_dialog(self):
        progress=Mock()
        self.assertFalse(ensure_runtime('/nonexistent',probe=lambda:'150.0.1.2',progress=progress))
        progress.assert_not_called()
    def test_missing_runtime_uses_bundled_offline_installer_once(self):
        with tempfile.TemporaryDirectory() as folder:
            installer=Path(folder)/'runtime'/INSTALLER;installer.parent.mkdir();installer.write_bytes(b'offline fixture')
            installer.with_suffix('.sha256').write_text(hashlib.sha256(installer.read_bytes()).hexdigest())
            probe=Mock(side_effect=[None,'150.0.1.2']);run=Mock(return_value=0);dialog=Mock()
            self.assertTrue(ensure_runtime(folder,probe=probe,run=run,progress=lambda:dialog))
            run.assert_called_once_with(installer);dialog.close.assert_called_once()
    def test_corrupt_or_missing_installer_fails_before_execution(self):
        with tempfile.TemporaryDirectory() as folder:
            run=Mock()
            with self.assertRaisesRegex(RuntimeError,'缺少'):ensure_runtime(folder,probe=lambda:None,run=run)
            installer=Path(folder)/'runtime'/INSTALLER;installer.parent.mkdir();installer.write_bytes(b'bad')
            installer.with_suffix('.sha256').write_text('0'*64)
            with self.assertRaisesRegex(RuntimeError,'校验失败'):ensure_runtime(folder,probe=lambda:None,run=run)
            run.assert_not_called()
