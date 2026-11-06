"""Loopback-only host shared by the desktop application and development preview."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, unquote
from threading import RLock, Thread
import json
import mimetypes
import os
from .filelock import exclusive_file_lock
from contextlib import contextmanager


def valid(state):
    if not isinstance(state, dict) or not isinstance(state.get('documents'), list) or not state['documents']:
        return False
    if len(state['documents']) > 1000:
        return False
    template = state.get('template')
    if template is not None and not isinstance(template, dict):
        return False
    for doc in state['documents'] + ([template] if template is not None else []):
        if not isinstance(doc, dict) or not isinstance(doc.get('id'), str) or not isinstance(doc.get('name'), str) or not isinstance(doc.get('nodes'), list):
            return False
        for n in doc['nodes']:
            if not isinstance(n, dict) or n.get('kind') not in ('heading','item') or not isinstance(n.get('id'),str) or not isinstance(n.get('html'),str) or not isinstance(n.get('level'),int) or not 1 <= n['level'] <= 6 or ('excluded' in n and not isinstance(n['excluded'], bool)):
                return False
    return state.get('current') in [d['id'] for d in state['documents']] and isinstance(state.get('dark'),bool) and isinstance(state.get('font'),str) and isinstance(state.get('size'),(int,float)) and 9 <= state['size'] <= 96


def create_server(root, data_dir, port=0, dev=False, native_bridge=False):
    root, data_dir = Path(root), Path(data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    store = data_dir/'workspace.json'
    lock = RLock()
    @contextmanager
    def transaction():
        with lock, exclusive_file_lock(data_dir/'.workspace.lock'):
            yield
    def load():
        if store.exists():
            return json.loads(store.read_text(encoding='utf-8'))
        return dict(revision=0,state=json.loads((root/'seed.json').read_text(encoding='utf-8')))

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
            if path=='/api/state':
                with transaction():
                    self.json(200,load())
            elif path=='/api/dev':
                stamp=max(f.stat().st_mtime_ns for f in (root/'web').iterdir() if f.is_file()) if dev else 0
                self.json(200,dict(enabled=dev,stamp=str(stamp)))
            elif path in ('/','/index.html','/app.js','/core.js','/style.css','/logo.svg','/review.js','/diagnostics.js','/vendor/marked.esm.js','/vendor/purify.es.mjs'):
                f=root/'web'/('index.html' if path=='/' else path[1:])
                kind={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml'}[f.suffix]
                self.send(200,f.read_bytes(),kind)
            else:
                self.json(404,dict(error='Not found'))

        def do_PUT(self):
            if self.path!='/api/state':
                self.json(404,dict(error='Not found'));return
            origin=self.headers.get('Origin')
            if origin and origin!=f'http://{self.headers.get("Host")}':
                self.json(403,dict(error='Origin rejected'));return
            try:
                length=int(self.headers.get('Content-Length',0))
                if not 0 < length <= 20*1024*1024:
                    self.json(413,dict(error='Workspace too large'));return
                payload=json.loads(self.rfile.read(length))
                state=payload.get('state')
                if not valid(state):
                    self.json(400,dict(error='Invalid workspace'));return
                with transaction():
                    old=load()
                    if payload.get('baseRevision')!=old['revision']:
                        self.json(409,dict(error='Workspace changed',revision=old['revision']));return
                    result=dict(state=state,revision=old['revision']+1)
                    temp=store.with_suffix('.tmp')
                    temp.write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
                    os.replace(temp,store)
                self.json(200,dict(revision=result['revision']))
            except (ValueError,AttributeError,TypeError):
                self.json(400,dict(error='Invalid request'))
            except OSError:
                self.json(500,dict(error='Unable to save workspace'))

        do_POST=do_PUT

        def log_message(self,*args):
            pass

    server=ThreadingHTTPServer(('127.0.0.1',port),Handler)
    server.daemon_threads=True
    return server


def start_server(root,data_dir,port=0,dev=False,native_bridge=False):
    server=create_server(root,data_dir,port,dev,native_bridge)
    Thread(target=server.serve_forever,daemon=True).start()
    return server
