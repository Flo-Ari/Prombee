"""Shared floating-window preferences and instant switching configuration."""
import json
from pathlib import Path
from .filelock import exclusive_file_lock

ORB_WIDTH, ORB_HEIGHT = 520, 420
SWITCH_DURATION_MS = 0


class FloatingPreferences:
    def __init__(self, data):
        self.path = Path(data) / 'floating.json'
        self.reload()

    def reload(self):
        try:
            saved = json.loads(self.path.read_text(encoding='utf-8'))
            if not isinstance(saved, dict): saved = {}
        except (OSError, ValueError): saved = {}
        self.enabled = saved.get('enabled') is not False
        self.orb_enabled = saved.get('orb_enabled') is not False
        self.direction = 'right' if saved.get('direction') == 'right' else 'left'
        position=saved.get('position')
        self.position=tuple(position) if isinstance(position,list) and len(position)==4 and all(isinstance(n,(int,float)) and not isinstance(n,bool) for n in position) and position[2]>0 and position[3]>0 else None
        return {'enabled': self.orb_enabled}

    def _save(self, **changes):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with exclusive_file_lock(self.path.with_suffix('.lock')):
            self.reload()
            for key, value in changes.items(): setattr(self, key, value)
            temporary = self.path.with_suffix('.tmp')
            temporary.write_text(json.dumps({'enabled': self.enabled,
                'orb_enabled': self.orb_enabled, 'direction': self.direction,'position':self.position}), encoding='utf-8')
            temporary.replace(self.path)
        return {'enabled': self.orb_enabled}

    def save(self, enabled, direction=None):
        changes = {'enabled': bool(enabled)}
        if direction in ('left', 'right'): changes['direction'] = direction
        return self._save(**changes)

    def set_orb_enabled(self, enabled):
        if not isinstance(enabled, bool): raise ValueError('悬浮球状态无效')
        return self._save(orb_enabled=enabled)

    def save_position(self,rect):
        if len(rect)!=4 or not all(isinstance(n,(int,float)) for n in rect):return
        position=tuple(round(n) for n in rect)
        if position!=self.position:self._save(position=position)
