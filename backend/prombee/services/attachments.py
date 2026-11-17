"""Copied local attachments. Only registered asset IDs can be served or copied."""
import json,mimetypes,shutil,uuid,tempfile,threading,os
from pathlib import Path
from ..adapters.storage import atomic_write
from ..adapters.filelock import exclusive_file_lock
MAX_SIZE=512*1024*1024
class Attachments:
    def __init__(self,data):
        self.root=Path(data)/'attachments';self.root.mkdir(exist_ok=True)
        self.index=self.root/'index.json'
        self.temporary=tempfile.TemporaryDirectory(prefix='prombee-attachments-')
        self.temporary_root=Path(self.temporary.name)
        self.temporary_entries={}
        self.session={}
        self.guard=threading.RLock()
    def entries(self):
        try:persistent=json.loads(self.index.read_text(encoding='utf-8'))
        except FileNotFoundError:persistent={}
        with self.guard:return {**persistent,**self.temporary_entries}
    def add(self,name,stream,size,temporary=False,scope=()):
        if not isinstance(size,int) or not 0<=size<=MAX_SIZE:raise ValueError('附件不可超过 512 MB')
        name=Path(str(name).replace('\\','/')).name.replace('\0','').strip() or '附件'
        original_name=name
        identifier=uuid.uuid4().hex;folder=(self.temporary_root if temporary else self.root)/identifier;folder.mkdir()
        path=folder/'payload.part'
        try:
            with path.open('xb') as out:
                remaining=size
                while remaining:
                    chunk=stream.read(min(1024*1024,remaining))
                    if not chunk:raise ValueError('附件传输未完成')
                    out.write(chunk);remaining-=len(chunk)
            with self.guard,exclusive_file_lock(self.root/'.lock'):
                entries=self.entries();used={Path(entries[i]['name']).stem.casefold() for i in scope if i in entries}
                original=Path(name);stem,suffix=original.stem,original.suffix;number=1
                while Path(name).stem.casefold() in used:
                    name=f'{stem}({number}){suffix}';number+=1
                target=folder/name;path.replace(target)
                entry={'id':identifier,'name':name,'originalName':original_name,'path':str(target.resolve()),'size':size,'type':mimetypes.guess_type(name)[0] or 'application/octet-stream'}
                if temporary:
                    entry['temporary']=True;self.temporary_entries[identifier]=entry
                else:
                    entries={key:value for key,value in entries.items() if not value.get('temporary')}
                    entries[identifier]=entry;atomic_write(self.index,json.dumps(entries,ensure_ascii=False))
            return entry
        except Exception:shutil.rmtree(folder,ignore_errors=True);raise
    def import_file(self,path,scope=()):
        path=Path(path)
        if not path.is_file():raise ValueError('请选择文件')
        resolved=path.resolve()
        for entry in self.entries().values():
            if Path(entry['path']).resolve()==resolved:
                if entry['id'] in scope:return self.get(entry['id'])
                original=entry.get('originalName',entry['name'])
                used={Path(e['name']).stem.casefold() for i,e in self.entries().items() if i in scope}
                if entry['name']==original and Path(original).stem.casefold() not in used:return self.get(entry['id'])
                with path.open('rb') as source:return self.add(original,source,path.stat().st_size,temporary=entry.get('temporary',False),scope=scope)
        with path.open('rb') as source:return self.add(path.name,source,path.stat().st_size,scope=scope)
    def get(self,identifier):
        entry=self.entries().get(identifier)
        if not entry:raise ValueError('附件不存在')
        path=Path(entry['path']).resolve()
        if not (path.is_relative_to(self.root.resolve()) or (entry.get('temporary') and path.is_relative_to(self.temporary_root.resolve()))) or not path.is_file():raise ValueError('附件文件不存在')
        return entry
    def paths(self,identifiers):return [self.get(i)['path'] for i in dict.fromkeys(identifiers)]

    def references(self,text,scope=None):
        import re
        from urllib.parse import unquote,urlsplit
        import os
        if not isinstance(text,str):raise ValueError('附件引用无效')
        by_path={str(Path(a['path']).resolve()).casefold() if os.name=='nt' else str(Path(a['path']).resolve()):a for a in self.entries().values()}
        found={}
        for match in re.finditer(r'file://[^\s<>"\[\])]+',text):
            uri=urlsplit(match.group());path=unquote(uri.path)
            if uri.netloc not in ('','localhost'):continue
            if os.name=='nt' and re.match(r'^/[a-zA-Z]:',path):path=path[1:]
            key=str(Path(path).resolve());entry=by_path.get(key.casefold() if os.name=='nt' else key)
            if entry and Path(entry['path']).is_file():found[entry['id']]=entry
            if len(found)>=100:break
        for identifier,entry in self.entries().items():
            if scope is not None and identifier not in scope:continue
            label=Path(entry['name']).stem
            if re.search(r'(?<![\w])'+re.escape(label)+r'(?![\w])',text) and Path(entry['path']).is_file():found[entry['id']]=entry
            if len(found)>=100:break
        return list(found.values())

    def remember_session(self,state,set_id):
        collections=[*state['documents'],*[state[k] for k in ('template','common') if k in state]]
        with self.guard:
            self.session[set_id]={c['id']:[a for a in c.get('attachments',[]) if a.get('temporary') and a['id'] in self.temporary_entries] for c in collections}

    def restore_session(self,package):
        with self.guard:
            temporary=self.session.get((package.get('set') or {}).get('id'),{})
            state=package['state']
            for c in [*state['documents'],*[state[k] for k in ('template','common') if k in state]]:
                if 'attachments' in c or temporary.get(c['id']):c['attachments']=[a for a in c.get('attachments',[]) if not a.get('temporary')]+temporary.get(c['id'],[])
        return package

    def save_as(self,identifier,destination):
        source=Path(self.get(identifier)['path']);target=Path(destination).expanduser()
        if source.resolve()==target.resolve():return str(target)
        # The native Save dialog handles overwrite confirmation.
        temporary=None
        try:
            with source.open('rb') as data,tempfile.NamedTemporaryFile(dir=target.parent,delete=False) as output:
                temporary=Path(output.name);shutil.copyfileobj(data,output);output.flush();os.fsync(output.fileno())
            temporary.replace(target)
        finally:
            if temporary:temporary.unlink(missing_ok=True)
        return str(target.resolve())

    def close(self):
        self.temporary.cleanup()

    def import_paths(self,paths,scope=()):
        result=[];current=list(scope)
        for path in paths:
            entry=self.import_file(path,current);result.append(entry);current.append(entry['id'])
        return result

    @staticmethod
    def validate_scope(scope):
        if not isinstance(scope,list) or len(scope)>2000 or any(not isinstance(i,str) for i in scope):raise ValueError('附件范围无效')
        return scope
