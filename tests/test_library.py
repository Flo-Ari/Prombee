import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from prombee.library import Library, encode_workspace, decode_workspace, ConflictError
from prombee.server import valid


class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.data=Path(self.temp.name)/'app';self.folder=Path(self.temp.name)/'chosen';self.folder.mkdir()
        self.library=Library(ROOT,self.data,valid)
    def tearDown(self):self.temp.cleanup()

    def test_txt_is_self_contained_and_preserves_all_state(self):
        state=copy.deepcopy(self.library.seed)
        state['documents'][0]['nodes'][0].update(html='<b>中文 🐝</b><br>第二行',collapsed=True,excluded=True)
        state['documents'][0]['nodes'][1].update(html='@node {literal}<br>| 正文<br>```md<br># 代码<br>```',raw=True)
        state['template']={'id':'t','name':'模板','nodes':[]}
        state['common']={'id':'c','name':'常用','nodes':[]}
        text=encode_workspace(state,8)
        self.assertIn('中文 🐝',text);self.assertEqual(decode_workspace(text,self.library.seed),{'revision':8,'state':state})
        # An external edit wins over stored display HTML rather than getting discarded.
        edited=text.replace('| 中文 🐝','| 外部编辑 🐝')
        self.assertIn('外部编辑',decode_workspace(edited,self.library.seed)['state']['documents'][0]['nodes'][0]['html'])

    def test_legacy_migration_preserves_json_backup(self):
        data=Path(self.temp.name)/'legacy';data.mkdir()
        package={'revision':4,'state':self.library.seed};raw=json.dumps(package,ensure_ascii=False)
        (data/'workspace.json').write_text(raw)
        lib=Library(ROOT,data,valid)
        self.assertEqual(lib.load()['revision'],4)
        self.assertEqual((data/'workspace.json').read_text(),raw)
        self.assertTrue((data/'当前词集.txt').exists())

    def test_create_requires_location_and_never_overwrites(self):
        with self.assertRaises(ValueError):self.library.action({'action':'createSet','name':'新词集'})
        reg=self.library.action({'action':'createSet','name':'新词集','folder':str(self.folder)})
        created=self.folder/'新词集.txt';before=created.read_bytes()
        with self.assertRaises(ValueError):self.library.action({'action':'createSet','name':'新词集','folder':str(self.folder)})
        self.assertEqual(created.read_bytes(),before)
        self.assertEqual(self.library.load()['set']['id'],reg['active'])

    def test_projects_move_rename_delete_and_restore_keep_content(self):
        self.library.action({'action':'createProject','name':'项目','folder':str(self.folder)})
        project=self.library.snapshot()['projects'][0]
        reg=self.library.action({'action':'createSet','name':'词集','folder':str(self.folder)})
        set_id=reg['active'];original=(self.folder/'词集.txt').read_bytes()
        self.library.action({'action':'moveSet','id':set_id,'projectId':project['id']})
        self.library.action({'action':'renameSet','id':set_id,'name':'重命名'})
        target=self.folder/'项目'/'重命名.txt';self.assertEqual(target.read_bytes(),original)
        self.library.action({'action':'deleteSet','id':set_id});self.assertFalse(target.exists())
        self.library.action({'action':'restoreSet','id':set_id});self.assertEqual(target.read_bytes(),original)

    def test_file_fingerprint_conflict_and_explicit_set_save(self):
        before=self.library.load()
        self.library.action({'action':'createSet','name':'另一个','folder':str(self.folder)})
        state=copy.deepcopy(before['state']);state['size']=20
        self.library.save({'setId':before['set']['id'],'state':state,'baseRevision':before['revision'],'baseFingerprint':before['fingerprint']})
        self.assertEqual(self.library.load(before['set']['id'])['state']['size'],20)
        self.assertEqual(self.library.load()['state']['size'],14)
        package=self.library.load()
        path=Path(package['set']['path']);path.write_text(path.read_text().replace('| 整体','| 外部修改'))
        with self.assertRaises(ConflictError):self.library.save({'setId':package['set']['id'],'state':package['state'],'baseRevision':package['revision'],'baseFingerprint':package['fingerprint']})
        self.assertIn('外部修改',path.read_text())

    def test_open_plain_txt_and_existing_project_without_altering_source(self):
        text='# 已有标题\n1. 保留正文\n'
        path=self.folder/'已有.txt';path.write_text(text,encoding='utf-8')
        self.library.action({'action':'openProject','folder':str(self.folder)})
        self.library.action({'action':'openSet','path':str(path)})
        self.assertIn('已有标题',self.library.load()['state']['documents'][0]['nodes'][0]['html'])
        self.assertEqual(path.read_text(),text)
        self.assertTrue(any(e['name']=='已有.txt' for e in self.library.browse(str(self.folder))['entries']))

    def test_invalid_txt_is_never_silently_overwritten(self):
        path=self.folder/'损坏.txt';text='Prombee TXT 1\n@node {broken}\n';path.write_text(text)
        with self.assertRaises(ValueError):self.library.action({'action':'openSet','path':str(path)})
        self.assertEqual(path.read_text(),text)

if __name__=='__main__':unittest.main()
