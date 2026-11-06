import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://127.0.0.1/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const { visibility, scopeEnd, nextRoundName, toMarkdown, cleanHTML } = await import('../web/core.js');
const { renderMarkdown, lineDiff } = await import('../web/review.js');
const heading = (id, level, html, excluded = false) => ({ id, kind: 'heading', level, html, excluded });
const item = (id, html, excluded = false) => ({ id, kind: 'item', level: 1, html, excluded });

test('excluded heading suppresses descendants until an equal-level heading', () => {
  const nodes = [heading('a', 1, 'Visible'), item('a1', 'Keep'), heading('b', 2, 'Secret', true),
    item('b1', 'Hidden'), heading('c', 3, 'Nested'), item('c1', 'Also hidden'),
    heading('d', 2, 'Resumed'), item('d1', 'Back'), heading('e', 1, 'Next')];
  const flags = visibility(nodes);
  assert.deepEqual(flags.get('b'), { excluded: true, inherited: false });
  for (const id of ['b1', 'c', 'c1']) assert.equal(flags.get(id).inherited, true, id);
  for (const id of ['a', 'a1', 'd', 'd1', 'e']) assert.equal(flags.get(id).excluded, false, id);
  assert.equal(toMarkdown(nodes), '# Visible\n1. Keep\n\n## Resumed\n1. Back\n\n# Next\n');
});

test('excluding one item leaves its neighbors visible and copy numbering contiguous', () => {
  const nodes = [item('one', 'First'), item('hidden', 'Omit me', true), item('two', 'Second')];
  assert.equal(toMarkdown(nodes), '1. First\n2. Second\n');
});

test('heading delete scope includes all descendants and stops before a peer or ancestor', () => {
  const nodes = [heading('a', 1, 'Root'), item('a1', 'Root item'), heading('b', 2, 'Child'),
    item('b1', 'Child item'), heading('c', 3, 'Grandchild'), item('c1', 'Deep item'),
    heading('d', 2, 'Peer'), heading('e', 1, 'Next root')];
  assert.equal(scopeEnd(nodes, 0), 7);
  assert.equal(scopeEnd(nodes, 2), 6);
  assert.equal(scopeEnd(nodes, 4), 6);
  assert.equal(scopeEnd(nodes, 3), 4);
  assert.equal(scopeEnd(nodes, 7), 8);
  const remaining = [...nodes];
  remaining.splice(2, scopeEnd(nodes, 2) - 2);
  assert.deepEqual(remaining.map(n => n.id), ['a', 'a1', 'd', 'e']);
});

test('automatic round names advance beyond existing numbered rounds', () => {
  assert.equal(nextRoundName([]), '第1轮');
  assert.equal(nextRoundName([{ name: '第1轮' }, { name: '第3轮' }, { name: '原有提示词' }]), '第4轮');
  assert.equal(nextRoundName([{ name: '第 12 轮' }, { name: '第2轮' }]), '第13轮');
});

test('copied Markdown keeps emphasis but contains no font, color or HTML formatting', () => {
  const nodes = [heading('title', 1, '<span style="font-size:72pt;color:red;font-family:serif">标题 🐝</span>'),
    item('body', '<b>粗体</b> <i>斜体</i> <span style="color:blue;font-size:96pt">普通</span><br>下一行')];
  const markdown = toMarkdown(nodes);
  assert.equal(markdown, '# 标题 🐝\n1. **粗体** *斜体* 普通\n   下一行\n');
  assert.doesNotMatch(markdown, /<\/?(?:span|font|b|i)\b|font-size|font-family|color:/i);
  assert.equal(toMarkdown([item('empty', '<br>'), heading('empty-h', 2, '  ')]), '');
});

test('editor paste sanitation removes executable nodes and event attributes', () => {
  const html = cleanHTML('<script>alert(1)</script><iframe src="https://example.com"></iframe><b onclick="alert(2)">Safe</b>');
  assert.equal(html, '<b>Safe</b>');
});

test('copy preview sanitizes Markdown HTML and prevents external navigation', () => {
  const target = document.createElement('div');
  renderMarkdown('# Heading\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<a href="javascript:alert(1)" onclick="alert(2)">Danger</a>\n\n[External](https://example.com)', target);
  assert.equal(target.querySelector('h1').textContent, 'Heading');
  assert.equal(target.querySelectorAll('script,img,iframe,style,video,audio').length, 0);
  assert.equal(target.querySelectorAll('[onclick],[onerror]').length, 0);
  for (const link of target.querySelectorAll('a')) assert.equal(link.hasAttribute('href'), false);
});

test('history line diff reconstructs both source texts without treating content as HTML', () => {
  const before = '# One\nOld\nShared';
  const after = '# One\n<script>literal</script>\nShared';
  const diff = lineDiff(before, after);
  assert.equal(diff.filter(l => l.type !== 'add').map(l => l.text).join('\n'), before);
  assert.equal(diff.filter(l => l.type !== 'remove').map(l => l.text).join('\n'), after);
  assert.ok(diff.some(l => l.type === 'add' && l.text === '<script>literal</script>'));
  assert.ok(diff.some(l => l.type === 'remove' && l.text === 'Old'));
});
