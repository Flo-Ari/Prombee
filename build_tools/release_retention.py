"""Keep the newest three published Prombee versions and their Git tags."""
import argparse
import json
import re
import subprocess

REPOSITORY = 'Flo-Ari/Prombee'


def retention_plan(releases, tags, keep=3):
    if keep < 1:
        raise ValueError('At least one release must be retained')
    published = {r['tagName'] for r in releases if not r.get('isDraft')}
    drafts = {r['tagName'] for r in releases if r.get('isDraft')}
    versions = {}
    for tag in published | set(tags):
        match = re.fullmatch(r'v(\d+)\.(\d+)\.(\d+)', tag)
        if match and tag not in drafts:
            versions[tag] = tuple(map(int, match.groups()))
    # Unreleased tags never displace a published release from the retained set.
    retained = sorted(published & versions.keys(), key=versions.get, reverse=True)[:keep]
    if len(retained) < keep:
        return {'keep': retained, 'delete': []}
    oldest = min(versions[tag] for tag in retained)
    obsolete = sorted((tag for tag in versions if versions[tag] < oldest), key=versions.get)
    return {'keep': retained, 'delete': obsolete}


def apply_plan(plan, releases, tags, run=subprocess.run):
    published = {r['tagName'] for r in releases if not r.get('isDraft')}
    for tag in plan['delete']:
        if tag in published:
            run(['gh', 'release', 'delete', tag, '--repo', REPOSITORY, '--yes'], check=True)
        if tag in tags:
            run(['gh', 'api', '--method', 'DELETE', f'repos/{REPOSITORY}/git/refs/tags/{tag}'], check=True)


def prune_releases(apply=False, backup=None):
    releases = json.loads(subprocess.check_output([
        'gh', 'release', 'list', '--repo', REPOSITORY, '--limit', '1000',
        '--json', 'tagName,isDraft,publishedAt,name'], text=True))
    refs = subprocess.check_output([
        'gh', 'api', '--paginate', f'repos/{REPOSITORY}/git/refs/tags', '--jq', '.[].ref'], text=True)
    tags = {ref.removeprefix('refs/tags/') for ref in refs.splitlines()}
    plan = retention_plan(releases, tags)
    if backup:
        backup.parent.mkdir(parents=True, exist_ok=True)
        backup.write_text(json.dumps({'releases': releases, 'tags': sorted(tags), 'plan': plan}, ensure_ascii=False, indent=2))
    print(json.dumps(plan, ensure_ascii=False))
    if apply:
        apply_plan(plan, releases, tags)
    return plan


if __name__ == '__main__':
    from pathlib import Path
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--apply', action='store_true', help='Delete older releases and tags; default is preview only')
    parser.add_argument('--backup', type=Path)
    args = parser.parse_args()
    prune_releases(apply=args.apply, backup=args.backup)
