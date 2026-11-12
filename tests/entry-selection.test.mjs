import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { selectedEntryText } from "../web/entry-selection.js";
test("cross-entry copy uses selected text and line breaks, excluding heading/list markers and action controls", () => {
  const dom = new JSDOM(
    '<main><article><section class="row"><span>H1</span><div class="content">标题</div><button>复制</button></section><section class="row"><span>1.</span><div class="content">第一行<br>第二行</div><button>删除</button></section><section class="row" hidden><div class="content">折叠</div></section></article></main>',
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const paper = document.querySelector("article"),
    fields = paper.querySelectorAll(".content"),
    s = window.getSelection(),
    r = document.createRange();
  r.setStart(fields[0].firstChild, 1);
  r.setEnd(fields[1].lastChild, 2);
  s.removeAllRanges();
  s.addRange(r);
  assert.equal(selectedEntryText(paper), "题\n第一行\n第二");
  r.selectNodeContents(fields[1]);
  s.removeAllRanges();
  s.addRange(r);
  assert.equal(selectedEntryText(paper), "第一行\n第二行");
});

test("cross-host dragging temporarily leaves editable mode and the next click restores editing", async () => {
  const dom = new JSDOM(
    '<main><article><section class="row"><div class="content" contenteditable>alpha</div></section><section class="row"><div class="content" contenteditable>beta</div></section></article></main>',
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.requestAnimationFrame = () => 1;
  globalThis.cancelAnimationFrame = () => {};
  const { mountEntrySelection } = await import("../web/entry-selection.js"),
    paper = document.querySelector("article"),
    fields = paper.querySelectorAll(".content");
  document.elementFromPoint = (x) => fields[x < 10 ? 0 : 1];
  document.caretRangeFromPoint = (x) => {
    const r = document.createRange();
    r.setStart(fields[x < 10 ? 0 : 1].firstChild, 1);
    r.collapse(true);
    return r;
  };
  mountEntrySelection(paper);
  fields[0].dispatchEvent(
    new window.MouseEvent("mousedown", {
      button: 0,
      buttons: 1,
      clientX: 1,
      bubbles: true,
    }),
  );
  fields[1].dispatchEvent(
    new window.MouseEvent("mousemove", {
      buttons: 1,
      clientX: 20,
      bubbles: true,
      cancelable: true,
    }),
  );
  document.dispatchEvent(
    new window.MouseEvent("mouseup", { button: 0, bubbles: true }),
  );
  assert.equal(fields[0].getAttribute("contenteditable"), "false");
  assert.equal(selectedEntryText(paper), "lpha\nb");
  fields[1].dispatchEvent(
    new window.MouseEvent("mousedown", {
      button: 0,
      buttons: 1,
      clientX: 20,
      bubbles: true,
    }),
  );
  assert.equal(fields[0].getAttribute("contenteditable"), "true");
  assert.equal(fields[1].getAttribute("contenteditable"), "true");
});
