#!/usr/bin/env python3
"""Check the frozen app's actual version without executing a foreign-platform binary."""
import re
import sys
import zlib
from pathlib import Path
from PyInstaller.archive.readers import CArchiveReader


def check(path, expected):
    archive = CArchiveReader(str(path)).open_embedded_archive('PYZ.pyz')
    _, offset, length = archive.toc['prombee']
    with Path(path).open('rb') as file:
        file.seek(archive._start_offset + offset)
        raw = zlib.decompress(file.read(length))
    versions = {value.decode() for value in re.findall(rb'(?<![0-9])\d+\.\d+\.\d+(?![0-9])', raw)}
    if versions != {expected}:
        raise ValueError(f'{Path(path).name}: expected {expected}, embedded version {sorted(versions)}')
    print(f'{Path(path).name}: embedded version {expected}')


if __name__ == '__main__':
    check(sys.argv[1], sys.argv[2])
