import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { readFile as reactFixture } from './helpers/read-fixture.mjs';

test('React shell preserves every existing control ID, type, label, option and native integration selector', async () => {
  const before = new JSDOM(await readFile(new URL('./fixtures/editor-0.9.16.html', import.meta.url), 'utf8')).window.document;
  const after = new JSDOM(await reactFixture(new URL('../web/index.html', import.meta.url), 'utf8')).window.document;
  const original = [...before.querySelectorAll('[id]')];
  assert.equal(after.querySelectorAll('[id]:not(#root)').length, original.length);
  for (const control of original) {
    const current = after.getElementById(control.id);
    assert.ok(current, control.id);
    assert.equal(current.tagName, control.tagName, control.id);
    for (const attribute of ['aria-label', 'aria-controls', 'role', 'type', 'title', 'min', 'max'])
      assert.equal(current.getAttribute(attribute), control.getAttribute(attribute), `${control.id}: ${attribute}`);
    assert.equal(current.hidden, control.hidden, control.id);
    if (control.tagName === 'SELECT') {
      assert.deepEqual([...current.options].map(o => [o.value, o.textContent.trim()]),
        [...control.options].map(o => [o.value, o.textContent.trim()]), control.id);
    }
  }
  assert.equal(after.querySelectorAll('.window-header').length, 1);
  assert.equal(after.querySelectorAll('main').length, 1);
  assert.equal(after.querySelector('.workspace main'), after.querySelector('main'));
});
