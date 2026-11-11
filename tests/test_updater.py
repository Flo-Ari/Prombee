import hashlib
import io
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from prombee.updater import Updater, choose_asset, version_key, API, LINUX_RESTART, WINDOWS_RESTART

class Response(io.BytesIO):
    status=200
    def __init__(self,raw):
        super().__init__(raw);self.headers={'Content-Length':str(len(raw))}

class UpdateTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name)
        self.updater=Updater(ROOT,self.path,dev=True)
    def tearDown(self):self.temp.cleanup()
    def release(self,version='0.9.5'):
        return {'tag_name':'v'+version,'draft':False,'prerelease':True,'assets':[
            {'name':n,'state':'uploaded'} for n in [f'prombee-{version}-1.fc44.noarch.rpm',f'Prombee-{version}-SHA256.txt']]}
    def test_platform_selection_and_preview_channel_require_complete_release(self):
        self.assertEqual(version_key('v0.9.10'),(0,9,10));self.assertIsNone(version_key('v0.9.5-beta'))
        self.assertIsNone(choose_asset(['../../arbitrary.exe'],'0.9.5','windows'))
        self.updater.mode='rpm'
        releases=[self.release('0.9.5'),self.release('0.9.6')]
        releases[1]['assets'].pop() # Incomplete upload is not offered.
        self.updater.fetch=lambda url,limit:json.dumps(releases).encode()
        self.updater.check()
        self.assertEqual(self.updater.snapshot()['latest'],'0.9.5')
        self.assertEqual(self.updater.snapshot()['status'],'available')
    def prepare(self,raw=b'verified package'):
        self.updater.candidate={'version':'0.9.5','name':'prombee-0.9.5-1.fc44.noarch.rpm','manifest':'Prombee-0.9.5-SHA256.txt'}
        digest=hashlib.sha256(raw).hexdigest()
        self.updater.fetch=lambda url:(digest+'  '+self.updater.candidate['name']+'\n').encode()
        return raw
    def test_download_checks_digest_before_ready_and_refuses_later_tampering(self):
        raw=self.prepare()
        with patch('urllib.request.urlopen',return_value=Response(raw)):self.updater.download()
        self.assertEqual(self.updater.snapshot()['status'],'ready');self.updater.verify()
        self.updater.package.write_bytes(b'changed')
        with patch('subprocess.run') as execute:
            with self.assertRaises(ValueError):self.updater.install()
            execute.assert_not_called()
    def test_bad_download_never_becomes_installable(self):
        self.prepare()
        with patch('urllib.request.urlopen',return_value=Response(b'wrong bytes')):
            with self.assertRaises(ValueError):self.updater.download()
        self.assertIsNone(self.updater.package)
        self.assertFalse(list(self.updater.cache.glob('*.part')))
    def test_system_authorization_is_native_and_cancellation_is_reported(self):
        raw=self.prepare()
        with patch('urllib.request.urlopen',return_value=Response(raw)):self.updater.download()
        self.updater.mode='rpm'
        with patch('shutil.which',side_effect=lambda name:'/usr/bin/'+name),patch('subprocess.run',return_value=subprocess.CompletedProcess([],126,b'',b'')) as execute:
            with self.assertRaisesRegex(ValueError,'取消'):self.updater.install()
        args=execute.call_args.args[0]
        self.assertEqual(args[:3],['/usr/bin/pkexec','--disable-internal-agent','/usr/bin/dnf'])
        self.assertEqual(args[-1],str(self.updater.package))
    def test_development_preview_never_installs(self):
        with self.assertRaises(ValueError):self.updater.action('download')
        self.assertFalse(self.updater.snapshot()['canInstall'])
    @unittest.skipIf(sys.platform=='win32','POSIX restart helper')
    def test_linux_replacement_handles_spaces_and_keeps_data_path(self):
        folder=self.path/'folder with spaces';folder.mkdir()
        target=folder/'Prombee app';stage=folder/'download';data=folder/'user data';marker=folder/'started'
        target.write_text('#!/bin/sh\nexit 1\n');target.chmod(0o755)
        stage.write_text('#!/bin/sh\nprintf "%s" "$2" > "'+str(marker)+'"\nsleep 4\n')
        helper=folder/'restart.sh';helper.write_text(LINUX_RESTART)
        subprocess.run(['/bin/sh',str(helper),'99999999',str(target),str(stage),str(data)],check=True,timeout=10)
        self.assertEqual(marker.read_text(),str(data));self.assertFalse(stage.exists())
        self.assertFalse(Path(str(target)+'.previous').exists())
    @unittest.skipUnless(sys.platform=='win32','Windows PowerShell parser')
    def test_windows_restart_script_parses(self):
        helper=self.path/'restart.ps1';helper.write_text(WINDOWS_RESTART,encoding='utf-8-sig')
        parser=self.path/'parse.ps1'
        parser.write_text("param([string]$path)\n$tokens=$null; $errors=$null; [void][System.Management.Automation.Language.Parser]::ParseFile($path,[ref]$tokens,[ref]$errors); if($errors.Count){$errors | Out-String | Write-Output; exit 1}")
        subprocess.run(['powershell.exe','-NoProfile','-File',str(parser),str(helper)],check=True)
