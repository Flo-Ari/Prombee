import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from prombee.other import OtherSettings, DeviceTargets, clean_environment

class Targets:
    def __init__(self):self.activations=[]
    def catalog(self):return {'windows':[{'kind':'window','id':'win:1','pid':42,'identity':'browser','name':'Existing page'}], 'applications':[{'kind':'application','id':'app:known','name':'Known application','identity':'known'}]}
    def activate(self,target):self.activations.append(target)

class OtherTests(unittest.TestCase):
    def setUp(self):self.temp=tempfile.TemporaryDirectory();self.path=Path(self.temp.name);self.targets=Targets();self.store=OtherSettings(self.path,self.targets)
    def tearDown(self):self.temp.cleanup()
    def test_disabled_does_not_activate_and_setting_survives_restart_without_changing_prompts(self):
        prompt=self.path/'prompt.txt';prompt.write_text('提示词')
        self.assertEqual(self.store.jump(),{'jumped':False})
        self.store.save({'enabled':True,'target':{'kind':'window','id':'win:1','name':'forged'}})
        self.assertEqual(self.store.load()['target']['name'],'Existing page')
        self.assertEqual(OtherSettings(self.path,self.targets).jump(),{'jumped':True})
        self.assertEqual(self.targets.activations[0]['id'],'win:1');self.assertEqual(prompt.read_text(),'提示词')
        self.store.save({'enabled':False,'target':self.store.load()['target']});self.store.jump();self.assertEqual(len(self.targets.activations),1)
    def test_only_registered_apps_or_http_pages_can_be_saved(self):
        for target in [{'kind':'application','id':'/tmp/command'},{'kind':'url','url':'file:///tmp/command'},{'kind':'url','url':'javascript:alert(1)'}]:
            with self.assertRaises(ValueError):self.store.save({'enabled':True,'target':target})
        self.store.save({'enabled':True,'target':{'kind':'url','url':'https://example.com/a'}})
        self.assertEqual(self.store.load()['target']['url'],'https://example.com/a')
    def test_missing_target_and_activation_failure_do_not_discard_preferences(self):
        with self.assertRaises(ValueError):self.store.save({'enabled':True,'target':None})
        self.store.save({'enabled':True,'target':{'kind':'application','id':'app:known'}})
        original=self.store.path.read_bytes()
        with patch.object(self.targets,'activate',side_effect=OSError('closed')):
            with self.assertRaisesRegex(ValueError,'跳转失败'):self.store.jump()
        self.assertEqual(self.store.path.read_bytes(),original)
    def test_x11_parser_uses_metadata_and_skips_own_process(self):
        targets=DeviceTargets()
        raw='_NET_WM_NAME(UTF8_STRING) = "Browser — Page"\nWM_NAME(STRING) = "Fallback"\nWM_CLASS(STRING) = "browser", "Browser"\n_NET_WM_PID(CARDINAL) = 12345\n_NET_WM_WINDOW_TYPE(ATOM) = _NET_WM_WINDOW_TYPE_NORMAL\n'
        with patch.object(targets,'run_xprop',return_value=raw),patch('os.getpid',return_value=1):
            window=targets.linux_window('0x123')
        self.assertEqual(window['name'],'Browser — Page');self.assertEqual(window['pid'],12345)
        with patch.object(targets,'run_xprop',return_value=raw),patch('os.getpid',return_value=12345):self.assertIsNone(targets.linux_window('0x123'))

    @unittest.skipUnless(sys.platform=='win32','Native Windows window catalog')
    def test_windows_native_catalog_uses_real_handles(self):
        targets=DeviceTargets()
        for window in targets.windows_native():
            self.assertTrue(window['id'].startswith('win:'))
            self.assertTrue(window['name'])
        for app in targets.applications():self.assertTrue(app['id'].startswith('app:'))

    def test_external_app_environment_does_not_inherit_frozen_libraries(self):
        with patch.dict(os.environ,{'LD_LIBRARY_PATH':'/bundle','LD_LIBRARY_PATH_ORIG':'/system/lib','WEBKIT_EXEC_PATH':'/bundle/webkit'}):
            cleaned=clean_environment()
            self.assertEqual(cleaned['LD_LIBRARY_PATH'],'/system/lib')
            self.assertNotIn('WEBKIT_EXEC_PATH',cleaned)
            self.assertEqual(os.environ['LD_LIBRARY_PATH'],'/bundle')
