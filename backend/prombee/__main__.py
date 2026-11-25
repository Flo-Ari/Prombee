"""Desktop launcher; platform hosts are assembled inside their adapters."""
from importlib import import_module
from pathlib import Path
import os
import sys

if not getattr(sys, 'frozen', False):
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


def main():
    platform = 'windows' if os.name == 'nt' else 'linux'
    import_module(f'prombee.adapters.{platform}.host').main()


if __name__ == '__main__':
    main()
