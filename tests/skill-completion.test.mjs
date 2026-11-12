import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountSkillCompletion } from "../web/skill-completion.js";
test("$ completion filters actual catalog entries, replaces only the query, and handles keyboard selection before editor arrows", async () => {
  const dom = new JSDOM(
    '<main><article><section class="row"><div class="content" contenteditable="true">请使用 $map</div></section></article></main>',
    { url: "http://localhost" },
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.requestAnimationFrame = (fn) => fn();
  const paper = document.querySelector("article"),
    field = paper.querySelector(".content");
  field.focus();
  const r = document.createRange();
  r.selectNodeContents(field);
  r.collapse(false);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(r);
  const ui = mountSkillCompletion({
    paper,
    agent: () => "codex",
    setId: () => "set",
    request: async () => ({
      ok: true,
      json: async () => ({
        skills: [
          {
            name: "mapping",
            reference: "$mapping",
            description: "<img src=x onerror=bad>",
          },
          { name: "notes", description: "笔记" },
        ],
      }),
    }),
  });
  await ui.update();
  assert.equal(document.querySelectorAll(".skill-option").length, 1);
  assert.equal(document.querySelector(".skill-option img"), null);
  const event = new window.KeyboardEvent("keydown", {
    key: "Enter",
    bubbles: true,
    cancelable: true,
  });
  field.dispatchEvent(event);
  assert.equal(event.defaultPrevented, true);
  assert.equal(field.textContent, "请使用 $mapping ");
  assert.equal(document.querySelector(".skill-completion").hidden, true);
});
