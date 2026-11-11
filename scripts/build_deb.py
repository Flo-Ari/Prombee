#!/usr/bin/env python3
"""Build a source-based .deb using only Python's standard library.

The package intentionally uses the target distribution's GTK/WebKit libraries;
it never embeds PyInstaller binaries built on a different Linux distribution.
"""
import argparse
import hashlib
import io
import os
from pathlib import Path
import re
import tarfile
import time


ROOT = Path(__file__).resolve().parents[1]


def tar_bytes(files, timestamp):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode='w:xz', format=tarfile.GNU_FORMAT) as archive:
        directories = sorted({str(parent) for name in files for parent in Path(name).parents if str(parent) != '.'})
        for name in directories:
            entry = tarfile.TarInfo('./' + name)
            entry.type, entry.mode, entry.mtime = tarfile.DIRTYPE, 0o755, timestamp
            archive.addfile(entry)
        for name, (content, mode) in sorted(files.items()):
            entry = tarfile.TarInfo('./' + name)
            entry.size, entry.mode, entry.mtime = len(content), mode, timestamp
            archive.addfile(entry, io.BytesIO(content))
    return output.getvalue()


def ar_member(name, content, timestamp):
    header = f'{name + "/":<16}{timestamp:<12}{0:<6}{0:<6}{"100644":<8}{len(content):<10}`\n'.encode('ascii')
    assert len(header) == 60
    return header + content + (b'\n' if len(content) % 2 else b'')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version', default='0.9.3')
    parser.add_argument('--output', type=Path, default=ROOT / 'dist')
    args = parser.parse_args()
    if not re.fullmatch(r'[0-9][0-9A-Za-z.+~:-]*', args.version):
        parser.error('invalid Debian package version')
    timestamp = int(os.environ.get('SOURCE_DATE_EPOCH', time.time()))
    files = {}

    def add(source, destination, mode=0o644):
        files[destination] = (source.read_bytes(), mode)

    add(ROOT / 'LICENSE', 'usr/share/doc/prombee/copyright')
    add(ROOT / 'NOTICE', 'usr/share/doc/prombee/NOTICE')
    add(ROOT / 'desktop.py', 'usr/share/prombee/desktop.py')
    add(ROOT / 'seed.json', 'usr/share/prombee/seed.json')
    for directory in ('src', 'web'):
        for source in sorted((ROOT / directory).rglob('*')):
            if source.is_file() and '__pycache__' not in source.parts and source.suffix != '.pyc':
                add(source, 'usr/share/prombee/' + source.relative_to(ROOT).as_posix())
    add(ROOT / 'packaging/debian/prombee', 'usr/bin/prombee', 0o755)
    add(ROOT / 'packaging/debian/prombee.desktop', 'usr/share/applications/prombee.desktop')
    add(ROOT / 'web/logo.svg', 'usr/share/icons/hicolor/scalable/apps/prombee.svg')
    size = (sum(len(data) for data, _ in files.values()) + 1023) // 1024
    control = (ROOT / 'packaging/debian/control.in').read_text().replace('@VERSION@', args.version).replace('@SIZE@', str(size))
    md5sums = ''.join(f'{hashlib.md5(content).hexdigest()}  {name}\n' for name, (content, _) in sorted(files.items()))
    control_archive = tar_bytes({'control': (control.encode(), 0o644), 'md5sums': (md5sums.encode(), 0o644)}, timestamp)
    args.output.mkdir(parents=True, exist_ok=True)
    destination = args.output / f'prombee_{args.version}_all.deb'
    destination.write_bytes(b'!<arch>\n' + ar_member('debian-binary', b'2.0\n', timestamp) + ar_member('control.tar.xz', control_archive, timestamp) + ar_member('data.tar.xz', tar_bytes(files, timestamp), timestamp))
    print(destination)


if __name__ == '__main__':
    main()
