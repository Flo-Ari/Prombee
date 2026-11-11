#!/usr/bin/env python3
"""Publish a complete preview release; never expose a partial update manifest."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--commit',required=True)
    parser.add_argument('--notes-file',type=Path,required=True)
    args=parser.parse_args()
    version=json.loads((ROOT/'package.json').read_text())['version']
    if not version.startswith('0.'):parser.error('This publisher is for pre-1.0 preview releases')
    folder=ROOT/'dist'/('release-'+version)
    folder.mkdir(exist_ok=True)
    inputs={'Prombee-'+version:ROOT/'dist/Prombee',
            'Prombee-'+version+'.exe':ROOT/'dist/windows/Prombee.exe',
            f'prombee_{version}_all.deb':ROOT/f'dist/prombee_{version}_all.deb'}
    rpms=list((ROOT/'dist').glob(f'prombee-{version}-*.noarch.rpm'))
    if len(rpms)!=1:parser.error('Exactly one tested RPM is required')
    inputs[rpms[0].name]=rpms[0]
    for name,source in inputs.items():
        if not source.is_file() or source.stat().st_size<1000000:parser.error('Missing tested artifact: '+str(source))
        shutil.copy2(source,folder/name)
    manifest=folder/f'Prombee-{version}-SHA256.txt'
    manifest.write_text(''.join(hashlib.sha256((folder/name).read_bytes()).hexdigest()+'  '+name+'\n' for name in inputs))
    tag='v'+version
    subprocess.run(['gh','release','create',tag,'--repo','Flo-Ari/Prombee','--target',args.commit,'--draft','--prerelease','--title','Prombee '+version+' 预览版','--notes-file',str(args.notes_file)],check=True)
    subprocess.run(['gh','release','upload',tag,'--repo','Flo-Ari/Prombee',*[str(folder/name) for name in inputs],str(manifest)],check=True)
    subprocess.run(['gh','release','edit',tag,'--repo','Flo-Ari/Prombee','--draft=false','--prerelease'],check=True)

if __name__=='__main__':main()
