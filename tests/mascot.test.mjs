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
  {
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
  },
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
  assert.equal(buttons.length, 8);
  buttons.find((b) => b.textContent === "取消动画").click();
  assert.equal(api.state().enabled, false);
  tick(120_000);
  assert.equal(api.state().scene, -1);
  assert.ok(messages.some((m) => m.action === "settings" && !m.enabled));
  api.showMenu(40, 40);
  [...document.querySelectorAll("#menu button")]
    .find((b) => b.textContent.includes("播放待机动画 2"))
    .click();
  assert.equal(api.state().scene, 1);
  assert.equal(api.state().enabled, true);
  api.destroy();
});
test("both morph directions complete in 300 ms, once only, even with all animations disabled", () => {
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
    tick(began + 299);
    assert.equal(api.state().morphing, true);
    tick(began + 300);
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

test("all scenes enter from the current pose and return continuously to live flight", async () => {
  const { flightPose, scenePose } = await import("../web/mascot.js");
  const began = 12345,
    origin = flightPose(began);
  for (let index = 0; index < SCENES.length; index++) {
    const duration = SCENES[index].duration;
    assert.deepEqual(scenePose(index, 0, began, origin), origin);
    assert.deepEqual(
      scenePose(index, duration, began + duration, origin),
      flightPose(began + duration),
    );
    const first = scenePose(index, 1, began + 1, origin),
      last = scenePose(index, duration - 1, began + duration - 1, origin),
      neutral = flightPose(began + duration - 1);
    for (const key of Object.keys(origin)) {
      assert.ok(
        Math.abs(first[key] - origin[key]) < 0.01,
        `scene ${index} entrance ${key}`,
      );
      assert.ok(
        Math.abs(last[key] - neutral[key]) < 0.001,
        `scene ${index} exit ${key}`,
      );
    }
    for (let t = 0; t <= duration; t += 16) {
      const pose = scenePose(index, t, began + t, origin);
      for (const value of Object.values(pose))
        assert.ok(Number.isFinite(value));
      assert.ok(pose.scale > 0 && pose.alpha >= 0 && pose.alpha <= 1);
    }
  }
});
test("switching scenes retains the current bee position, scale, rotation and energy", () => {
  const { api } = start();
  for (const [index, elapsed] of [
    [0, 1700],
    [1, 5000],
    [2, 11000],
    [3, 2900],
  ]) {
    api.play(index);
    tick(now + elapsed);
    const before = api.state().pose;
    api.play((index + 1) % 4);
    tick(now);
    assert.deepEqual(api.state().pose, before);
  }
  api.destroy();
});
test("fracture is clipped to a small patch regardless of canvas dimensions", async () => {
  const { CRACK_RADIUS } = await import("../web/mascot.js");
  const radii = [];
  ctx.arc = (x, y, r) => radii.push(r);
  const { api } = start();
  api.play(3);
  tick(2800);
  assert.equal(CRACK_RADIUS, 92);
  assert.deepEqual(radii, [92]);
  api.destroy();
  delete ctx.arc;
});

test("flight direction is selected in the context menu, mirrored and saved", () => {
  const { api, messages } = start();
  api.receive("settings", { enabled: true, direction: "right" });
  api.showMenu(50, 50);
  const left = [...document.querySelectorAll("#menu button")].find((b) =>
    b.textContent.includes("向左飞行"),
  );
  assert.equal(left.role, "menuitemradio");
  assert.equal(left.getAttribute("aria-checked"), "false");
  left.click();
  assert.equal(api.state().direction, "left");
  assert.ok(
    messages.some((m) => m.action === "settings" && m.direction === "left"),
  );
  assert.equal(localStorage.getItem("prombee-mascot-direction"), "left");
  const scales = [];
  ctx.scale = (x, y) => scales.push([x, y]);
  tick(100);
  assert.ok(scales.some(([x, y]) => x === -1 && y === 1));
  api.showMenu(50, 50);
  assert.equal(
    [...document.querySelectorAll("#menu button")].some((b) =>
      b.textContent.includes("向左飞行"),
    ),
    false,
  );
  [...document.querySelectorAll("#menu button")]
    .find((b) => b.textContent.includes("向右飞行"))
    .click();
  assert.equal(api.state().direction, "right");
  api.destroy();
  delete ctx.scale;
});

test("native GTK drag suppresses pointer capture, bridge move packets and accidental clicks", () => {
  const { api, messages } = start();
  api.receive("settings", { enabled: true, nativeDrag: true });
  let captures = 0;
  canvas.setPointerCapture = () => captures++;
  canvas.dispatchEvent(
    new window.MouseEvent("pointerdown", {
      button: 0,
      screenX: 200,
      screenY: 100,
    }),
  );
  canvas.dispatchEvent(
    new window.MouseEvent("pointermove", { screenX: 260, screenY: 140 }),
  );
  canvas.dispatchEvent(new window.Event("pointercancel"));
  canvas.dispatchEvent(new window.MouseEvent("click"));
  assert.equal(captures, 0);
  assert.ok(!messages.some((m) => m.action === "drag" || m.action === "open"));
  tick(50_000);
  api.receive("interaction");
  tick(70_000);
  assert.equal(api.state().scene, -1);
  api.destroy();
  delete canvas.setPointerCapture;
});

test("native full-screen pointer updates remain authoritative outside the companion window", () => {
  const { api } = start();
  api.receive("cursor", { x: -4000, y: 2800 });
  canvas.dispatchEvent(
    new window.MouseEvent("pointermove", { clientX: 40, clientY: 40 }),
  );
  tick(100);
  assert.deepEqual(api.state().cursor, { x: -4000, y: 2800 });
  api.receive("cursor", { x: 9000, y: -1200 });
  tick(200);
  assert.deepEqual(api.state().cursor, { x: 9000, y: -1200 });
  api.destroy();
});
test("combat rays align with the live bug and blade impact occurs at its tip", async () => {
  const { combatPose } = await import("../web/mascot.js");
  for (let t = 3100; t < 11900; t += 41) {
    const p = combatPose(t),
      dx = p.target.x - p.muzzle.x,
      dy = p.target.y - p.muzzle.y;
    assert.ok(Math.abs(dx * Math.sin(p.angle) - dy * Math.cos(p.angle)) < 1e-8);
    assert.ok(dx * Math.cos(p.angle) + dy * Math.sin(p.angle) > 0);
  }
  const impact = combatPose((3 + 0.52 * 2.7) * 1000);
  assert.ok(
    Math.hypot(
      impact.bladeTip.x - impact.bladeTarget.x,
      impact.bladeTip.y - impact.bladeTarget.y,
    ) < 1e-8,
  );
});
test("feeding tokens reach the mouth, idle labels omit names and the menu only offers reversing flight", async () => {
  const { scenePose, mouthPoint } = await import("../web/mascot.js");
  const mouth = mouthPoint(scenePose(2, 6500, 6500), 1);
  assert.ok(Math.abs(mouth.x + 4) < 1e-6);
  assert.ok(Math.abs(mouth.y - 31) < 1e-6);
  const { api } = start();
  api.receive("settings", { enabled: true, direction: "right" });
  api.showMenu(30, 30);
  const labels = [...document.querySelectorAll("#menu button")].map(
    (b) => b.textContent,
  );
  assert.deepEqual(
    labels.filter((s) => s.startsWith("播放待机")),
    ["播放待机动画 1", "播放待机动画 2", "播放待机动画 3", "播放待机动画 4"],
  );
  assert.equal(labels.filter((s) => s.includes("飞行")).length, 1);
  api.destroy();
});

test("native frame pulse finishes a 300 ms morph when RAF and browser timers stop", () => {
  const { api, messages } = start();
  api.receive("morph", {
    direction: "open",
    from: { x: 250, y: 210 },
    to: { x: 30, y: 40 },
    editor: { x: 0, y: 0, width: 520, height: 420 },
  });
  now = 150;
  api.receive("frame");
  assert.equal(api.state().morphing, true);
  now = 300;
  api.receive("frame");
  assert.equal(api.state().morphing, false);
  now = 350;
  api.receive("frame");
  assert.equal(messages.filter((m) => m.action === "morphDone").length, 1);
  api.destroy();
});
