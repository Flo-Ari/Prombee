"""Resolve bundled resources independently of platform adapter locations."""
from pathlib import Path
import sys


def resource_root():
    if getattr(sys, 'frozen', False):
        return Path(sys._MEIPASS)
    return Path(__file__).resolve().parents[2]


def application_root(root=None):
    """Writable application-relative paths must never point into a one-file extraction."""
    if getattr(sys, 'frozen', False):
        return Path(sys.executable).resolve().parent
    return Path(root) if root is not None else resource_root()
