"""Device-local positions for each page's tool bar."""
import json
from pathlib import Path
from .filelock import exclusive_file_lock

PAGES = {'editor','template','common','preview','compare','shortcuts','floating','updates','other'}

class LayoutPreferences:
    def __init__(self, data): self.path=Path(data)/'layout.json'

    def load(self):
        try:
            saved=json.loads(self.path.read_text(encoding='utf-8'))
            if not isinstance(saved,dict):saved={}
        except (OSError,ValueError):saved={}
        return {'positions':{k:v for k,v in saved.items() if k in PAGES and v in ('left','top')}}

    def save(self, payload):
        page,position=payload.get('page'),payload.get('position')
        if not isinstance(page,str) or page not in PAGES or position not in ('left','top'):
            raise ValueError('工具栏位置无效')
        self.path.parent.mkdir(parents=True,exist_ok=True)
        with exclusive_file_lock(self.path.with_suffix('.lock')):
            positions=self.load()['positions'];positions[page]=position
            temporary=self.path.with_suffix('.tmp')
            temporary.write_text(json.dumps(positions),encoding='utf-8');temporary.replace(self.path)
        return {'positions':positions}
