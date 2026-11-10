"""Device-level keyboard preferences, independent of prompt TXT documents."""
import json
import re
from pathlib import Path
from .library import atomic_write
from .filelock import exclusive_file_lock

IDS={'library','deleteRound','collapse','copyAll','insert','newRound','previous','next','save','copy','undo','redo','bold','italic','multi','exclude','delete','deleteEmpty','fold','preview','compare','editor','template','common','settings','theme','voice'}
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
    def load(self):
        try:
            value=json.loads(self.path.read_text(encoding='utf-8'))
            if isinstance(value,dict) and 'redoAlt' in value:
                alternate=value.pop('redoAlt')
                if not value.get('redo'):value['redo']=alternate
            value=validate(value)
        except (OSError,ValueError,TypeError):value={}
        return {'bindings':value}
    def save(self,payload):
        value=validate(payload.get('bindings'))
        self.path.parent.mkdir(parents=True,exist_ok=True)
        with exclusive_file_lock(self.path.with_suffix('.lock')):
            atomic_write(self.path,json.dumps(value,ensure_ascii=False))
        return {'bindings':value}
