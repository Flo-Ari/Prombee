"""Shared floating-window state, preferences and exact 300ms morph geometry."""
import json
from pathlib import Path

ORB_WIDTH, ORB_HEIGHT = 520, 420
MORPH_MS = 300


def morph_layout(editor, orb, logo, direction="right"):
    """All points are CSS/logical screen pixels; preserve negative monitor origins."""
    x, y = min(editor[0], orb[0]), min(editor[1], orb[1])
    right, bottom = max(editor[0]+editor[2], orb[0]+orb[2]), max(editor[1]+editor[3], orb[1]+orb[3])
    return (x, y, right-x, bottom-y), {
        'editor': {'x': editor[0]-x, 'y': editor[1]-y, 'width': editor[2], 'height': editor[3]},
        'from': {'x': orb[0]-x+ORB_WIDTH/2+(31 if direction=='right' else -31), 'y': orb[1]-y+ORB_HEIGHT/2-6},
        'to': {'x': editor[0]-x+logo['x'], 'y': editor[1]-y+logo['y']},
    }


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
