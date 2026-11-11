import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import {
  prepareFormatting,
  restoreFormattingCaret,
  readFormatting,
} from "../web/formatting.js";
test("collapsed formatting targets one entire entry then restores the caret; explicit selections stay scoped", () => {
  const dom = new JSDOM(
    '<div id="a"><span style="font-family:serif;font-size:22pt;color:#123456;font-weight:700">abcd</span></div><div id="b">neighbor</div>',
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const el = document.querySelector("#a"),
    text = el.firstChild.firstChild,
    r = document.createRange(),
    s = window.getSelection();
  r.setStart(text, 2);
  r.collapse(true);
  s.addRange(r);
  const target = prepareFormatting(el);
  assert.equal(s.toString(), "abcd");
  restoreFormattingCaret(el, target);
  assert.equal(s.anchorOffset, 2);
  assert.equal(s.isCollapsed, true);
  const info = readFormatting(el);
  assert.equal(info.font, "serif");
  assert.equal(info.size, 22);
  assert.equal(info.bold, true);
  assert.equal(info.color, "#123456");
  r.setStart(text, 1);
  r.setEnd(text, 3);
  s.removeAllRanges();
  s.addRange(r);
  assert.equal(prepareFormatting(el).whole, false);
  assert.equal(s.toString(), "bc");
  assert.equal(document.querySelector("#b").textContent, "neighbor");
});
