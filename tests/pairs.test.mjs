import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { bindPairs } from "../web/pairs.js";
const dom = new JSDOM("<div contenteditable></div>");
globalThis.window = dom.window;
globalThis.document = dom.window.document;
const el = document.querySelector("div");
let enabled = true;
bindPairs(el, () => enabled);
function caret() {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(r);
}
function type(c) {
  const event = new window.InputEvent("beforeinput", {
    data: c,
    inputType: "insertText",
    bubbles: true,
    cancelable: true,
  });
  el.dispatchEvent(event);
  return event;
}
function offset() {
  const r = document.createRange();
  r.selectNodeContents(el);
  r.setEnd(window.getSelection().focusNode, window.getSelection().focusOffset);
  return r.toString().length;
}
test("English and Chinese pairs keep the caret between delimiters; existing closers are traversed", () => {
  for (const [open, close] of [
    ['"', '"'],
    ["'", "'"],
    ["(", ")"],
    ["[", "]"],
    ["{", "}"],
    ["“", "”"],
    ["‘", "’"],
    ["（", "）"],
    ["【", "】"],
    ["｛", "｝"],
    ["`", "`"],
  ]) {
    el.textContent = "";
    caret();
    assert.equal(type(open).defaultPrevented, true);
    assert.equal(el.textContent, open + close);
    assert.equal(offset(), 1);
    type(close);
    assert.equal(el.textContent, open + close);
    assert.equal(offset(), 2);
  }
});
test("three backticks produce a code fence, selected formatting survives wrapping, and disabling leaves normal input", () => {
  el.textContent = "";
  caret();
  type("`");
  type("`");
  type("`");
  assert.equal(el.textContent, "``````");
  assert.equal(offset(), 3);
  el.innerHTML = "<b>text</b>";
  const r = document.createRange();
  r.selectNodeContents(el);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(r);
  type("[");
  assert.equal(el.innerHTML, "[<b>text</b>]");
  enabled = false;
  assert.equal(type("(").defaultPrevented, false);
  enabled = true;
});
test("IME committed Chinese punctuation is completed after composition, never during composition", async () => {
  el.textContent = "";
  caret();
  assert.equal(type("文").defaultPrevented, false);
  el.textContent = "（";
  caret();
  el.dispatchEvent(
    new window.CompositionEvent("compositionend", { data: "（" }),
  );
  await Promise.resolve();
  assert.equal(el.textContent, "（）");
  assert.equal(offset(), 1);
});
