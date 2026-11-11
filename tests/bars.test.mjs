import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { mountBars } from "../web/bars.js";
const html = await readFile(
  new URL("../web/index.html", import.meta.url),
  "utf8",
);
function setup(saved = {}) {
  const dom = new JSDOM(html, { url: "http://localhost" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  for (const bar of document.querySelectorAll(".toolbar"))
    bar.hidden = bar.id !== "editorToolbar";
  const main = document.querySelector("main");
  main.scrollTop = 123;
  const writes = [],
    positions = { ...saved };
  const controller = mountBars({
    request: async (url, options) => {
      assert.equal(url, "/api/layout");
      if (options) {
        const value = JSON.parse(options.body);
        writes.push(value);
        positions[value.page] = value.position;
      }
      return { ok: true, json: async () => ({ positions: { ...positions } }) };
    },
  });
  const workspace = document.querySelector(".workspace"),
    grip = document.querySelector(".bar-grip");
  workspace.getBoundingClientRect = () => ({
    left: 0,
    top: 60,
    width: 1080,
    height: 700,
  });
  const pointer = (type, x, y) => {
    const event = new window.Event(type, { bubbles: true });
    Object.assign(event, { button: 0, pointerId: 1, clientX: x, clientY: y });
    grip["on" + type](event);
  };
  return { controller, workspace, grip, writes, main, pointer };
}
test("left sidebar is the default; page-specific positions persist without replacing the editor", async () => {
  const { controller, workspace, grip, writes, main } = setup({
    preview: "top",
  });
  await controller.ready;
  assert.equal(workspace.dataset.dock, "left");
  assert.equal(main.scrollTop, 123);
  assert.equal(document.querySelector("main"), main);
  assert.ok(document.querySelector("header").classList.contains("app-bar"));
  assert.ok(
    [...document.querySelectorAll(".toolbar")].every((bar) =>
      bar.classList.contains("app-bar"),
    ),
  );
  grip.click();
  await controller.settled();
  assert.equal(workspace.dataset.dock, "top");
  assert.deepEqual(writes[0], { page: "editor", position: "top" });
  controller.show("template");
  assert.equal(workspace.dataset.dock, "left");
  controller.show("preview");
  assert.equal(workspace.dataset.dock, "top");
  controller.show("editor");
  assert.equal(workspace.dataset.dock, "top");
});
test("drag snaps to top or left, while an invalid drop or Escape preserves position", async () => {
  const { controller, workspace, pointer } = setup();
  await controller.ready;
  pointer("pointerdown", 70, 80);
  pointer("pointermove", 500, 80);
  pointer("pointerup", 500, 80);
  await controller.settled();
  assert.equal(workspace.dataset.dock, "top");
  pointer("pointerdown", 15, 80);
  pointer("pointermove", 600, 500);
  pointer("pointerup", 600, 500);
  assert.equal(workspace.dataset.dock, "top");
  pointer("pointerdown", 15, 80);
  pointer("pointermove", 70, 200);
  window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
  pointer("pointerup", 70, 200);
  assert.equal(workspace.dataset.dock, "top");
  pointer("pointerdown", 15, 80);
  pointer("pointermove", 70, 200);
  pointer("pointerup", 70, 200);
  await controller.settled();
  assert.equal(workspace.dataset.dock, "left");
  assert.equal(workspace.dataset.dragging, undefined);
});
