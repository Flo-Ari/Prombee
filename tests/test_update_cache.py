"""Update lifecycle: background caching never grants installation permission."""
import hashlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import Mock, patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from prombee.services import updater as module


class Response(io.BytesIO):
    status = 200
    def __init__(self, raw):
        super().__init__(raw)
        self.headers = {'Content-Length': str(len(raw))}


class UpdateCacheTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        major, minor, point = module.version_key(module.__version__)
        self.next = f'{major}.{minor}.{point + 1}'
        self.newer = f'{major}.{minor}.{point + 2}'
        self.downloads = []

    def tearDown(self):
        self.temp.cleanup()

    def make(self):
        with patch.object(module, 'distribution_package_mode', return_value='rpm'):
            return module.Updater('/usr/share/prombee', self.folder)

    def raw(self, version):
        return ('verified package ' + version).encode()

    def release(self, version):
        return {'tag_name': 'v' + version, 'draft': False, 'prerelease': True,
                'assets': [{'name': name, 'state': 'uploaded'} for name in
                           [f'Prombee-{version}-Linux-RedHat-noarch.rpm', f'Prombee-{version}-SHA256.txt']]}

    def connect(self, updater, version):
        def fetch(url, limit=65536):
            if url == module.API: return json.dumps([self.release(version)]).encode()
            return (hashlib.sha256(self.raw(version)).hexdigest() + '  ' + updater.candidate['name'] + '\n').encode()
        updater.fetch = Mock(side_effect=fetch)

    def download(self, request, **kwargs):
        self.downloads.append(request.full_url)
        version = self.newer if '/v' + self.newer + '/' in request.full_url else self.next
        return Response(self.raw(version))

    def cache_next(self):
        updater = self.make()
        self.connect(updater, self.next)
        with patch('urllib.request.urlopen', side_effect=self.download): updater.refresh()
        return updater

    def test_startup_runs_once_caches_and_never_installs_or_prompts(self):
        updater = self.make()
        self.connect(updater, self.next)
        with patch.object(updater, 'run', side_effect=lambda f: f()), \
                patch('urllib.request.urlopen', side_effect=self.download), \
                patch('subprocess.run') as execute, patch('subprocess.Popen') as spawn, \
                patch.object(updater, 'install') as install, patch.object(updater, 'restart') as restart:
            updater.start_once()
            updater.start_once()
            self.assertEqual(updater.snapshot()['status'], 'ready')
            self.assertTrue(updater.snapshot()['cached'])
            self.assertTrue(updater.snapshot()['updateAvailable'])
            self.assertEqual(len(self.downloads), 1)
            execute.assert_not_called(); spawn.assert_not_called()
            install.assert_not_called(); restart.assert_not_called()
            updater.action('install')
            install.assert_called_once()

    def test_restart_reuses_verified_cache_and_still_checks_server_once(self):
        first = self.cache_next()
        restored = self.make()
        self.assertTrue(restored.snapshot()['updateAvailable'])
        self.connect(restored, self.next)
        with patch('urllib.request.urlopen') as download: restored.refresh()
        download.assert_not_called()
        self.assertEqual(restored.package, first.package)
        self.assertEqual(restored.snapshot()['status'], 'ready')
        self.assertEqual(restored.fetch.call_count, 1)

    def test_newer_release_deletes_old_package_before_downloading_new(self):
        updater = self.cache_next(); old = updater.package
        helper = updater.cache / 'restart.ps1'; helper.write_text('keep helper')
        note = updater.cache / 'notes.txt'; note.write_text('keep unrelated file')
        self.connect(updater, self.newer)
        def download(request, **kwargs):
            self.assertFalse(old.exists())
            return self.download(request, **kwargs)
        with patch('urllib.request.urlopen', side_effect=download): updater.refresh()
        self.assertEqual(updater.package.read_bytes(), self.raw(self.newer))
        self.assertEqual(json.loads(updater.record.read_text())['candidate']['version'], self.newer)
        self.assertTrue(helper.exists()); self.assertTrue(note.exists())
        self.assertEqual(len(list(updater.cache.glob('*.rpm'))), 1)

    def test_offline_restart_keeps_valid_cache_and_never_opens_authorization(self):
        self.cache_next(); restored = self.make()
        restored.fetch = Mock(side_effect=OSError('offline'))
        with patch('subprocess.run') as execute, patch('subprocess.Popen') as spawn:
            restored.refresh()
        self.assertEqual(restored.snapshot()['status'], 'ready')
        self.assertTrue(restored.snapshot()['updateAvailable'])
        self.assertEqual(restored.snapshot()['lastError'], 'offline')
        restored.verify(); execute.assert_not_called(); spawn.assert_not_called()

    def test_tampered_cache_is_replaced_instead_of_reused(self):
        updater = self.cache_next(); updater.package.write_bytes(b'bad')
        restored = self.make(); self.connect(restored, self.next)
        with patch('urllib.request.urlopen', side_effect=self.download): restored.refresh()
        self.assertEqual(len(self.downloads), 2)
        self.assertEqual(restored.package.read_bytes(), self.raw(self.next))
        restored.verify()

    def test_running_updated_version_clears_old_cache_and_notification(self):
        previous = self.cache_next()
        with patch.object(module, '__version__', self.next):
            updated = self.make(); self.connect(updated, self.next); updated.refresh()
            self.assertEqual(updated.snapshot()['status'], 'current')
            self.assertFalse(updated.snapshot()['updateAvailable'])
            self.assertFalse(previous.package.exists())
            self.assertFalse(previous.record.exists())

    def test_failed_or_cancelled_download_never_creates_ready_cache(self):
        updater = self.make(); self.connect(updater, self.next)
        with patch('urllib.request.urlopen', return_value=Response(b'wrong')):
            with self.assertRaisesRegex(ValueError, '校验'): updater.refresh()
        self.assertFalse(updater.record.exists())
        self.assertFalse(list(updater.cache.glob('*.part')))
        self.assertFalse(updater.snapshot()['cached'])
        with self.assertRaises(ValueError): updater.install()
        updater.close()
        with patch('urllib.request.urlopen', side_effect=self.download):
            with self.assertRaises(InterruptedError): updater.download()
        self.assertFalse(updater.record.exists())
        self.assertFalse(list(updater.cache.glob('*.part')))

    def test_development_preview_has_no_automatic_network_or_download(self):
        updater = module.Updater(Path.cwd(), self.folder, dev=True)
        with patch.object(updater, 'run') as run: updater.start_once()
        run.assert_not_called()


    def test_http_lifespan_starts_background_cache_once_without_installation(self):
        import time
        from fastapi.testclient import TestClient
        from prombee.api.app import create_app
        from prombee.services.application import ApplicationServices
        root = Path(__file__).resolve().parents[1]
        services = ApplicationServices(root, self.folder, dev=True)
        services.updater = self.make()
        self.connect(services.updater, self.next)
        app = create_app(root, self.folder, dev=True, services=services)
        with patch('urllib.request.urlopen', side_effect=self.download), \
                patch('subprocess.run') as execute, patch('subprocess.Popen') as spawn:
            with TestClient(app) as client:
                deadline = time.monotonic() + 3
                while time.monotonic() < deadline:
                    state = client.get('/api/update').json()
                    if state['status'] == 'ready': break
                    time.sleep(.01)
                self.assertEqual(state['status'], 'ready')
                self.assertTrue(state['updateAvailable'])
                self.assertEqual(client.post('/api/update', json={'action': 'startup'}).status_code, 200)
                self.assertEqual(len(self.downloads), 1)
                execute.assert_not_called(); spawn.assert_not_called()
        self.assertTrue(services.updater.stopped.is_set())
