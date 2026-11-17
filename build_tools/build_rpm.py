#!/usr/bin/env python3
"""Build one distribution-neutral RPM for compatible Red Hat family systems without embedding another distribution's libraries."""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import tarfile

ROOT=Path(__file__).resolve().parents[1]


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--version',default=json.loads((ROOT/'frontend/package.json').read_text())['version'])
    parser.add_argument('--output',type=Path,default=ROOT/'dist')
    args=parser.parse_args()
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+',args.version):parser.error('invalid version')
    if not shutil.which('rpmbuild'):parser.error('rpmbuild is required; install package rpm-build')
    top=ROOT/'work'/('rpmbuild-'+args.version)
    for name in ('SOURCES','SPECS','BUILD','RPMS','SRPMS','BUILDROOT'):(top/name).mkdir(parents=True,exist_ok=True)
    files=[ROOT/p for p in ('desktop.py','seed.json','LICENSE','NOTICE','build_tools/packaging/linux/prombee','build_tools/packaging/linux/prombee.desktop')]
    for directory in ('backend','frontend/dist'):
        files.extend(p for p in (ROOT/directory).rglob('*') if p.is_file() and '__pycache__' not in p.parts and p.suffix!='.pyc')
    with tarfile.open(top/'SOURCES'/f'prombee-{args.version}.tar.gz','w:gz') as archive:
        for source in sorted(files):archive.add(source,arcname=f'prombee-{args.version}/'+source.relative_to(ROOT).as_posix())
    spec=top/'SPECS/prombee.spec'
    spec.write_text((ROOT/'build_tools/packaging/rpm/prombee.spec.in').read_text().replace('@VERSION@',args.version))
    subprocess.run(['rpmbuild','-bb','--define','_topdir '+str(top),'--define','_build_id_links none',str(spec)],check=True)
    args.output.mkdir(parents=True,exist_ok=True)
    for package in (top/'RPMS').rglob('prombee-*.rpm'):
        destination=args.output/f'Prombee-{args.version}-Linux-RedHat-noarch.rpm';shutil.copy2(package,destination);print(destination)


if __name__=='__main__':main()
