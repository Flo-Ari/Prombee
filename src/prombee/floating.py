"""Shared floating-window preferences and instant switching configuration."""
import json
from pathlib import Path

ORB_WIDTH, ORB_HEIGHT = 520, 420
SWITCH_DURATION_MS = 0


class FloatingPreferences:
    def __init__(self, data):
        self.path = Path(data) / 'floating.json'
        self.enabled = True
        self.direction = "left"
        try:
            saved=json.loads(self.path.read_text(encoding='utf-8'))
            self.enabled=saved.get('enabled') is not False
            self.direction='right' if saved.get('direction')=='right' else 'left'
        except (OSError, ValueError, AttributeError):
            pass

    def save(self, enabled, direction=None):
        self.enabled = bool(enabled)
        if direction in ("left","right"):self.direction=direction
        self.path.parent.mkdir(parents=True, exist_ok=True)
        temporary = self.path.with_suffix('.tmp')
        temporary.write_text(json.dumps({'enabled': self.enabled,'direction':self.direction}), encoding='utf-8')
        temporary.replace(self.path)
