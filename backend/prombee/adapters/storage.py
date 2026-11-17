"""Atomic UTF-8 persistence shared by workspace and preference stores."""
from pathlib import Path
import os
import tempfile


def atomic_write(path, text):
    path = Path(path)
    fd, temporary = tempfile.mkstemp(prefix='.' + path.name + '.', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8', newline='\n') as output:
            output.write(text); output.flush(); os.fsync(output.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)

