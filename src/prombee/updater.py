"""User-initiated, checksum-verified updates from this project's GitHub releases."""
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import threading
import urllib.request
from . import __version__

REPOSITORY = 'Flo-Ari/Prombee'
API = 'https://api.github.com/repos/' + REPOSITORY + '/releases?per_page=30'
VERSION = re.compile(r'^v?(\d+)\.(\d+)\.(\d+)$')
MAX_DOWNLOAD = 400 * 1024 * 1024


def version_key(value):
    match = VERSION.fullmatch(value or '')
    return tuple(map(int, match.groups())) if match else None


def choose_asset(names, version, mode):
    patterns = {'rpm':rf'prombee-{re.escape(version)}-\d+\.fc\d+\.noarch\.rpm',
                'deb':rf'prombee_{re.escape(version)}_all\.deb',
                'windows':rf'Prombee-{re.escape(version)}\.exe',
                'linux':rf'Prombee-{re.escape(version)}'}
    return next((name for name in names if mode in patterns and re.fullmatch(patterns[mode], name)), None)


class Updater:
    def __init__(self, root, data_dir, dev=False):
        self.root, self.data_dir = Path(root), Path(data_dir)
        self.lock = threading.RLock()
        self.mode = 'source'
        if not dev:
            if getattr(sys, 'frozen', False): self.mode = 'windows' if sys.platform == 'win32' else 'linux'
            elif self.root == Path('/usr/share/prombee'):
                os_release = Path('/etc/os-release').read_text() if Path('/etc/os-release').exists() else ''
                self.mode = 'rpm' if re.search(r'^ID=fedora$', os_release, re.M) else 'deb' if re.search(r'^ID=(ubuntu|debian)$', os_release, re.M) else 'source'
        if self.mode in ('linux','windows') and platform.machine().lower() not in ('x86_64','amd64'): self.mode='source'
        self.state = {'current':__version__, 'status':'idle', 'latest':None, 'progress':0, 'message':'', 'mode':self.mode,
                      'canInstall':self.mode != 'source', 'channel':'preview'}
        self.candidate = None
        self.package = None
        self.digest = None
        self.cache = self.data_dir / 'updates'

    def snapshot(self):
        with self.lock: return dict(self.state)

    def change(self, **values):
        with self.lock: self.state.update(values)

    def fetch(self, url, limit=65536):
        request = urllib.request.Request(url, headers={'User-Agent':'Prombee/'+__version__, 'Accept':'application/vnd.github+json' if url == API else 'application/octet-stream'})
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status != 200: raise ValueError('更新服务器返回异常状态')
            data = response.read(limit + 1)
        if len(data) > limit: raise ValueError('更新信息过大')
        return data

    def run(self, function):
        def worker():
            try: function()
            except Exception as error:
                self.change(status='error', message=str(error) or '更新失败，请重试')
        threading.Thread(target=worker, daemon=True).start()

    def action(self, action):
        with self.lock:
            if self.state['status'] in ('checking','downloading','installing','restart'): return self.snapshot()
            if action == 'check':
                self.change(status='checking', message='正在检查更新', progress=0)
                self.run(self.check)
            elif action == 'download':
                if not self.candidate or not self.state['canInstall']: raise ValueError('没有可安装的更新')
                self.change(status='downloading', message='正在下载更新', progress=0)
                self.run(self.download)
            elif action == 'install':
                if self.state['status'] != 'ready': raise ValueError('请先下载并校验更新')
                self.change(status='installing', message='正在安装更新')
                self.run(self.install)
            elif action == 'restart':
                if self.state['status'] != 'installed': raise ValueError('更新尚未安装')
                self.restart()
            else: raise ValueError('未知更新操作')
            return self.snapshot()

    def check(self):
        releases = json.loads(self.fetch(API, 2*1024*1024))
        if not isinstance(releases, list): raise ValueError('更新信息无效')
        candidates=[]
        for release in releases:
            key=version_key(release.get('tag_name'))
            if release.get('draft') or key is None: continue
            # Pre-1.0 users follow preview releases; stable users stay on stable releases.
            if version_key(__version__)[0] >= 1 and release.get('prerelease'): continue
            version='.'.join(map(str,key))
            assets={a['name']:a for a in release.get('assets',[]) if a.get('state')=='uploaded'}
            name=choose_asset(assets,version,self.mode)
            manifest=f'Prombee-{version}-SHA256.txt'
            if (name or self.mode=='source') and manifest in assets:
                candidates.append((key,version,name,manifest))
        if not candidates:
            self.candidate=None; self.change(status='current',message='暂无已发布的兼容更新');return
        key,version,name,manifest=max(candidates)
        self.change(latest=version)
        if key <= version_key(__version__):
            self.candidate=None;self.change(status='current',message='已是最新版本');return
        self.candidate={'version':version,'name':name,'manifest':manifest}
        self.change(status='available', message='发现新版本' if self.mode!='source' else '发现新版本，请在桌面版中更新')

    def url(self, name):
        from urllib.parse import quote
        return f'https://github.com/{REPOSITORY}/releases/download/v{self.candidate["version"]}/{quote(name)}'

    def download(self):
        candidate=dict(self.candidate)
        manifest=self.fetch(self.url(candidate['manifest'])).decode('utf-8')
        checksums={m.group(2):m.group(1).lower() for line in manifest.splitlines()
                   if (m:=re.fullmatch(r'([a-fA-F0-9]{64})\s+\*?([^/\\]+)',line))}
        expected=checksums.get(candidate['name'])
        if not expected: raise ValueError('安装包缺少校验信息')
        self.cache.mkdir(parents=True,exist_ok=True)
        target=self.cache/candidate['name']; partial=target.with_suffix(target.suffix+'.part')
        digest=hashlib.sha256();received=0
        try:
            request=urllib.request.Request(self.url(candidate['name']),headers={'User-Agent':'Prombee/'+__version__})
            with urllib.request.urlopen(request,timeout=60) as response, partial.open('wb') as output:
                if response.status != 200: raise ValueError('下载失败')
                total=int(response.headers.get('Content-Length',0))
                if total > MAX_DOWNLOAD: raise ValueError('安装包过大')
                while chunk:=response.read(256*1024):
                    received+=len(chunk)
                    if received > MAX_DOWNLOAD: raise ValueError('安装包过大')
                    output.write(chunk);digest.update(chunk)
                    self.change(progress=min(99,round(received/total*100)) if total else 0)
            if digest.hexdigest()!=expected: raise ValueError('安装包校验失败，未执行更新')
            partial.replace(target)
        finally: partial.unlink(missing_ok=True)
        self.package=target;self.digest=expected
        self.change(status='ready',message='下载校验完成',progress=100)

    def verify(self):
        if not self.package or not self.package.is_file(): raise ValueError('安装包不存在，请重新下载')
        digest=hashlib.sha256()
        with self.package.open('rb') as file:
            while chunk:=file.read(256*1024):digest.update(chunk)
        if digest.hexdigest()!=self.digest: raise ValueError('安装包校验失败，请重新下载')

    def install(self):
        self.verify()
        if self.mode in ('rpm','deb'):
            pkexec=shutil.which('pkexec')
            manager=shutil.which('dnf' if self.mode=='rpm' else 'apt-get')
            if not pkexec or not manager: raise ValueError('系统缺少图形安装授权组件')
            arguments=[pkexec,'--disable-internal-agent',manager,'-y','install']
            if self.mode=='rpm':arguments.append('--setopt=skip_if_unavailable=True')
            self.change(message='请在系统授权窗口中确认安装')
            result=subprocess.run([*arguments,str(self.package)],capture_output=True,timeout=900)
            if result.returncode in (126,127): raise ValueError('安装授权已取消或未通过，可重试')
            if result.returncode:
                detail=(result.stderr or result.stdout).decode(errors='replace')[-700:]
                raise ValueError('安装失败：'+detail)
            self.change(status='installed',message='安装完成，正在重启')
        elif self.mode in ('windows','linux'): self.restart(replace=True)
        else: raise ValueError('请在已安装的桌面版中更新')

    def restart(self, replace=False):
        if replace:self.verify()
        self.cache.mkdir(parents=True,exist_ok=True)
        target=Path(sys.executable).resolve() if self.mode in ('windows','linux') else Path('/usr/bin/prombee')
        stage=str(self.package) if replace else ''
        if replace:
            import tempfile
            # Fail before closing if this portable executable lives in a protected folder.
            with tempfile.TemporaryFile(dir=target.parent): pass
        log=(self.cache/'restart.log').open('ab')
        env=os.environ.copy()
        env.pop('WEBKIT_EXEC_PATH',None)
        if 'LD_LIBRARY_PATH_ORIG' in env:env['LD_LIBRARY_PATH']=env['LD_LIBRARY_PATH_ORIG']
        else:env.pop('LD_LIBRARY_PATH',None)
        env['PYINSTALLER_RESET_ENVIRONMENT']='1'
        try:
            if self.mode=='windows':
                helper=self.cache/'restart.ps1'
                helper.write_text(WINDOWS_RESTART,encoding='utf-8-sig')
                subprocess.Popen(['powershell.exe','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',str(helper),str(os.getpid()),str(target),stage,str(self.data_dir)],
                                 env=env,creationflags=0x08000000,stdout=log,stderr=log)
            else:
                helper=self.cache/'restart.sh';helper.write_text(LINUX_RESTART,encoding='utf-8')
                subprocess.Popen(['/bin/sh',str(helper),str(os.getpid()),str(target),stage,str(self.data_dir)],env=env,start_new_session=True,stdout=log,stderr=log)
        finally:log.close()
        self.change(status='restart',message='正在保存并重启')


LINUX_RESTART = '''#!/bin/sh
set -eu
old_pid=$1
target=$2
stage=$3
data_dir=$4
attempt=0
while kill -0 "$old_pid" 2>/dev/null; do
  attempt=$((attempt + 1))
  [ "$attempt" -lt 180 ] || exit 1
  sleep 1
done
if [ -n "$stage" ]; then
  cp -p "$target" "$target.previous"
  # Cache and executable may be on different filesystems: stage beside the target.
  cp "$stage" "$target.incoming"
  chmod u+x "$target.incoming"
  mv -f "$target.incoming" "$target"
fi
"$target" --data-dir "$data_dir" &
new_pid=$!
sleep 3
if kill -0 "$new_pid" 2>/dev/null; then
  [ -z "$stage" ] || rm -f "$target.previous" "$stage"
elif [ -n "$stage" ]; then
  mv -f "$target.previous" "$target"
  "$target" --data-dir "$data_dir" &
fi
'''

WINDOWS_RESTART = r'''param([int]$oldPid, [string]$target, [string]$stage, [string]$dataDir)
$ErrorActionPreference = 'Stop'
$deadline = (Get-Date).AddSeconds(180)
while (Get-Process -Id $oldPid -ErrorAction SilentlyContinue) {
  if ((Get-Date) -gt $deadline) { exit 1 }
  Start-Sleep -Milliseconds 250
}
$backup = $target + '.previous'
$replaced = $false
try {
  Copy-Item -LiteralPath $target -Destination $backup -Force
  Copy-Item -LiteralPath $stage -Destination ($target + '.incoming') -Force
  # The one-file bootloader can outlive its Python child briefly.
  $replaceDeadline = (Get-Date).AddSeconds(60)
  while (-not $replaced) {
    try {
      Move-Item -LiteralPath ($target + '.incoming') -Destination $target -Force
      $replaced = $true
    } catch {
      if ((Get-Date) -ge $replaceDeadline) { throw }
      Start-Sleep -Milliseconds 250
    }
  }
  $child = Start-Process -FilePath $target -ArgumentList @('--data-dir', ('"' + $dataDir + '"')) -PassThru
  Start-Sleep -Seconds 3
  if ($child.HasExited -and $child.ExitCode -ne 0) { throw 'Updated program failed to start' }
  Remove-Item -LiteralPath $backup -Force
  Remove-Item -LiteralPath $stage -Force
} catch {
  if ($replaced -and (Test-Path -LiteralPath $backup)) {
    Copy-Item -LiteralPath $backup -Destination $target -Force
  }
  if (Test-Path -LiteralPath $target) {
    Start-Process -FilePath $target -ArgumentList @('--data-dir', ('"' + $dataDir + '"'))
  }
  throw
}
'''
