"""Transport/lifecycle regressions for the FastAPI migration, with isolated data."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
from fastapi import FastAPI
from fastapi.testclient import TestClient
from prombee.api.app import create_app
from prombee.services.application import ApplicationServices

ROOT = Path(__file__).resolve().parents[1]


class ApiTests(unittest.TestCase):
    def test_services_are_usable_without_http_and_native_picker_is_injected(self):
        with tempfile.TemporaryDirectory() as directory:
            calls = []
            services = ApplicationServices(ROOT, Path(directory), picker=lambda *args: calls.append(args) or None)
            try:
                self.assertEqual(services.write('picker', {'kind': 'file'}), {'path': None})
                self.assertEqual(calls, [('file', '')])
                self.assertIn('documents', services.read('state', {})['state'])
            finally:
                services.close()

    def test_failed_save_recovery_is_independent_and_does_not_overwrite_source(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(ROOT, directory, dev=True)
            with TestClient(app) as client:
                original = client.get('/api/state').json()
                source = Path(original['set']['path'])
                before = source.read_bytes()
                state = original['state']
                state['documents'][0]['nodes'][0]['html'] = '未保存编辑内容' * 10000
                response = client.post('/api/recovery', json={'state':state, 'setId':original['set']['id'], 'reason':'保存冲突'})
                self.assertEqual(response.status_code, 200)
                path = Path(response.json()['path'])
                self.assertEqual(path.parent, Path(directory) / 'recovery')
                self.assertEqual(source.read_bytes(), before)
                from prombee.services.library import decode_workspace
                self.assertEqual(decode_workspace(path.read_text(encoding='utf-8'), app.state.services.library.seed)['state'], state)
                second = client.post('/api/recovery', json={'state':state})
                self.assertNotEqual(second.json()['path'], str(path))
                self.assertEqual(client.post('/api/recovery', json={'state':{}}).status_code, 400)

    def test_fastapi_transport_security_schema_errors_and_shutdown_cleanup(self):
        with tempfile.TemporaryDirectory() as directory:
            app = create_app(ROOT, directory, dev=True)
            self.assertIsInstance(app, FastAPI)
            with TestClient(app) as client:
                self.assertEqual(client.get('/api/openapi.json').status_code, 200)
                current = client.get('/api/state').json()
                self.assertIn('documents', current['state'])
                self.assertEqual(client.post('/api/display', content=b'{broken').status_code, 400)
                self.assertEqual(client.post('/api/display', json={'width': 1200}, headers={'Origin': 'https://foreign.example'}).status_code, 403)
                self.assertEqual(client.get('/api/state', headers={'Host': 'foreign.example'}).status_code, 403)
                self.assertEqual(client.get('/api/unknown').status_code, 404)
                self.assertEqual(client.get('/seed.json').status_code, 404)
                self.assertEqual(client.get('/%2e%2e/backend/prombee/__main__.py').status_code, 404)
                content = ('private temporary text\n' * 21).encode()
                asset = client.post('/api/attachments/upload?name=pasted.txt&temporary=1', content=content).json()
                path = Path(asset['path'])
                self.assertTrue(path.exists())
                response = client.get('/api/attachments/' + asset['id'], headers={'Range': 'bytes=0-6'})
                self.assertEqual(response.status_code, 206)
                self.assertEqual(response.content, b'private')
                self.assertIn('sandbox', response.headers['content-security-policy'])
                self.assertEqual(client.get('/').headers['content-type'], 'text/html; charset=utf-8')
            self.assertFalse(path.exists())
            self.assertTrue(app.state.services.closed)
