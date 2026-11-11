"""Local groups and self-contained UTF-8 TXT prompt sets."""
from pathlib import Path
from html import escape
from html.parser import HTMLParser
from contextlib import contextmanager, nullcontext
import hashlib
import json
import os
import tempfile
import time
import uuid
from .filelock import exclusive_file_lock

MAGIC = 'Prombee TXT 1'


class ConflictError(Exception):
    pass


def text_of(html):
    class Reader(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.parts = []
        def handle_data(self, data):
            self.parts.append(data)
        def handle_starttag(self, tag, attrs):
            if tag == 'br': self.parts.append('\n')
        def handle_endtag(self, tag):
            if tag in ('p', 'div') and self.parts and not self.parts[-1].endswith('\n'):
                self.parts.append('\n')
    parser = Reader()
    parser.feed(html)
    return ''.join(parser.parts).removesuffix('\n')


def as_html(text):
    return escape(text, quote=False).replace('\n', '<br>')


def encode_workspace(state, revision):
    """Readable node text follows metadata; no companion file is needed to reopen it."""
    settings = {key: value for key, value in state.items() if key not in ('documents', 'template', 'common')}
    lines = [MAGIC, '@settings ' + json.dumps({'revision': revision, 'state': settings}, ensure_ascii=False)]
    collections = [('document', doc) for doc in state['documents']]
    collections += [(key, state[key]) for key in ('template', 'common') if key in state]
    for kind, collection in collections:
        meta = {k: v for k, v in collection.items() if k != 'nodes'}
        lines += ['', '@' + kind + ' ' + json.dumps(meta, ensure_ascii=False)]
        for node in collection['nodes']:
            meta = {k: v for k, v in node.items() if k != 'html'}
            body = text_of(node['html'])
            # Keep visual formatting, but external edits to the text always take precedence.
            if node['html'] != as_html(body): meta['richHTML'] = node['html']
            lines.append('@node ' + json.dumps(meta, ensure_ascii=False))
            lines.extend('| ' + line for line in body.split('\n'))
    return '\n'.join(lines) + '\n'


def decode_workspace(text, seed):
    text = text.removeprefix('\ufeff').replace('\r\n', '\n').replace('\r', '\n')
    if not text.startswith(MAGIC + '\n'):
        state = json.loads(json.dumps(seed))
        state['documents'] = [{'id': str(uuid.uuid4()), 'name': '第1轮', 'fromText': True, 'nodes': [
            {'id': str(uuid.uuid4()), 'kind': 'item', 'level': 1, 'html': as_html(text.removesuffix('\n')), 'raw': True}]}]
        state['current'] = state['documents'][0]['id']
        return {'revision': 0, 'state': state}
    state, revision, collection, node, body = {'documents': []}, 0, None, None, []
    def finish():
        nonlocal node, body
        if node is None: return
        content = '\n'.join(body)
        rich = node.pop('richHTML', None)
        node['html'] = rich if isinstance(rich, str) and text_of(rich) == content else as_html(content)
        collection['nodes'].append(node)
        node, body = None, []
    for line in text.split('\n')[1:]:
        if line.startswith('| '):
            if node is None: raise ValueError('词集正文缺少条目标记')
            body.append(line[2:]); continue
        if not line: continue
        if not line.startswith('@') or ' ' not in line: raise ValueError('词集格式无效，原文件未修改')
        kind, raw = line[1:].split(' ', 1)
        value = json.loads(raw)
        if not isinstance(value, dict): raise ValueError('词集标记无效')
        if kind == 'node':
            finish()
            if collection is None: raise ValueError('词集缺少轮次')
            node = value
        else:
            finish()
            if kind == 'settings':
                state.update(value['state']); revision = value['revision']
            elif kind in ('document', 'template', 'common'):
                collection = {**value, 'nodes': []}
                if kind == 'document': state['documents'].append(collection)
                else: state[kind] = collection
            else: raise ValueError('未知词集标记')
    finish()
    if not isinstance(revision, int) or revision < 0: raise ValueError('词集版本无效')
    return {'revision': revision, 'state': state}


def atomic_write(path, text):
    path = Path(path)
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name + '.', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as output:
            output.write(text); output.flush(); os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def safe_name(name):
    name = str(name).strip()
    if not name or name in ('.', '..') or any(c in name for c in '/\\\0<>:"|?*') or name.endswith(('.', ' ')):
        raise ValueError('名称不能为空，也不能包含路径或特殊文件字符')
    return name


class Library:
    def __init__(self, root, data_dir, validate):
        self.root, self.data_dir, self.validate = Path(root), Path(data_dir), validate
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.registry = self.data_dir / 'library.json'
        self.seed = json.loads((self.root / 'seed.json').read_text(encoding='utf-8'))
        self.lock_dir = Path(tempfile.gettempdir()) / 'prombee-file-locks'
        self.lock_dir.mkdir(exist_ok=True)
        with self.transaction():
            if not self.registry.exists():
                legacy = self.data_dir / 'workspace.json'
                package = json.loads(legacy.read_text(encoding='utf-8')) if legacy.exists() else {'revision': 0, 'state': self.seed}
                if not self.validate(package['state']): raise ValueError('原有工作区格式无效，未迁移')
                path = self.data_dir / '当前词集.txt'
                if not path.exists(): atomic_write(path, encode_workspace(package['state'], package['revision']))
                entry = self.entry(path)
                self.write_registry({'version': 2, 'active': entry['id'], 'sets': [entry], 'groups': [{'id': 'ungrouped', 'name': '未分组', 'pinned': False}]})
            self.migrate_registry()

    def migrate_registry(self):
        value = self.read_registry()
        if value.get('version') == 2: return
        # Keep the original registry and archived files intact for manual recovery.
        backup = self.data_dir / 'library-v1-backup.json'
        if not backup.exists(): atomic_write(backup, json.dumps(value, ensure_ascii=False, indent=2))
        value['groups'] = [{'id': 'ungrouped', 'name': '未分组', 'pinned': False}] + [
            {'id': p['id'], 'name': p['name'], 'pinned': False} for p in value.pop('projects', [])]
        for entry in value['sets']:
            entry['groupId'] = entry.pop('projectId', None) or 'ungrouped'
        value.pop('trash', None)
        value['version'] = 2
        self.write_registry(value)

    def group_id(self, registry, requested):
        group_id = requested or 'ungrouped'
        if not any(g['id'] == group_id for g in registry['groups']): raise ValueError('分组不存在')
        return group_id

    @contextmanager
    def transaction(self):
        with exclusive_file_lock(self.data_dir / '.workspace.lock'):
            yield

    @contextmanager
    def file_lock(self, path):
        key = hashlib.sha256(str(Path(path).resolve()).casefold().encode()).hexdigest()
        with exclusive_file_lock(self.lock_dir / key): yield

    def read_registry(self):
        registry = json.loads(self.registry.read_text(encoding='utf-8'))
        journal = self.data_dir / '.rename-pending.json'
        if journal.exists():
            pending = json.loads(journal.read_text(encoding='utf-8'))
            old, target = Path(pending['old']), Path(pending['target'])
            entry = next((s for s in registry['sets'] if s['id'] == pending['id']), None)
            # Recover a process interrupted between the file move and index write.
            if entry and not old.exists() and target.is_file():
                entry.update(name=target.stem, path=str(target))
                self.write_registry(registry)
            if old.exists() or target.is_file(): journal.unlink()
        return registry

    def write_registry(self, value):
        atomic_write(self.registry, json.dumps(value, ensure_ascii=False, indent=2))

    def entry(self, path, group_id="ungrouped"):
        return {'id': str(uuid.uuid4()), 'name': path.stem, 'path': str(path.resolve()), 'groupId': group_id, 'lastOpened': time.time()}

    def find(self, registry, set_id=None):
        entry = next((s for s in registry['sets'] if s['id'] == (set_id or registry['active'])), None)
        if entry is None: raise ValueError('请选择或新建一个词集')
        return entry

    def read_entry(self, entry):
        path = Path(entry['path'])
        if path.suffix.lower() != '.txt': raise ValueError('仅支持 .txt 词集')
        if path.stat().st_size > 20 * 1024 * 1024: raise ValueError('词集超过 20 MB')
        raw = path.read_bytes()
        try: text = raw.decode('utf-8-sig')
        except UnicodeDecodeError:
            try: text = raw.decode('utf-16')
            except UnicodeDecodeError: raise ValueError('请使用 UTF-8 或 UTF-16 编码的文本文件')
        package = decode_workspace(text, self.seed)
        if not self.validate(package['state']): raise ValueError('词集内容格式无效，未修改文件')
        return {**package, 'set': entry, 'fingerprint': hashlib.sha256(raw).hexdigest()}

    def load(self, set_id=None):
        with self.transaction():
            registry = self.read_registry()
            return self.read_entry(self.find(registry, set_id))

    def save(self, payload):
        if not self.validate(payload.get('state')): raise ValueError('Invalid workspace')
        with self.transaction():
            registry = self.read_registry()
            entry = self.find(registry, payload.get('setId'))
            with self.file_lock(entry['path']):
                old = self.read_entry(entry)
                if payload.get('baseRevision') != old['revision'] or (payload.get('baseFingerprint') and payload['baseFingerprint'] != old['fingerprint']):
                    raise ConflictError('词集已被另一窗口或外部程序修改，请先复制内容后重新打开')
                revision = old['revision'] + 1
                text = encode_workspace(payload['state'], revision)
                atomic_write(entry['path'], text)
                return {'revision': revision, 'fingerprint': hashlib.sha256(text.encode('utf-8')).hexdigest()}

    def snapshot(self):
        with self.transaction(): return self.read_registry()

    def action(self, request):
        action = request.get('action')
        with self.transaction():
            registry = self.read_registry()
            if action == 'createSet':
                folder = Path(request.get('folder', '')).expanduser().resolve()
                if not request.get('folder') or not folder.is_dir(): raise ValueError('请先选择保存位置')
                name = safe_name(request.get('name', ''))
                name = safe_name(name[:-4] if name.lower().endswith('.txt') else name)
                group_id = self.group_id(registry, request.get('groupId'))
                path = folder / (name + '.txt')
                if path.exists(): raise ValueError('同名文件已存在，未覆盖')
                state = json.loads(json.dumps(self.seed))
                with path.open('x', encoding='utf-8', newline='\n') as output:
                    output.write(encode_workspace(state, 0))
                entry = self.entry(path)
                entry['groupId'] = group_id
                registry['sets'].append(entry); registry['active'] = entry['id']
            elif action in ('openSet', 'activateSet'):
                if action == 'openSet':
                    path = Path(request.get('path', '')).expanduser().resolve()
                    entry = next((s for s in registry['sets'] if s['path'] == str(path)), None)
                    candidate = entry or self.entry(path)
                    self.read_entry(candidate)
                    if entry is None:
                        entry = candidate
                        entry['groupId'] = self.group_id(registry, request.get('groupId'))
                        registry['sets'].append(entry)
                else: entry = self.find(registry, request.get('id')); self.read_entry(entry)
                entry['lastOpened'] = time.time(); registry['active'] = entry['id']
            elif action == 'createGroup':
                registry['groups'].append({'id': str(uuid.uuid4()), 'name': safe_name(request.get('name', '')), 'pinned': False})
            elif action in ('renameGroup', 'pinGroup', 'deleteGroup'):
                group = next((g for g in registry['groups'] if g['id'] == request.get('id')), None)
                if group is None: raise ValueError('分组不存在')
                if action == 'pinGroup': group['pinned'] = not group.get('pinned', False)
                else:
                    if group['id'] == 'ungrouped': raise ValueError('未分组不可重命名或删除')
                    if action == 'renameGroup': group['name'] = safe_name(request.get('name', ''))
                    else:
                        registry['groups'].remove(group)
                        for entry in registry['sets']:
                            if entry['groupId'] == group['id']: entry['groupId'] = 'ungrouped'
            elif action == 'reorderGroups':
                ids = request.get('ids', [])
                if len(ids) != len(registry['groups']) or set(ids) != {g['id'] for g in registry['groups']}:
                    raise ValueError('分组顺序无效')
                by_id = {g['id']: g for g in registry['groups']}
                registry['groups'] = [by_id[i] for i in ids]
            elif action == 'renameSet':
                entry = self.find(registry, request.get('id'))
                old = Path(entry['path'])
                name = safe_name(request.get('name', ''))
                name = safe_name(name[:-4] if name.lower().endswith('.txt') else name)
                target = old.with_name(name + '.txt')
                if target != old:
                    journal = self.data_dir / '.rename-pending.json'
                    with self.file_lock(old), (self.file_lock(target) if str(old).casefold() != str(target).casefold() else nullcontext()):
                        if target.exists() and not old.samefile(target): raise ValueError('同名文件已存在，未覆盖')
                        atomic_write(journal, json.dumps({'id':entry['id'], 'old':str(old), 'target':str(target)}, ensure_ascii=False))
                        try:
                            old.rename(target)
                            entry.update(name=name, path=str(target))
                            self.write_registry(registry)
                        except Exception:
                            # Never leave the persisted registry pointing at a moved file.
                            if target.exists() and not old.exists(): target.rename(old)
                            journal.unlink(missing_ok=True)
                            raise
                        journal.unlink(missing_ok=True)
                    return registry
            elif action == 'assignGroup':
                entry = self.find(registry, request.get('id'))
                entry['groupId'] = self.group_id(registry, request.get('groupId'))
            elif action == 'deleteSet':
                entry = self.find(registry, request.get('id'))
                # Removing a registration never deletes the user's standalone TXT file.
                registry['sets'].remove(entry)
                if registry['active'] == entry['id']: registry['active'] = registry['sets'][0]['id'] if registry['sets'] else None
            else: raise ValueError('未知操作')
            self.write_registry(registry)
            return registry
