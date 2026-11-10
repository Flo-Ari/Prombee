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

const { subtreeMarkdown, markdownHeadings } = await import('../web/core.js');

test('authored Markdown overrides generated prefixes without rewriting lists or fenced content', () => {
  const nodes=[heading('h',2,'# 原始标题'),item('m','1. 原始列表<br>2. 第二条<br><br>```md<br># 代码中的标题<br>```'),heading('peer',2,'后续标题')];
  const original=structuredClone(nodes), text=toMarkdown(nodes);
  assert.match(text,/^# 原始标题\n/);
  assert.ok(text.includes('1. 原始列表\n2. 第二条\n\n```md\n# 代码中的标题\n```'));
  assert.match(text,/\n## 后续标题\n$/);
  assert.deepEqual(nodes,original);
  assert.deepEqual(markdownHeadings('```md\n# 代码\n```\n## 真实'),[2]);
});

test('explicit heading level affects only structural descendants and conflicting headings both survive', () => {
  const nodes=[heading('a',2,'# 自定义'),heading('b',3,'下级'),item('x','正文'),heading('c',2,'同级'),heading('d',3,'正常下级'),heading('e',1,'顶级')];
  const text=toMarkdown(nodes);
  assert.equal(text,'# 自定义\n\n## 下级\n1. 正文\n\n## 同级\n\n### 正常下级\n\n# 顶级\n');
  const duplicates=[heading('a',2,'# 重复'),heading('b',3,'# 重复'),item('c','保留正文'),heading('d',2,'重复')];
  const before=structuredClone(duplicates);
  assert.equal((toMarkdown(duplicates).match(/# 重复/g)||[]).length,3);
  assert.deepEqual(duplicates,before);
});

test('scoped copy retains inherited Markdown hierarchy and never includes siblings', () => {
  const nodes=[heading('a',2,'# 根'),heading('b',3,'子级'),item('c','子内容'),heading('d',3,'同级'),item('e','其他内容')];
  assert.equal(subtreeMarkdown(nodes,'b'),'## 子级\n1. 子内容\n');
  assert.equal(subtreeMarkdown(nodes,'c'),'1. 子内容\n');
  assert.equal(subtreeMarkdown(nodes,'missing'),'');
});

test('Markdown in a body item does not change later structural headings', () => {
  const nodes=[heading('a',2,'标题'),item('b','# 内容标题<br>## 内容子级'),heading('c',3,'编辑器子级'),heading('d',2,'同级')];
  const text=toMarkdown(nodes);
  assert.ok(text.includes('# 内容标题\n## 内容子级'));
  assert.ok(text.includes('### 编辑器子级'));
  assert.match(text,/\n## 同级\n$/);
});

test('authored heading Markdown wins over display emphasis and setext levels stay local', () => {
  const nodes=[heading('a',3,'<b># 原始标题</b>'),heading('b',4,'子级'),heading('c',3,'另一个标题<br>==='),heading('d',4,'其子级'),heading('e',3,'恢复')];
  assert.equal(toMarkdown(nodes),'# 原始标题\n\n## 子级\n\n另一个标题\n===\n\n## 其子级\n\n### 恢复\n');
});

const { integrateMarkdown, foldedNodes, selectionScope, contextLevel } = await import('../web/core.js');
test('Markdown integration creates editable headings and retains code, conflicting peers and unaffected siblings', () => {
  const source=[heading('root',2,'# 自定义<br>正文<br>## 冲突<br>```md<br># 代码<br>```'),heading('child',3,'原子级'),heading('peer',2,'冲突')];
  const result=integrateMarkdown(source,'root');
  assert.ok(result.some(n=>n.kind==='heading'&&n.level===1&&n.html==='自定义'));
  assert.ok(result.some(n=>n.raw&&n.html.includes('# 代码')));
  assert.equal(result.find(n=>n.id==='peer').level,2);
  assert.equal(result.filter(n=>n.html==='冲突').length,2);
  assert.ok(toMarkdown(result).includes('```md\n# 代码\n```'));
  assert.equal(source.length,3);
  assert.equal(contextLevel(result,'child'),3);
});

test('folded descendants and overlapping batch scopes do not remove or exclude content', () => {
  const nodes=[{...heading('a',1,'A'),collapsed:true},heading('b',2,'B'),item('c','C'),heading('d',1,'D')];
  assert.deepEqual([...foldedNodes(nodes)],['b','c']);
  assert.deepEqual([...selectionScope(nodes,new Set(['a','b']))],['a','b','c']);
  assert.equal(toMarkdown(nodes),'# A\n\n## B\n1. C\n\n# D\n');
});

test('inline Markdown in a title keeps its structural heading marker', () => {
  assert.equal(toMarkdown([heading('a',2,'**强调标题**')]),'## **强调标题**\n');
});

test('contenteditable multiline paste preserves the first block boundary and Markdown list items', () => {
  const browserHTML='## 实现要求<div>- 保留所有原有内容</div><div>- 完成后运行检查</div><div>### 输出格式</div><div>```md</div><div># 代码块里的标题</div><div>```</div>';
  const cleaned=cleanHTML(browserHTML);
  const nodes=[item('paste',cleaned)];
  const normalized=integrateMarkdown(nodes,'paste');
  assert.equal(normalized[0].html,'实现要求');
  assert.equal(normalized[0].level,2);
  assert.equal(toMarkdown(normalized),'## 实现要求\n\n- 保留所有原有内容\n- 完成后运行检查\n\n### 输出格式\n\n```md\n# 代码块里的标题\n```\n');
  assert.equal(cleanHTML(cleaned),cleaned);
});

test("drag sorting retains excluded and collapsed children and rejects self drops", async () => {
  const { moveSubtree } = await import("../web/reorder.js");
  const nodes = [
    { id: "a", kind: "heading", level: 1 },
    { id: "body", kind: "item", level: 1 },
    {
      id: "nested",
      kind: "heading",
      level: 2,
      collapsed: true,
      excluded: true,
    },
    { id: "child", kind: "item", level: 1 },
    { id: "b", kind: "heading", level: 1 },
    { id: "bbody", kind: "item", level: 1 },
  ];
  const before = structuredClone(nodes);
  assert.equal(moveSubtree(nodes, "a", "child", true), false);
  assert.deepEqual(nodes, before);
  assert.equal(moveSubtree(nodes, "a", "b", true), true);
  assert.deepEqual(
    nodes.map((n) => n.id),
    ["b", "bbody", "a", "body", "nested", "child"],
  );
  assert.equal(moveSubtree(nodes, "a", "b"), true);
  assert.deepEqual(nodes, before);
});
