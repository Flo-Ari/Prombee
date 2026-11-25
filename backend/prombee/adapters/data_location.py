"""Stable startup data locations for source, portable and system installations."""
import json
import os
from pathlib import Path
import sys
import tempfile

from .storage import atomic_write


def writable_folder(folder):
    folder = Path(folder)
    folder.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryFile(dir=folder): pass
    return folder.resolve()


def user_application_folder():
    if sys.platform == 'win32':
        return Path(os.environ.get('LOCALAPPDATA') or Path.home() / 'AppData/Local') / 'Prombee'
    return Path(os.environ.get('XDG_DATA_HOME') or Path.home() / '.local/share') / 'prombee'


def resolve_data_folder(application_dir, explicit=None, choose=None, *, user_directory=None):
    application_dir = Path(application_dir).resolve()
    user = Path(user_directory) if user_directory is not None else user_application_folder()
    pointer = application_dir / 'data-location.json'
    user_pointer = user / 'data-location.json'

    def remember(folder):
        text = json.dumps({'path': str(folder), 'application': str(application_dir)}, ensure_ascii=False)
        try: atomic_write(pointer, text)
        except OSError:
            user.mkdir(parents=True, exist_ok=True)
            atomic_write(user_pointer, text)
        return folder

    def recalled(record):
        try:
            value = json.loads(record.read_text(encoding='utf-8'))
            folder = Path(value['path'])
            if not folder.is_absolute() or not folder.is_dir(): raise ValueError('数据文件夹不可用')
            return writable_folder(folder)
        except (OSError, ValueError, KeyError, TypeError):
            if not choose: raise ValueError('上次的数据文件夹不可用，请重新选择')
            selected = choose()
            return remember(writable_folder(selected)) if selected else None

    if explicit:
        return writable_folder(Path(explicit).expanduser())
    # A replacement choice must outrank an obsolete, read-only installation record.
    if user_pointer.exists():
        try: matches = json.loads(user_pointer.read_text(encoding='utf-8')).get('application') == str(application_dir)
        except (OSError, ValueError, TypeError, AttributeError): matches = False
        if matches: return recalled(user_pointer)
    if pointer.exists(): return recalled(pointer)
    # Reuse old application-local data before creating an empty registry.
    old = application_dir / 'Prombee-data'
    if (old / 'library.json').is_file() and not (application_dir / 'data/library.json').is_file():
        return writable_folder(old)
    try:
        return writable_folder(application_dir / 'data')
    except OSError:
        # RPM/DEB and Program Files cannot hold per-user files. Remember their
        # location outside the installation tree, so upgrades cannot reset it.
        if user_pointer.exists(): return recalled(user_pointer)
        existing = user if (user / 'library.json').is_file() else user / 'data'
        try: return remember(writable_folder(existing))
        except OSError:
            if not choose: raise ValueError('数据目录不可写，请选择保存位置')
            selected = choose()
            return remember(writable_folder(selected)) if selected else None
