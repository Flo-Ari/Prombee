import os
from pathlib import Path
import sys,tempfile,unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'src'))
from prombee.skills import SkillCatalog
class SkillTests(unittest.TestCase):
    def test_agent_catalogs_are_local_separate_and_project_skills_override_personal(self):
        with tempfile.TemporaryDirectory() as folder,patch.dict(os.environ,{'CODEX_HOME':str(Path(folder)/'.codex')}):
            home=Path(folder);project=home/'project';(project/'.git').mkdir(parents=True)
            def skill(root,name,description):
                file=root/name/'SKILL.md';file.parent.mkdir(parents=True,exist_ok=True);file.write_text(f'---\nname: {name}\ndescription: {description}\n---\nDO NOT EXECUTE THIS BODY',encoding='utf-8')
            skill(home/'.codex/skills','mapping','personal');skill(project/'.codex/skills','mapping','project');skill(home/'.claude/skills','claude-only','Claude')
            catalog=SkillCatalog(home);value=catalog.list('codex',project=project)
            self.assertEqual(value['skills'],[{'name':'mapping','description':'project','reference':'$mapping'}]);self.assertEqual(catalog.list('claude-code')['skills'][0]['name'],'claude-only')
            self.assertEqual(catalog.list('muse')['skills'],[]);self.assertEqual(catalog.list('muse',str(home/'.claude/skills'))['skills'][0]['name'],'claude-only')
            with self.assertRaises(ValueError):catalog.list('../../anything')
