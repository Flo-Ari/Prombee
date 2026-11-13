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
        state['documents'][0]['nodes'][1].update(html='@node {literal}<br>| 正文<br>```md<br># 代码<br>```',raw=True,listType='ordered')
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
        (data/'workspace.json').write_text(raw,encoding='utf-8')
        lib=Library(ROOT,data,valid)
        self.assertEqual(lib.load()['revision'],4)
        self.assertEqual((data/'workspace.json').read_text(encoding='utf-8'),raw)
        self.assertTrue((data/'当前词集.txt').exists())

    def test_create_requires_location_and_never_overwrites(self):
        with self.assertRaises(ValueError):self.library.action({'action':'createSet','name':'新词集'})
        reg=self.library.action({'action':'createSet','name':'新词集','folder':str(self.folder)})
        created=self.folder/'新词集.txt';before=created.read_bytes()
        with self.assertRaises(ValueError):self.library.action({'action':'createSet','name':'新词集','folder':str(self.folder)})
        self.assertEqual(created.read_bytes(),before)
        self.assertEqual(self.library.load()['set']['id'],reg['active'])

    def test_groups_change_membership_without_moving_files(self):
        reg=self.library.action({'action':'createGroup','name':'迭代'})
        group=reg['groups'][-1]
        reg=self.library.action({'action':'createSet','name':'词集','folder':str(self.folder)})
        set_id=reg['active'];target=self.folder/'词集.txt';original=target.read_bytes()
        reg=self.library.action({'action':'assignGroup','id':set_id,'groupId':group['id']})
        self.assertEqual(self.library.find(reg,set_id)['groupId'],group['id'])
        self.assertEqual(target.read_bytes(),original)
        self.library.action({'action':'renameSet','id':set_id,'name':'重命名'})
        target=self.folder/'重命名.txt';self.assertEqual(target.read_bytes(),original)
        self.library.action({'action':'deleteGroup','id':group['id']})
        self.assertEqual(self.library.load()['set']['groupId'],'ungrouped')
        self.library.action({'action':'deleteSet','id':set_id})
        self.assertEqual(target.read_bytes(),original)
        self.assertNotIn('trash',self.library.snapshot())

    def test_group_pin_reorder_and_ungrouped_protection(self):
        reg=self.library.action({'action':'createGroup','name':'测试'})
        group=reg['groups'][-1]
        reg=self.library.action({'action':'pinGroup','id':group['id']})
        self.assertTrue(reg['groups'][-1]['pinned'])
        reg=self.library.action({'action':'reorderGroups','ids':[group['id'],'ungrouped']})
        self.assertEqual(reg['groups'][0]['id'],group['id'])
        for action in ('deleteGroup','renameGroup'):
            with self.assertRaises(ValueError):self.library.action({'action':action,'id':'ungrouped','name':'修改'})
        with self.assertRaises(ValueError):self.library.action({'action':'reorderGroups','ids':['ungrouped']})

    def test_v1_registry_migration_keeps_paths_and_archive_bytes(self):
        reg=self.library.snapshot();entry=reg['sets'][0];original=Path(entry['path']).read_bytes()
        entry.pop('groupId');entry['projectId']='old'
        archive=self.data/'Trash';archive.mkdir();archived=archive/'removed.txt';archived.write_text('保留已删除内容',encoding='utf-8')
        old={'version':1,'active':entry['id'],'sets':[entry],'projects':[{'id':'old','name':'原项目','path':str(self.folder)}],'trash':[{'trashPath':str(archived)}]}
        self.library.write_registry(old)
        migrated=Library(ROOT,self.data,valid).snapshot()
        self.assertEqual(migrated['sets'][0]['path'],entry['path'])
        self.assertEqual(migrated['sets'][0]['groupId'],'old')
        self.assertEqual(Path(entry['path']).read_bytes(),original)
        self.assertEqual(archived.read_text(encoding='utf-8'),'保留已删除内容')
        self.assertEqual(json.loads((self.data/'library-v1-backup.json').read_text(encoding='utf-8')),old)
        self.assertNotIn('projects',migrated);self.assertNotIn('trash',migrated)

    def test_file_fingerprint_conflict_and_explicit_set_save(self):
        before=self.library.load()
        self.library.action({'action':'createSet','name':'另一个','folder':str(self.folder)})
        state=copy.deepcopy(before['state']);state['size']=20
        self.library.save({'setId':before['set']['id'],'state':state,'baseRevision':before['revision'],'baseFingerprint':before['fingerprint']})
        self.assertEqual(self.library.load(before['set']['id'])['state']['size'],20)
        self.assertEqual(self.library.load()['state']['size'],14)
        package=self.library.load()
        path=Path(package['set']['path']);path.write_text(path.read_text(encoding='utf-8').replace('| 整体','| 外部修改'),encoding='utf-8')
        with self.assertRaises(ConflictError):self.library.save({'setId':package['set']['id'],'state':package['state'],'baseRevision':package['revision'],'baseFingerprint':package['fingerprint']})
        self.assertIn('外部修改',path.read_text(encoding='utf-8'))

    def test_open_plain_txt_without_altering_source(self):
        text='# 已有标题\n1. 保留正文\n'
        path=self.folder/'已有.txt';path.write_text(text,encoding='utf-8')
        self.library.action({'action':'openSet','path':str(path)})
        self.assertIn('已有标题',self.library.load()['state']['documents'][0]['nodes'][0]['html'])
        self.assertEqual(path.read_text(encoding='utf-8'),text)
        self.assertTrue(Path(self.library.load()['set']['path']).samefile(path))

    def test_invalid_txt_is_never_silently_overwritten(self):
        path=self.folder/'损坏.txt';text='Prombee TXT 1\n@node {broken}\n';path.write_text(text,encoding='utf-8')
        with self.assertRaises(ValueError):self.library.action({'action':'openSet','path':str(path)})
        self.assertEqual(path.read_text(encoding='utf-8'),text)


    def test_rename_index_failure_restores_old_file_and_registration(self):
        from unittest.mock import patch
        package=self.library.load(); entry=package['set']; old=Path(entry['path']); raw=old.read_bytes()
        with patch.object(self.library, 'write_registry', side_effect=OSError('disk full')):
            with self.assertRaises(OSError): self.library.action({'action':'renameSet','id':entry['id'],'name':'新名称'})
        self.assertEqual(old.read_bytes(),raw)
        self.assertFalse(old.with_name('新名称.txt').exists())
        self.assertEqual(self.library.load()['set']['id'],entry['id'])

    def test_interrupted_rename_recovers_and_keeps_identity_group_and_saving(self):
        reg=self.library.action({'action':'createGroup','name':'迭代组'})
        group=reg['groups'][-1]['id']
        reg=self.library.action({'action':'createSet','folder':str(self.folder),'name':'旧名称','groupId':group})
        entry=self.library.find(reg);old=Path(entry['path']);target=old.with_name('新名称.txt');raw=old.read_bytes()
        (self.data/'.rename-pending.json').write_text(json.dumps({'id':entry['id'],'old':str(old),'target':str(target)}))
        old.rename(target)
        restored=Library(ROOT,self.data,valid).load()
        self.assertEqual(restored['set']['id'],entry['id']);self.assertEqual(restored['set']['groupId'],group)
        self.assertEqual(restored['set']['path'],str(target));self.assertEqual(target.read_bytes(),raw)
        state=copy.deepcopy(restored['state']);state['documents'][0]['nodes'][1]['html']='重命名后继续保存'
        self.library.save({'state':state,'setId':entry['id'],'baseRevision':restored['revision'],'baseFingerprint':restored['fingerprint']})
        self.assertEqual(Library(ROOT,self.data,valid).load()['state'],state)


    def test_save_as_keeps_original_and_reopens_a_standalone_copy_without_overwrite(self):
        old=self.library.load();original=Path(old['set']['path']);before=original.read_bytes()
        target=self.data/'独立副本.txt'
        registry=self.library.action({'action':'saveAsSet','id':old['set']['id'],'path':str(target)})
        copied=next(s for s in registry['sets'] if s['path']==str(target))
        self.assertEqual(self.library.load(copied['id'])['state'],old['state'])
        self.assertEqual(original.read_bytes(),before)
        self.assertEqual(registry['active'],old['set']['id'])
        with self.assertRaises(FileExistsError):self.library.action({'action':'saveAsSet','id':old['set']['id'],'path':str(target)})

if __name__=='__main__':unittest.main()
