import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
const dom = new JSDOM(
  await readFile(new URL("../web/index.html", import.meta.url), "utf8"),
  { url: "http://127.0.0.1/" },
);
for (const key of ["window", "document", "localStorage", "navigator"])
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
  });
window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
window.cancelAnimationFrame = clearTimeout;
globalThis.setInterval = () => 0;
globalThis.requestAnimationFrame = (fn) => fn();
window.HTMLElement.prototype.scrollIntoView = () => {};
const row = (id, kind, level, html) => ({ id, kind, level, html });
const initial = {
  current: "round",
  dark: false,
  font: "sans-serif",
  size: 14,
  documents: [
    {
      id: "round",
      name: "第1轮",
      nodes: [
        row("h", "heading", 1, "标题"),
        row("a", "item", 1, "甲，乙。丙"),
        row("sub", "heading", 2, "小节"),
        row("b", "item", 1, ""),
        row("tail", "heading", 1, "末尾"),
        row("c", "item", 1, "末项"),
      ],
    },
  ],
};
let saved,
  copied = [];
globalThis.fetch = async (url, options) => ({
  ok: true,
  json: async () => {
    if (url === "/api/state") {
      if (options) {
        saved = JSON.parse(options.body);
        return { revision: 1 };
      }
      return {
        state: structuredClone(initial),
        revision: 0,
        set: { id: "set", name: "测试", path: "/tmp/test.txt" },
      };
    }
    if (url === "/api/shortcuts") return { bindings: {} };
    if (url === "/api/display") return { width: 1180 };
    if (url.startsWith("/api/attachments"))
      return {
        attachment: {
          id: "asset",
          name: "附件.txt",
          path: "/tmp/附件.txt",
          type: "text/plain",
          size: 4,
        },
      };
    if (url.startsWith("/api/other"))
      return {
        recognizeMarkdown: true,
        pairDelimiters: true,
        autoSort: true,
        targetAgent: "codex",
      };
    return { sets: [], groups: [] };
  },
});
window.pywebview = {
  api: { clipboard: async (text, files) => copied.push({ text, files }) },
};
await import("../web/app.js");
const $ = (id) => document.getElementById(id),
  field = (id) => document.querySelector('.content[data-id="' + id + '"]');
const tick = () => new Promise((r) => setTimeout(r, 10));
function caret(id, end = true) {
  let f = field(id);
  f.focus();
  let r = document.createRange();
  r.selectNodeContents(f);
  r.collapse(!end);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(r);
  document.dispatchEvent(new window.Event("selectionchange"));
  return f;
}
function key(f, key, extra = {}) {
  f.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
      ...extra,
    }),
  );
}

test("list scope works on a heading subtree and all entries without an active row", () => {
  $("listType").value = "all-ordered";
  $("listType").dispatchEvent(new window.Event("change"));
  assert.match(
    field("a").closest(".row").querySelector(".marker").textContent,
    /1/,
  );
  assert.match(
    field("c").closest(".row").querySelector(".marker").textContent,
    /1/,
  );
  caret("sub");
  $("listType").value = "none";
  $("listType").dispatchEvent(new window.Event("change"));
  assert.equal(
    field("b").closest(".row").querySelector(".marker").textContent,
    "",
  );
  assert.match(
    field("a").closest(".row").querySelector(".marker").textContent,
    /1/,
  );
});
test("undo retains focus and caret in the same entry", () => {
  let f = caret("a");
  f.dispatchEvent(
    new window.InputEvent("beforeinput", {
      inputType: "insertText",
      data: "新",
      bubbles: true,
    }),
  );
  f.textContent += "新";
  f.dispatchEvent(new window.Event("input", { bubbles: true }));
  caret("a");
  key(f, "z", { ctrlKey: true });
  assert.equal(document.activeElement, field("a"));
  assert.equal(field("a").textContent, "甲，乙。丙");
  assert.ok(field("a").contains(window.getSelection().focusNode));
});
test("empty Backspace lands at previous End; Delete lands at following Home; undo restores row", () => {
  key(caret("b"), "Backspace");
  assert.equal(field("b"), null);
  assert.equal(document.activeElement, field("sub"));
  let r = document.createRange();
  r.selectNodeContents(field("sub"));
  r.setEnd(window.getSelection().focusNode, window.getSelection().focusOffset);
  assert.equal(r.toString(), field("sub").textContent);
  $("undo").click();
  assert.ok(field("b"));
  key(caret("b"), "Delete");
  assert.equal(document.activeElement, field("tail"));
  assert.equal(window.getSelection().getRangeAt(0).startOffset, 0);
  $("undo").click();
});
test("repeated header tabs return to editing, copy stays visible, and displays retain resize grips", () => {
  $("template").click();
  assert.equal(document.body.dataset.page, "template");
  $("template").click();
  assert.equal(document.body.dataset.page, "editor");
  $("settingsTab").click();
  assert.equal($("copy").hidden, false);
  $("settingsTab").click();
  assert.equal(document.body.dataset.page, "editor");
  assert.equal($("paper").querySelectorAll(".display-resizer").length, 2);
});
test("attachment gallery selection persists metadata and copies file IDs, reference and prompt text together", async () => {
  document.querySelector(".attachment-add").click();
  await tick();
  assert.equal(document.querySelectorAll(".attachment-card").length, 1);
  $("copy").click();
  await tick();
  assert.deepEqual(copied.at(-1).files, ["asset"]);
  assert.match(copied.at(-1).text, /甲，乙。丙/);
  assert.match(copied.at(-1).text, /file:\/\/\//);
  assert.match($("documents").selectedOptions[0].textContent, /✓/);
});

test('Ctrl+left/right moves to punctuation boundaries within the active entry',()=>{
 const f=caret('a'),prefix=()=>{const r=document.createRange();r.selectNodeContents(f);r.setEnd(window.getSelection().focusNode,window.getSelection().focusOffset);return r.toString();};
 key(f,'ArrowLeft',{ctrlKey:true});assert.equal(prefix(),'甲，乙。');key(f,'ArrowLeft',{ctrlKey:true});assert.equal(prefix(),'甲，');key(f,'ArrowRight',{ctrlKey:true});assert.equal(prefix(),'甲，乙。');
});

test('display dragging starts at the visible paper width without a capped-width dead zone',()=>{
 const paper=$('paper'),grip=paper.querySelector('.display-resizer.right'),old=paper.getBoundingClientRect;
 paper.getBoundingClientRect=()=>({width:800});grip.setPointerCapture=()=>{};
 grip.onpointerdown({button:0,clientX:500,pointerId:1,preventDefault(){}});grip.onpointermove({clientX:480});
 assert.equal(document.documentElement.style.getPropertyValue('--display-width'),'760px');grip.onpointerup();assert.equal(document.body.classList.contains('resizing-display'),false);paper.getBoundingClientRect=old;
});
