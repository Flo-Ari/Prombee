"""Loopback-only host shared by the desktop application and development preview."""
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlsplit, unquote
from threading import Thread
import json
import subprocess
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
            if not isinstance(n, dict) or n.get('kind') not in ('heading','item') or not isinstance(n.get('id'),str) or not isinstance(n.get('html'),str) or not isinstance(n.get('level'),int) or not 1 <= n['level'] <= 6 or any(key in n and not isinstance(n[key], bool) for key in ('excluded', 'collapsed', 'raw')) or n.get('listType', 'unordered') not in ('ordered', 'unordered', 'none'):
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

    from .updater import Updater
    updater = Updater(root, data_dir, dev=dev)

    from .other import OtherSettings
    other = OtherSettings(data_dir)

    from .floating import FloatingPreferences
    floating = FloatingPreferences(data_dir)

    from .skills import SkillCatalog
    skills = SkillCatalog()

    from .attachments import Attachments
    from .display import DisplayPreferences
    attachments=Attachments(data_dir)
    display=DisplayPreferences(data_dir)

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
            if path == '/api/display':
                self.json(200,display.load())
            elif path.startswith('/api/attachments/'):
                try:
                    entry=attachments.get(path.rsplit('/',1)[-1]);file=Path(entry['path']);size=file.stat().st_size
                    start,end=0,size-1
                    import re
                    header=self.headers.get('Range','')
                    if header:
                        match=re.fullmatch(r'bytes=(\d+)-(\d*)',header)
                        if not match:raise ValueError('附件范围无效')
                        start=int(match[1]);end=min(size-1,int(match[2]) if match[2] else size-1)
                        if not 0<=start<=end<size:raise ValueError('附件范围无效')
                    self.send_response(206 if header else 200);self.send_header('Content-Type',entry['type']);self.send_header('X-Content-Type-Options','nosniff');self.send_header('Accept-Ranges','bytes');self.send_header('Content-Security-Policy',"default-src 'none'; sandbox");self.send_header('Content-Length',str(max(0,end-start+1)))
                    if header:self.send_header('Content-Range',f'bytes {start}-{end}/{size}')
                    self.end_headers()
                    with file.open('rb') as stream:
                        stream.seek(start);remaining=end-start+1
                        while remaining>0:
                            chunk=stream.read(min(1024*1024,remaining))
                            if not chunk:break
                            self.wfile.write(chunk);remaining-=len(chunk)
                except (ValueError,OSError) as error:self.json(404,{'error':str(error)})
            elif path == '/api/floating':
                self.json(200, floating.reload())
            elif path == '/api/other':
                try:self.json(200, other.load() if urlsplit(self.path).query == 'preferences=1' else other.snapshot())
                except (ValueError,OSError,subprocess.TimeoutExpired) as error:self.json(400, {'error':str(error)})
            elif path == '/api/skills':
                try:
                    from urllib.parse import parse_qs
                    prefs=other.load();query=parse_qs(urlsplit(self.path).query);registry=library.snapshot()
                    entry=next((s for s in registry['sets'] if s['id']==query.get('setId',[registry.get('active')])[0]),None)
                    folder=prefs['agentSkillFolders'].get(prefs['targetAgent'],'')
                    self.json(200,skills.list(prefs['targetAgent'],folder,Path(entry['path']).parent if entry else None))
                except (ValueError,OSError) as error:self.json(400,{'error':str(error)})
            elif path == '/api/update':
                self.json(200, updater.snapshot())
            elif path == '/api/shortcuts':
                self.json(200, shortcuts.load())
            elif path == '/api/speech':
                self.json(200, speech.status())
            elif path in ('/api/state', '/api/library'):
                try:
                    from urllib.parse import parse_qs
                    query = parse_qs(urlsplit(self.path).query)
                    if path == '/api/state': self.json(200, library.load(query.get('setId', [None])[0]))
                    else: self.json(200, library.snapshot())
                except (ValueError, OSError, KeyError) as error:
                    self.json(400, {'error': str(error)})
            elif path=='/api/dev':
                stamp=max(f.stat().st_mtime_ns for f in (root/'web').iterdir() if f.is_file()) if dev else 0
                self.json(200,dict(enabled=dev,stamp=str(stamp)))
            elif path in ('/','/index.html','/app.js','/updates.js','/bars.js','/bars.css','/buttons.js','/buttons.css','/dropdowns.js','/dropdowns.css','/formatting.js','/entry-navigation.js','/pairs.js','/rounds.js','/skill-completion.js','/entry-metrics.js','/edge-surfaces.css','/entry-selection.js','/attachments.js','/display.js','/punctuation.js','/release-012.css','/release-013.css','/save-status.js','/header-indicator.js','/brand-lockup.svg','/brand-lockup-active.svg','/wordmark.svg','/hit-regions.js','/other.js','/core.js','/style.css','/logo.svg','/review.js','/diagnostics.js','/library.js','/mascot.html','/bee-art.js','/bee-source.png','/bee-alpha.png','/mascot.js','/mascot.css','/desktop-chrome.js','/brand.js','/speech.js','/reorder.js','/edge-navigation.js','/shortcuts.js','/vendor/marked.esm.js','/vendor/purify.es.mjs'):
                f=root/'web'/('index.html' if path=='/' else path[1:])
                kind={'.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'}[f.suffix]
                self.send(200,f.read_bytes(),kind)
            else:
                self.json(404,dict(error='Not found'))

        def do_PUT(self):
            if urlsplit(self.path).path=='/api/attachments/upload':
                origin=self.headers.get('Origin')
                if origin and origin!=f'http://{self.headers.get("Host")}':self.json(403,{'error':'Origin rejected'});return
                try:
                    from urllib.parse import parse_qs
                    name=parse_qs(urlsplit(self.path).query).get('name',['附件'])[0]
                    entry=attachments.add(name,self.rfile,int(self.headers.get('Content-Length',-1)))
                    self.json(200,entry)
                except (ValueError,OSError) as error:self.json(400,{'error':str(error)})
                return
            if self.path not in ('/api/state', '/api/library', '/api/speech', '/api/shortcuts', '/api/picker', '/api/update', '/api/other', '/api/floating','/api/attachments','/api/display','/api/reset'):
                self.json(404,dict(error='Not found'));return
            origin=self.headers.get('Origin')
            if origin and origin!=f'http://{self.headers.get("Host")}':
                self.json(403,dict(error='Origin rejected'));return
            try:
                length=int(self.headers.get('Content-Length',0))
                if not 0 < length <= 20*1024*1024:
                    self.json(413,dict(error='Workspace too large'));return
                payload=json.loads(self.rfile.read(length))
                if self.path == '/api/display':result=display.save(payload)
                elif self.path == '/api/attachments':
                    if payload.get('action')=='references':result={'attachments':attachments.references(payload.get('text',''))}
                    elif payload.get('action')=='lookup':
                        ids=payload.get('ids',[])
                        if not isinstance(ids,list) or len(ids)>100 or any(not isinstance(i,str) for i in ids):raise ValueError('附件标识无效')
                        result={'attachments':[attachments.get(i) for i in ids]}
                    elif payload.get('action')=='paths':
                        paths=payload.get('paths',[])
                        if not isinstance(paths,list) or len(paths)>100 or any(not isinstance(p,str) for p in paths):raise ValueError('附件列表无效')
                        result={'attachments':[attachments.import_file(p) for p in paths]}
                    elif payload.get('action')=='pick':
                        from .picker import choose_path
                        path=getattr(self.server,'pick_path',choose_path)('attachment','')
                        result={'attachment':attachments.import_file(path) if path else None}
                    else:raise ValueError('附件操作无效')
                elif self.path == '/api/reset':
                    if payload.get('confirm') is not True:raise ValueError('请先确认清除')
                    with library.transaction():
                        library.write_registry({'version':2,'active':None,'sets':[],'groups':[{'id':'ungrouped','name':'未分组','pinned':False}]})
                        for name in ['other.json','shortcuts.json','shortcuts-version.json','floating.json','display.json']:(data_dir/name).unlink(missing_ok=True)
                    callback=getattr(self.server,'floating_changed',None)
                    if callback:callback()
                    result={'ok':True}
                elif self.path == '/api/floating':
                    result = floating.set_orb_enabled(payload.get('enabled'))
                    callback = getattr(self.server, 'floating_changed', None)
                    if callback: callback()
                elif self.path == '/api/other':
                    action = payload.get('action')
                    if action=='jump':result=other.jump()
                    elif action=='markdown':result=other.markdown(payload.get('recognizeMarkdown'))
                    elif action=='pairs':result=other.editing('pairDelimiters',payload.get('pairDelimiters'))
                    elif action=='autoSort':result=other.editing('autoSort',payload.get('autoSort'))
                    elif action=='agent':result=other.agent(payload.get('targetAgent'))
                    elif action=='skillFolder':result=other.skill_folder(payload.get('targetAgent'),payload.get('folder'))
                    elif action=='save':result=other.save(payload)
                    else:raise ValueError('其他设置操作无效')
                elif self.path == '/api/update':
                    result = updater.action(payload.get('action'))
                elif self.path == '/api/picker':
                    kind = payload.get('kind')
                    if kind not in ('folder', 'file', 'attachment', 'save'): raise ValueError('文件选择类型无效')
                    initial = payload.get('initial', '')
                    if not isinstance(initial, str): raise ValueError('文件位置无效')
                    from .picker import choose_path
                    chosen = getattr(self.server, 'pick_path', choose_path)(kind, initial)
                    result = {'path': chosen}
                elif self.path == '/api/shortcuts':
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
    server.attachments = attachments
    server.speech = speech
    server.other = other
    server.daemon_threads=True
    return server


def start_server(root,data_dir,port=0,dev=False,native_bridge=False):
    server=create_server(root,data_dir,port,dev,native_bridge)
    Thread(target=server.serve_forever,daemon=True).start()
    return server
