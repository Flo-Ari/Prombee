"""Device-level display preferences, independent of software upgrades and TXT files."""
import json
from pathlib import Path
from .library import atomic_write
from .filelock import exclusive_file_lock
class DisplayPreferences:
    def __init__(self,data):self.path=Path(data)/'display.json'
    def load(self):
        try:value=json.loads(self.path.read_text(encoding='utf-8'));width=value.get('width',1120)
        except (OSError,ValueError,AttributeError):width=1120
        return {'width':width if isinstance(width,(float,int)) and 420<=width<=2400 else 1120}
    def save(self,payload):
        width=payload.get('width')
        if isinstance(width,bool) or not isinstance(width,(float,int)) or not 420<=width<=2400:raise ValueError('显示区宽度无效')
        with exclusive_file_lock(self.path.with_suffix('.lock')):atomic_write(self.path,json.dumps({'width':round(width)}))
        return self.load()
