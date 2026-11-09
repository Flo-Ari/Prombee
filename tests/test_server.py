import concurrent.futures
import json
from pathlib import Path
import sys
import tempfile
import unittest
from urllib.error import HTTPError
from urllib.request import Request,urlopen

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'src'))
from prombee.server import start_server,valid


class WorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.server=start_server(ROOT,self.temp.name)
        self.url=f'http://127.0.0.1:{self.server.server_port}'

    def tearDown(self):
        self.server.shutdown();self.server.server_close();self.temp.cleanup()

    def read(self):
        with urlopen(self.url+'/api/state') as r:return json.load(r)

    def put(self,payload,origin=None,url=None):
        request=Request((url or self.url)+'/api/state',data=json.dumps(payload).encode(),method='PUT',headers={'Content-Type':'application/json',**({'Origin':origin} if origin else {})})
        try:
            with urlopen(request) as r:return r.status,json.load(r)
        except HTTPError as e:
            code=e.code;e.close();return code,{}

    def test_migration_round_trip_and_revisions(self):
        before=self.read();self.assertGreater(len(before['state']['documents']),0)
        state=before['state'];state['size']=96
        state['documents'][0]['nodes'][0]['html']='汉字与 emoji 🐝'
        self.assertEqual(self.put(dict(state=state,baseRevision=0))[0],200)
        self.assertEqual(self.read()['state'],state)
        self.assertEqual(self.put(dict(state=state,baseRevision=0))[0],409)

    def test_two_servers_share_one_store_without_lost_updates(self):
        other=start_server(ROOT,self.temp.name)
        try:
            data=dict(state=self.read()['state'],baseRevision=0)
            with concurrent.futures.ThreadPoolExecutor() as pool:
                a=pool.submit(self.put,data)
                b=pool.submit(self.put,data,url=f'http://127.0.0.1:{other.server_port}')
                self.assertEqual(sorted([a.result()[0],b.result()[0]]),[200,409])
        finally:other.shutdown();other.server_close()

    def test_reject_cross_origin_and_malformed_state(self):
        state=self.read()['state']
        self.assertEqual(self.put(dict(state=state,baseRevision=0),origin='https://unrelated.example')[0],403)
        state['size']=999
        self.assertFalse(valid(state))
        self.assertEqual(self.put(dict(state=state,baseRevision=0))[0],400)

    def test_empty_round_is_persisted_and_exclusion_is_typed(self):
        state=self.read()['state']
        original=state['documents'][0]['nodes']
        original[0]['excluded']='yes'
        self.assertFalse(valid(state))
        original[0]['excluded']=True
        self.assertTrue(valid(state))
        state['documents'][0]['nodes']=[]
        self.assertEqual(self.put(dict(state=state,baseRevision=0))[0],200)
        self.assertEqual(self.read()['state']['documents'][0]['nodes'],[])

    def test_template_round_trip_and_validation(self):
        state=self.read()['state']
        state['template']={'id':'template','name':'模板','nodes':[{'id':'t1','kind':'heading','level':2,'html':'新层级'}]}
        self.assertEqual(self.put(dict(state=state,baseRevision=0))[0],200)
        self.assertEqual(self.read()['state']['template'],state['template'])
        state['template']['nodes'][0]['level']=7
        self.assertFalse(valid(state))
        state['template']='invalid'
        self.assertFalse(valid(state))

    def test_common_prompts_round_trip_and_validation(self):
        state=self.read()['state']
        state['common']={'id':'common','name':'常用提示词','nodes':[{'id':'c1','kind':'heading','level':1,'html':'常用'}]}
        self.assertEqual(self.put(dict(state=state,baseRevision=0))[0],200)
        self.assertEqual(self.read()['state']['common'],state['common'])
        state['common']['nodes'][0]['html']=None
        self.assertFalse(valid(state))
        state['common']=[]
        self.assertFalse(valid(state))

    def test_last_round_can_be_deleted_and_empty_set_reopened(self):
        state=self.read()['state']
        state['documents']=[];state['current']=None
        self.assertTrue(valid(state))
        self.assertEqual(self.put(dict(state=state,baseRevision=0))[0],200)
        self.assertEqual(self.read()['state'],state)

    def test_private_files_not_served(self):
        for path in ['/seed.json','/data/workspace.json','/../desktop.py','/%2e%2e/seed.json']:
            with self.assertRaises(HTTPError) as failure:urlopen(self.url+path)
            self.assertEqual(failure.exception.code,404)
            failure.exception.close()

    def test_script_mime_types_ignore_windows_registry(self):
        import mimetypes
        from unittest.mock import patch
        with patch.object(mimetypes, 'guess_type', return_value=('text/plain',None)):
            for path in ['/app.js','/review.js','/vendor/marked.esm.js','/vendor/purify.es.mjs']:
                with urlopen(self.url+path) as response:
                    self.assertEqual(response.headers.get_content_type(),'text/javascript')


if __name__=='__main__':unittest.main()
