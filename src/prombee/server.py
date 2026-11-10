"""Loopback-only host shared by the desktop application and development preview."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, unquote
from threading import Thread
import json
from .library import Library, ConflictError


def valid(state):
    if not isinstance(state, dict) or not isinstance(state.get('documents'), list):
        return False
    if len(state['documents']) > 1000:
        return False
    collections = [state[key] for key in ('template', 'common') if key in state]
    if any(not isinstance(collection, dict) for collection in collections):
        return False
    for doc in state['documents'] + collections:
        if not isinstance(doc, dict) or not isinstance(doc.get('id'), str) or not isinstance(doc.get('name'), str) or not isinstance(doc.get('nodes'), list):
            return False
        for n in doc['nodes']:
            if not isinstance(n, dict) or n.get('kind') not in ('heading','item') or not isinstance(n.get('id'),str) or not isinstance(n.get('html'),str) or not isinstance(n.get('level'),int) or not 1 <= n['level'] <= 6 or any(key in n and not isinstance(n[key], bool) for key in ('excluded', 'collapsed', 'raw')):
                return False
    return (state.get('current') in [d['id'] for d in state['documents']] if state['documents'] else state.get('current') is None) and isinstance(state.get('dark'),bool) and isinstance(state.get('font'),str) and isinstance(state.get('size'),(int,float)) and 9 <= state['size'] <= 96


def create_server(root, data_dir, port=0, dev=False, native_bridge=False):
    root, data_dir = Path(root), Path(data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    library = Library(root, data_dir, valid)
    from .speech import Speech
    speech = Speech(data_dir)
    from .shortcuts import Shortcuts
    shortcuts = Shortcuts(data_dir)

    class Handler(BaseHTTPRequestHandler):
        def send(self,status,data,kind='application/json; charset=utf-8'):
            self.send_response(status)
            self.send_header('Content-Type',kind)
            self.send_header('Content-Length',str(len(data)))
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Content-Type-Options','nosniff')
            script_policy = "'self' 'unsafe-eval'" if native_bridge else "'self'"
            self.send_header('Content-Security-Policy',f"default-src 'self'; script-src {script_policy}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(data)

        def json(self,status,value):
            self.send(status,json.dumps(value,ensure_ascii=False).encode())

        def do_GET(self):
            path=unquote(urlsplit(self.path).path)
            if path == '/api/shortcuts':
                self.json(200, shortcuts.load())
            elif path == '/api/speech':
                self.json(200, speech.status())
            elif path in ('/api/state', '/api/library', '/api/fs'):
                try:
                    from urllib.parse import parse_qs
                    query = parse_qs(urlsplit(self.path).query)
                    if path == '/api/state': self.json(200, library.load(query.get('setId', [None])[0]))
                    elif path == '/api/library': self.json(200, library.snapshot())
                    else: self.json(200, library.browse(query.get('path', [None])[0]))
                except (ValueError, OSError, KeyError) as error:
                    self.json(400, {'error': str(error)})
            elif path=='/api/dev':
                stamp=max(f.stat().st_mtime_ns for f in (root/'web').iterdir() if f.is_file()) if dev else 0
                self.json(200,dict(enabled=dev,stamp=str(stamp)))
            elif path in ('/','/index.html','/app.js','/core.js','/style.css','/logo.svg','/review.js','/diagnostics.js','/library.js','/mascot.html','/mascot.js','/mascot.css','/desktop-chrome.js','/brand.js','/speech.js','/reorder.js','/edge-navigation.js','/shortcuts.js','/vendor/marked.esm.js','/vendor/purify.es.mjs'):
                f=root/'web'/('index.html' if path=='/' else path[1:])
                kind={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[f.suffix]
                self.send(200,f.read_bytes(),kind)
            else:
                self.json(404,dict(error='Not found'))

        def do_PUT(self):
            if self.path not in ('/api/state', '/api/library', '/api/speech', '/api/shortcuts'):
                self.json(404,dict(error='Not found'));return
            origin=self.headers.get('Origin')
            if origin and origin!=f'http://{self.headers.get("Host")}':
                self.json(403,dict(error='Origin rejected'));return
            try:
                length=int(self.headers.get('Content-Length',0))
                if not 0 < length <= 20*1024*1024:
                    self.json(413,dict(error='Workspace too large'));return
                payload=json.loads(self.rfile.read(length))
                if self.path == '/api/shortcuts':
                    result = shortcuts.save(payload)
                elif self.path == '/api/speech':
                    action=payload.get('action')
                    if action not in ('start','stop'):raise ValueError('Invalid speech action')
                    result = speech.start() if action=='start' else speech.stop()
                else:
                    result = library.save(payload) if self.path == '/api/state' else library.action(payload)
                self.json(200,result)
            except ConflictError as error:
                self.json(409,dict(error=str(error)))
            except (ValueError,AttributeError,TypeError,KeyError) as error:
                self.json(400,dict(error=str(error) or 'Invalid request'))
            except OSError as error:
                self.json(400,dict(error='文件操作失败：' + str(error)))

        do_POST=do_PUT

        def log_message(self,*args):
            pass

    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    server.speech = speech
    server.daemon_threads=True
    return server


def start_server(root,data_dir,port=0,dev=False,native_bridge=False):
    server=create_server(root,data_dir,port,dev,native_bridge)
    Thread(target=server.serve_forever,daemon=True).start()
    return server
