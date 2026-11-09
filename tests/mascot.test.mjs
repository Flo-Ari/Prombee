import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
const dom = new JSDOM('<canvas></canvas><div id="menu" hidden></div>', {
  url: "http://localhost/",
});
Object.assign(globalThis, {
  window: dom.window,
  document: dom.window.document,
  localStorage: dom.window.localStorage,
  devicePixelRatio: 1,
});
let now = 0,
  raf;
Object.defineProperty(globalThis, "performance", {
  value: { now: () => now },
  configurable: true,
});
globalThis.requestAnimationFrame = (fn) => ((raf = fn), 1);
globalThis.cancelAnimationFrame = () => {};
globalThis.ResizeObserver = class {
  observe() {}
  disconnect() {}
};
globalThis.Image = class {
  complete = true;
  naturalWidth = 128;
};
const gradient = { addColorStop() {} };
const ctx = new Proxy(
  { createRadialGradient: () => gradient },
  { get: (o, k) => o[k] || (() => {}) },
);
const canvas = document.querySelector("canvas");
canvas.getContext = () => ctx;
Object.defineProperties(canvas, {
  clientWidth: { value: 520 },
  clientHeight: { value: 420 },
});
const { mountMascot, SCENES } = await import("../web/mascot.js");
function start() {
  now = 0;
  const messages = [];
  const api = mountMascot(
    canvas,
    document.querySelector("#menu"),
    (action, data) => messages.push({ action, ...data }),
  );
  return { api, messages };
}
function tick(t) {
  now = t;
  raf(t);
}

test("one minute without a click starts an idle scene; all four finish and return to flight", () => {
  const { api, messages } = start();
  tick(59_999);
  assert.equal(api.state().scene, -1);
  tick(60_000);
  assert.equal(api.state().scene, 0);
  tick(60_000 + SCENES[0].duration);
  assert.equal(api.state().scene, -1);
  assert.ok(messages.some((m) => m.action === "sceneEnd"));
  for (let i = 0; i < 4; i++) {
    api.play(i);
    tick(now + SCENES[i].duration - 1);
    assert.equal(api.state().scene, i);
    tick(now + 2);
    assert.equal(api.state().scene, -1);
  }
  api.destroy();
});
test("right-click menu has all scenes; disabling removes flight and automatic scenes until re-enabled", () => {
  const { api, messages } = start();
  api.showMenu(500, 400);
  const buttons = [...document.querySelectorAll("#menu button")];
  assert.equal(buttons.length, 7);
  buttons.find((b) => b.textContent === "取消动画").click();
  assert.equal(api.state().enabled, false);
  tick(120_000);
  assert.equal(api.state().scene, -1);
  assert.ok(messages.some((m) => m.action === "settings" && !m.enabled));
  api.showMenu(40, 40);
  document.querySelectorAll("#menu button")[4].click();
  assert.equal(api.state().scene, 1);
  assert.equal(api.state().enabled, true);
  api.destroy();
});
test("both morph directions complete in 500 ms, once only, even with all animations disabled", () => {
  const { api, messages } = start();
  api.receive("settings", { enabled: false });
  for (const direction of ["open", "close"]) {
    const began = now;
    api.receive("morph", {
      direction,
      from: { x: 400, y: 300 },
      to: { x: 24, y: 40 },
      editor: { x: 0, y: 0, width: 520, height: 420 },
    });
    tick(began + 499);
    assert.equal(api.state().morphing, true);
    tick(began + 500);
    assert.equal(api.state().morphing, false);
    assert.equal(
      messages.filter(
        (m) => m.action === "morphDone" && m.direction === direction,
      ).length,
      1,
    );
  }
  api.destroy();
});
test("hidden mascot pauses; showing it restarts the 60-second idle timer", () => {
  const { api } = start();
  api.receive("pause");
  tick(120_000);
  assert.equal(api.state().scene, -1);
  api.receive("show");
  tick(179_999);
  assert.equal(api.state().scene, -1);
  tick(180_000);
  assert.equal(api.state().scene, 0);
  api.destroy();
});
