import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { bindHoldDrag } from "../web/reorder.js";
test("drag handle starts immediately; long press starts sorting; ordinary selection does not", async () => {
  const dom = new JSDOM(
    "<section><button>⠿</button><div contenteditable>文字</div></section>",
  );
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  const row = document.querySelector("section"),
    handle = document.querySelector("button"),
    content = document.querySelector("div");
  const calls = [];
  bindHoldDrag(
    row,
    {
      start: () => calls.push("start"),
      move: () => calls.push("move"),
      end: (c) => calls.push(c ? "cancel" : "end"),
    },
    handle,
  );
  const pointer = (target, type, x = 0) =>
    target.dispatchEvent(
      new dom.window.MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        clientX: x,
        clientY: 20,
      }),
    );
  pointer(handle, "pointerdown");
  pointer(content, "pointermove", 30);
  pointer(content, "pointerup", 30);
  assert.deepEqual(calls, ["start", "move", "end"]);
  calls.length = 0;
  pointer(content, "pointerdown");
  pointer(content, "pointermove", 30);
  await new Promise((r) => setTimeout(r, 470));
  pointer(content, "pointerup", 30);
  assert.deepEqual(calls, []);
  pointer(content, "pointerdown");
  await new Promise((r) => setTimeout(r, 470));
  pointer(content, "pointermove", 15);
  pointer(content, "pointerup", 15);
  assert.deepEqual(calls, ["start", "move", "end"]);
  dom.window.close();
});

test("group buttons support a held drag without turning an ordinary click into sorting", async () => {
  const dom = new JSDOM(
    '<section><button class="group-name">分组</button><button class="group-menu">⋯</button></section>',
  );
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  const row = document.querySelector("section"),
    name = document.querySelector(".group-name"),
    menu = document.querySelector(".group-menu"),
    calls = [];
  bindHoldDrag(row, {
    holdSelector: ".group-name",
    start: () => calls.push("start"),
    move: () => {},
    end: (cancel) => calls.push(cancel ? "cancel" : "end"),
  });
  const send = (target, type) =>
    target.dispatchEvent(
      new dom.window.MouseEvent(type, { bubbles: true, button: 0 }),
    );
  send(name, "pointerdown");
  send(name, "pointerup");
  assert.deepEqual(calls, []);
  send(menu, "pointerdown");
  await new Promise((r) => setTimeout(r, 470));
  send(menu, "pointerup");
  assert.deepEqual(calls, []);
  send(name, "pointerdown");
  await new Promise((r) => setTimeout(r, 470));
  dom.window.dispatchEvent(new dom.window.Event("blur"));
  assert.deepEqual(calls, ["start", "cancel"]);
  dom.window.close();
});
