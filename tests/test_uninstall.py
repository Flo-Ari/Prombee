"""Exercise uninstall helpers in disposable folders; never uninstall the real app."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]


@unittest.skipIf(sys.platform == 'win32', 'POSIX uninstall helper')
class LinuxUninstallTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name) / '软件 Test'
        self.folder.mkdir()
        self.script = self.folder / 'Uninstall.sh'
        shutil.copy2(ROOT / 'build_tools/packaging/linux/uninstall.sh', self.script)
        self.data = self.folder / 'Prombee-data'
        self.data.mkdir()
        (self.data / 'prompts.txt').write_text('保留提示词', encoding='utf-8')

    def tearDown(self):
        self.temp.cleanup()

    def program(self, name):
        path = self.folder / name
        path.write_text('#!/bin/sh\nexit 0\n')
        path.chmod(0o755)
        return path

    def test_portable_confirmed_removal_preserves_all_user_files(self):
        programs = [self.program(name) for name in ['Prombee', 'Prombee-0.9.19', 'Prombee-0.9.21-Linux-x86_64-Portable']]
        unrelated = self.program('Prombee-0.9.21-Windows-x64-Setup.exe')
        result = subprocess.run(['/bin/sh', str(self.script), '--portable'], input='y\n', text=True, capture_output=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(all(not p.exists() for p in programs))
        self.assertTrue(unrelated.exists())
        self.assertEqual((self.data / 'prompts.txt').read_text(encoding='utf-8'), '保留提示词')

    def test_cancel_and_missing_program_do_not_remove_anything(self):
        program = self.program('Prombee')
        result = subprocess.run(['/bin/sh', str(self.script), '--portable'], input='n\n', text=True, capture_output=True)
        self.assertEqual(result.returncode, 0)
        self.assertTrue(program.exists())
        program.unlink()
        result = subprocess.run(['/bin/sh', str(self.script), '--portable'], input='y\n', text=True, capture_output=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertTrue(self.data.is_dir())

    def test_rpm_and_deb_only_request_native_authorized_package_removal(self):
        commands = self.folder / 'commands'
        commands.mkdir()
        log = self.folder / 'command.log'
        for name, body in [('id', 'echo 1000'), ('dnf', 'exit 0'), ('apt-get', 'exit 0'),
                           ('pkexec', 'printf "%s\\n" "$@" > "$UNINSTALL_TEST_LOG"')]:
            path = commands / name
            path.write_text('#!/bin/sh\n' + body + '\n')
            path.chmod(0o755)
        env = {**os.environ, 'PATH': str(commands) + os.pathsep + os.environ['PATH'], 'UNINSTALL_TEST_LOG': str(log)}
        for mode, manager in [('--rpm', 'dnf'), ('--deb', 'apt-get')]:
            result = subprocess.run(['/bin/sh', str(self.script), mode], input='yes\n', env=env, text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(log.read_text().splitlines(), [str(commands / manager), '-y', 'remove', 'prombee'])
            self.assertTrue(self.data.is_dir())


if __name__ == '__main__':
    unittest.main()
