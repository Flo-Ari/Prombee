"""Device-level keyboard preferences, independent of prompt TXT documents."""
import json
import re
from pathlib import Path
from ..adapters.storage import atomic_write
from ..adapters.filelock import exclusive_file_lock

IDS={'cutEntry','drag','library','deleteRound','collapse','copyAll','insert','newRound','previous','next','save','copy','undo','redo','bold','italic','multi','exclude','delete','deleteEmpty','fold','preview','compare','editor','template','common','settings','theme','voice'}
PATTERN=re.compile(r'^(Ctrl\+)?(Alt\+)?(Shift\+)?([A-Z0-9]|F([1-9]|1[0-2])|Arrow(Up|Down)|Backspace|Delete|Enter|Space|Home|End|PageUp|PageDown|Escape)$')

def validate(value):
    if not isinstance(value,dict) or set(value)!=IDS:raise ValueError('快捷键项目无效')
    seen=set()
    for key in value.values():
        if not isinstance(key,str) or len(key)>64:raise ValueError('快捷键格式无效')
        if not key:continue
        if not PATTERN.fullmatch(key):raise ValueError('快捷键格式无效')
        if 'Ctrl+' not in key and 'Alt+' not in key and not re.fullmatch(r'F\d+',key) and key not in ('ArrowUp','ArrowDown'):raise ValueError('请使用组合键')
        if key in ('Ctrl+Alt+Backspace','Ctrl+Alt+Delete','Alt+F4','Alt+Tab') or re.fullmatch(r'Ctrl\+Alt\+F\d+',key):raise ValueError('系统保留快捷键')
        if key in seen:raise ValueError('快捷键冲突')
        seen.add(key)
    return value

class Shortcuts:
    def __init__(self,folder):
        self.path=Path(folder)/'shortcuts.json'
        self.schema=self.path.with_name('shortcuts-version.json')
    def load(self):
        self.path.parent.mkdir(parents=True,exist_ok=True)
        with exclusive_file_lock(self.path.with_suffix('.lock')):return self._load()
    def _load(self):
        try:
            value=json.loads(self.path.read_text(encoding='utf-8'))
            if isinstance(value,dict) and 'redoAlt' in value:
                alternate=value.pop('redoAlt')
                if not value.get('redo'):value['redo']=alternate
            if isinstance(value,dict) and 'drag' not in value:
                value['drag']='' if 'Ctrl+Shift+G' in value.values() else 'Ctrl+Shift+G'
            if isinstance(value,dict) and 'cutEntry' not in value:
                value['cutEntry']='' if 'Ctrl+X' in value.values() else 'Ctrl+X'
            value=validate(value)
            try: schema = int(self.schema.read_text())
            except (OSError, ValueError): schema = 0
            if schema < 1:
                if not value.get('deleteRound') and 'Ctrl+Shift+D' not in value.values():value['deleteRound']='Ctrl+Shift+D'
            if schema < 2:
                for action, old, new in [('insert', 'Ctrl+N', 'Ctrl+Q'), ('fold', 'Ctrl+Shift+L', 'Ctrl+E')]:
                    if value.get(action) == old and new not in value.values(): value[action] = new
                atomic_write(self.path,json.dumps(value,ensure_ascii=False))
                atomic_write(self.schema,'2')
        except (OSError,ValueError,TypeError):value={}
        return {'bindings':value}
    def save(self,payload):
        value=validate(payload.get('bindings'))
        self.path.parent.mkdir(parents=True,exist_ok=True)
        with exclusive_file_lock(self.path.with_suffix('.lock')):
            atomic_write(self.path,json.dumps(value,ensure_ascii=False))
            atomic_write(self.schema,'2')
        return {'bindings':value}
