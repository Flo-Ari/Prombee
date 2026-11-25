import sys
from pathlib import Path
import unittest
from unittest.mock import Mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'build_tools'))
from release_retention import retention_plan, apply_plan


class ReleaseRetentionTests(unittest.TestCase):
    def test_keeps_three_newest_published_versions_by_numeric_version(self):
        releases = [{'tagName': tag, 'isDraft': False} for tag in ['v0.9.9', 'v0.9.17', 'v0.9.18', 'v0.9.19']]
        tags = [r['tagName'] for r in releases] + ['v0.9.20', 'experiment']
        plan = retention_plan(releases, tags)
        self.assertEqual(plan, {'keep': ['v0.9.19', 'v0.9.18', 'v0.9.17'], 'delete': ['v0.9.9']})
        run = Mock()
        apply_plan(plan, releases, tags, run)
        self.assertEqual(run.call_count, 2)
        self.assertEqual(run.call_args_list[0].args[0][0:4], ['gh', 'release', 'delete', 'v0.9.9'])
        self.assertIn('repos/Flo-Ari/Prombee/git/refs/tags/v0.9.9', run.call_args.args[0])

    def test_fewer_than_three_releases_and_drafts_are_preserved(self):
        self.assertEqual(retention_plan([{'tagName': 'v0.9.19'}], ['v0.9.1'])['delete'], [])
        releases = [{'tagName': 'v0.9.19'}, {'tagName': 'v0.9.18'}, {'tagName': 'v0.9.17'},
                    {'tagName': 'v0.9.16', 'isDraft': True}]
        self.assertEqual(retention_plan(releases, ['v0.9.16'])['delete'], [])


if __name__ == '__main__':
    unittest.main()
