#!/usr/bin/env python3
"""Publish a complete preview release; never expose a partial update manifest."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
from release_retention import prune_releases

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--commit',required=True)
    parser.add_argument('--notes-file',type=Path,required=True)
    args=parser.parse_args()
    version=json.loads((ROOT/'frontend/package.json').read_text())['version']
    if not version.startswith('0.'):parser.error('This publisher is for pre-1.0 preview releases')
    folder=ROOT/'dist'/('release-'+version)
    folder.mkdir(exist_ok=True)
    inputs={'Prombee-'+version+'-Linux-x86_64-Portable':ROOT/'dist/Prombee',
            'Prombee-'+version+'-Windows-x64-Portable.exe':ROOT/'dist/windows/Prombee.exe',
            f'Prombee-{version}-Linux-Debian-all.deb':ROOT/f'dist/Prombee-{version}-Linux-Debian-all.deb'}
    rpms=list((ROOT/'dist').glob(f'Prombee-{version}-Linux-RedHat-noarch.rpm'))
    if len(rpms)!=1:parser.error('Exactly one tested RPM is required')
    inputs[rpms[0].name]=rpms[0]
    installer=ROOT/'dist/windows'/f'Prombee-{version}-Windows-x64-Setup.exe'
    inputs[installer.name]=installer
    uninstallers = {f'Prombee-{version}-Linux-Uninstall.sh': ROOT/'build_tools/packaging/linux/uninstall.sh',
                    f'Prombee-{version}-Windows-Uninstall.cmd': ROOT/'build_tools/packaging/windows/uninstall.cmd'}
    # Validate every executable before staging any release files. In particular,
    # a still-running Windows download must not silently reuse yesterday's EXE.
    bundle_python=ROOT/'.cache/prombee/build-venv/bin/python'
    for name,source in inputs.items():
        if not source.is_file() or source.stat().st_size<1000000:parser.error('Missing tested artifact: '+str(source))
        if source in (ROOT/'dist/Prombee',ROOT/'dist/windows/Prombee.exe'):
            subprocess.run([str(bundle_python),str(ROOT/'build_tools/check_bundle_version.py'),str(source),version],check=True)
    inputs.update(uninstallers)
    for name,source in inputs.items():
        shutil.copy2(source,folder/name)
        if hashlib.sha256(source.read_bytes()).digest()!=hashlib.sha256((folder/name).read_bytes()).digest():
            parser.error('Artifact changed during staging: '+str(source))
    manifest=folder/f'Prombee-{version}-SHA256.txt'
    manifest.write_text(''.join(hashlib.sha256((folder/name).read_bytes()).hexdigest()+'  '+name+'\n' for name in inputs))
    tag='v'+version
    subprocess.run(['gh','release','create',tag,'--repo','Flo-Ari/Prombee','--target',args.commit,'--draft','--prerelease','--title','Prombee '+version+' 预览版','--notes-file',str(args.notes_file)],check=True)
    subprocess.run(['gh','release','upload',tag,'--repo','Flo-Ari/Prombee',*[str(folder/name) for name in inputs],str(manifest)],check=True)
    subprocess.run(['gh','release','edit',tag,'--repo','Flo-Ari/Prombee','--draft=false','--prerelease'],check=True)
    prune_releases(apply=True, backup=folder/'previous-releases.json')

if __name__=='__main__':main()
