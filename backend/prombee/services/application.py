"""Application use cases, independent of HTTP and the GUI toolkit."""
from pathlib import Path
from typing import Callable, Protocol

from .attachments import Attachments
from .display import DisplayPreferences
from .floating import FloatingPreferences
from .library import Library
from .other import OtherSettings
from .shortcuts import Shortcuts
from .skills import SkillCatalog
from .speech import Speech
from .updater import Updater
from .validation import valid


class PathPicker(Protocol):
    def __call__(self, kind: str, initial: str) -> str | None: ...


class ApplicationServices:
    def __init__(self, root: Path, data_dir: Path, *, dev: bool = False,
                 picker: PathPicker | None = None):
        self.root, self.data_dir, self.dev = Path(root), Path(data_dir), dev
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.library = Library(self.root, self.data_dir, valid)
        self.attachments = Attachments(self.data_dir)
        self.display = DisplayPreferences(self.data_dir)
        self.floating = FloatingPreferences(self.data_dir)
        self.other = OtherSettings(self.data_dir)
        self.shortcuts = Shortcuts(self.data_dir)
        self.skills = SkillCatalog()
        self.speech = Speech(self.data_dir)
        self.updater = Updater(self.root, self.data_dir, dev=dev)
        if picker is None:
            from ..adapters.picker import choose_path
            picker = choose_path
        self.pick_path = picker
        self.floating_changed: Callable[[], object] | None = None
        self.closed = False

    def close(self):
        if self.closed:
            return
        self.closed = True
        self.updater.close()
        self.speech.stop()
        self.attachments.close()

    def read(self, resource: str, query: dict[str, str]):
        if resource == 'state':
            return self.attachments.restore_session(self.library.load(query.get('setId')))
        if resource == 'library': return self.library.snapshot()
        if resource == 'display': return self.display.load()
        if resource == 'floating': return self.floating.reload()
        if resource == 'other':
            return self.other.load() if query.get('preferences') == '1' else self.other.snapshot()
        if resource == 'shortcuts': return self.shortcuts.load()
        if resource == 'speech': return self.speech.status()
        if resource == 'update': return self.updater.snapshot()
        if resource == 'skills':
            prefs = self.other.load()
            registry = self.library.snapshot()
            entry = next((s for s in registry['sets'] if s['id'] == query.get('setId', registry.get('active'))), None)
            folder = prefs['agentSkillFolders'].get(prefs['targetAgent'], '')
            return self.skills.list(prefs['targetAgent'], folder, Path(entry['path']).parent if entry else None)
        if resource == 'dev':
            source = self.root / 'frontend'
            if not source.exists(): source = self.root / 'frontend/dist'
            stamp = max((f.stat().st_mtime_ns for f in source.rglob('*')
                         if f.is_file() and 'node_modules' not in f.parts), default=0) if self.dev else 0
            return {'enabled': self.dev, 'stamp': str(stamp)}
        raise KeyError(resource)

    def write(self, resource: str, payload: dict):
        if not isinstance(payload, dict): raise ValueError('Invalid request')
        if resource == 'recovery': return self.library.recovery(payload)
        if resource == 'state':
            result = self.library.save(payload)
            self.attachments.remember_session(payload['state'], payload.get('setId') or self.library.snapshot().get('active'))
            return result
        if resource == 'library':
            result = self.library.action(payload)
            if payload.get('action') == 'recoverSet':
                self.attachments.remember_session(payload['state'], result['active'])
            return result
        if resource == 'display': return self.display.save(payload)
        if resource == 'shortcuts': return self.shortcuts.save(payload)
        if resource == 'update': return self.updater.action(payload.get('action'))
        if resource == 'picker':
            kind, initial = payload.get('kind'), payload.get('initial', '')
            if kind not in ('folder', 'file', 'attachment', 'save', 'saveAttachment'):
                raise ValueError('文件选择类型无效')
            if not isinstance(initial, str): raise ValueError('文件位置无效')
            return {'path': self.pick_path(kind, initial)}
        if resource == 'floating':
            result = self.floating.set_orb_enabled(payload.get('enabled'))
            if self.floating_changed: self.floating_changed()
            return result
        if resource == 'speech':
            action = payload.get('action')
            if action not in ('start', 'stop'): raise ValueError('Invalid speech action')
            return self.speech.start() if action == 'start' else self.speech.stop()
        if resource == 'other': return self.other_action(payload)
        if resource == 'attachments': return self.attachment_action(payload)
        if resource == 'reset':
            if payload.get('confirm') is not True: raise ValueError('请先确认清除')
            with self.library.transaction():
                self.library.write_registry({'version': 2, 'active': None, 'sets': [],
                                             'groups': [{'id': 'ungrouped', 'name': '未分组', 'pinned': False}]})
                for name in ['other.json', 'shortcuts.json', 'shortcuts-version.json', 'floating.json', 'display.json']:
                    (self.data_dir / name).unlink(missing_ok=True)
            if self.floating_changed: self.floating_changed()
            return {'ok': True}
        raise KeyError(resource)

    def other_action(self, payload: dict):
        action = payload.get('action')
        if action == 'jump': return self.other.jump()
        if action == 'markdown': return self.other.markdown(payload.get('recognizeMarkdown'))
        if action == 'pairs': return self.other.editing('pairDelimiters', payload.get('pairDelimiters'))
        if action == 'autoSort': return self.other.editing('autoSort', payload.get('autoSort'))
        if action == 'agent': return self.other.agent(payload.get('targetAgent'))
        if action == 'skillFolder': return self.other.skill_folder(payload.get('targetAgent'), payload.get('folder'))
        if action == 'save': return self.other.save(payload)
        raise ValueError('其他设置操作无效')

    def attachment_action(self, payload: dict):
        attachments = self.attachments
        scope = attachments.validate_scope(payload.get('scope', []))
        action = payload.get('action')
        if action == 'references':
            return {'attachments': attachments.references(payload.get('text', ''), scope=scope)}
        if action == 'saveAs':
            entry = attachments.get(payload.get('id'))
            destination = self.pick_path('saveAttachment', entry['name'])
            return {'path': attachments.save_as(entry['id'], destination) if destination else None}
        if action in ('lookup', 'attach'):
            ids = payload.get('ids', [])
            if not isinstance(ids, list) or len(ids) > 100 or any(not isinstance(i, str) for i in ids):
                raise ValueError('附件标识无效')
            return {'attachments': attachments.import_paths(attachments.paths(ids), scope)
                    if action == 'attach' else [attachments.get(i) for i in ids]}
        if action == 'paths':
            paths = payload.get('paths', [])
            if not isinstance(paths, list) or len(paths) > 100 or any(not isinstance(p, str) for p in paths):
                raise ValueError('附件列表无效')
            return {'attachments': attachments.import_paths(paths, scope)}
        if action == 'pick':
            path = self.pick_path('attachment', '')
            return {'attachment': attachments.import_file(path, scope) if path else None}
        raise ValueError('附件操作无效')
