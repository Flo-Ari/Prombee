"""Local, read-only SKILL.md metadata catalog. Skill bodies are never executed."""
import os
from pathlib import Path
import re
import threading
import time

AGENTS={'codex':'Codex','claude-code':'Claude Code','hermes':'Hermes','deepseek-harness':'DeepSeek Harness',
        'grok-bot':'Grok Bot','muse':'Muse','gemini-cli':'Gemini CLI','opencode':'OpenCode'}
# Personal/project locations documented by the respective tools; unknown harnesses
# use the explicit folder selected by the user rather than fabricated catalogs.
DIRECTORIES={'codex':('.agents/skills','.codex/skills'),'claude-code':('.claude/skills',),
             'hermes':('.hermes/skills',),'gemini-cli':('.gemini/skills',),'opencode':('.opencode/skills',)}
SKIP={'.git','node_modules','.venv','venv','__pycache__','assets','references','scripts','resources'}

def metadata(path):
    try:
        with path.open(encoding='utf-8-sig') as file:text=file.read(16384)
    except (OSError,UnicodeError):return None
    if not text.startswith('---\n'):return None
    header=text.split('\n---',1)[0]
    def field(name):
        match=re.search(r'^'+name+r':\s*([^\n]*)',header,re.M)
        if not match:return ''
        value=match.group(1).strip().strip('\"\'')
        if value in ('|','>','|-','>-'):
            lines=[]
            for line in header[match.end():].splitlines():
                if not line.strip():continue
                if not line.startswith((' ','\t')):break
                lines.append(line.strip())
            value=' '.join(lines)
        return value
    name=field('name') or path.parent.name
    if len(name)>160 or not re.fullmatch(r'[\w.:-]+',name):return None
    return {'name':name,'description':field('description')[:800]}


class SkillCatalog:
    def __init__(self,home=None):
        self.home=Path(home) if home else Path.home();self.cache={};self.lock=threading.Lock()
    def roots(self,agent,folder='',project=None):
        if agent not in AGENTS:raise ValueError('目标智能体无效')
        roots=[Path(folder)] if folder else []
        if project:
            here=Path(project).resolve()
            for parent in [here,*here.parents]:
                if parent==self.home.parent or parent==parent.parent:break
                roots += [parent/d for d in DIRECTORIES.get(agent,())]
                if (parent/'.git').exists() or parent==self.home:break
        roots += [self.home/d for d in DIRECTORIES.get(agent,())]
        if agent=='codex':
            codex=Path(os.environ.get('CODEX_HOME',str(self.home/'.codex')))
            roots += [codex/'skills',codex/'plugins/cache']
        if agent=='opencode':roots += [self.home/'.config/opencode/skills']
        return list(dict.fromkeys(p.resolve() for p in roots if p.is_dir()))
    def list(self,agent,folder='',project=None):
        roots=self.roots(agent,folder,project);key=(agent,tuple(map(str,roots)))
        with self.lock:
            old=self.cache.get(key)
            if old and time.monotonic()-old[0]<5:return old[1]
        result={};visited=set();directories=0
        for root in roots:
            plugin=root.name=='cache' and root.parent.name=='plugins'
            for base,dirs,files in os.walk(root,followlinks=True):
                real=Path(base).resolve()
                if real in visited:dirs[:]=[];continue
                visited.add(real);directories+=1
                if directories>12000:break
                dirs[:]=sorted((d for d in dirs if d not in SKIP and len(Path(base).relative_to(root).parts)<10),reverse=True)
                if 'SKILL.md' not in files:continue
                path=Path(base)/'SKILL.md';skill=metadata(path)
                if not skill:continue
                if plugin:
                    parts=path.relative_to(root).parts
                    if len(parts)>2:skill['name']=parts[1]+':'+skill['name']
                skill['reference']='$'+skill['name']
                result.setdefault(skill['name'],skill)
                if len(result)>=1000:break
            if len(result)>=1000 or directories>12000:break
        value={'agent':agent,'skills':sorted(result.values(),key=lambda v:v['name'].casefold())}
        with self.lock:
            if len(self.cache)>32:self.cache.clear()
            self.cache[key]=(time.monotonic(),value)
        return value
