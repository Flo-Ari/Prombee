import test from "node:test";
import assert from "node:assert/strict";
import { bindSpeech } from "../web/speech.js";
import { JSDOM } from "jsdom";
const createButton = () =>
  new JSDOM(`<button><svg></svg></button>`).window.document.querySelector(
    "button",
  );
test("online recognition runs first and commits final text", async () => {
  let instance,
    results = [];
  class Recognition {
    constructor() {
      instance = this;
    }
    start() {}
    stop() {
      this.onend();
    }
  }
  const button = createButton();
  const controller = bindSpeech({
    button,
    Recognition,
    capture: () => ({ id: "target" }),
    commit: (t, text) => results.push(text),
    notify: () => {},
    request: () => assert.fail("system used before online"),
  });
  await button.onclick();
  instance.onresult({
    resultIndex: 0,
    results: [Object.assign([{ transcript: "在线识别" }], { isFinal: true })],
  });
  await controller.stop();
  assert.deepEqual(results, ["在线识别"]);
  assert.equal(button.getAttribute("aria-label"), "语音输入");
  assert.ok(button.querySelector("svg"));
});
test("unavailable browser recognition tries system once and stops it", async () => {
  let actions = [];
  const button = createButton();
  const controller = bindSpeech({
    button,
    Recognition: null,
    capture: () => ({}),
    commit: () => {},
    notify: () => {},
    request: async (url, options) => {
      const action = JSON.parse(options.body).action;
      actions.push(action);
      return {
        ok: true,
        json: async () => ({
          state: action === "start" ? "listening" : "idle",
        }),
      };
    },
  });
  await button.onclick();
  await controller.stop();
  assert.deepEqual(actions, ["start", "stop"]);
});

test("network failure preserves final words and then activates system fallback", async () => {
  let instance,
    focused = 0,
    actions = [],
    texts = [];
  class Recognition {
    constructor() {
      instance = this;
    }
    start() {}
  }
  const button = createButton();
  const controller = bindSpeech({
    button,
    Recognition,
    capture: () => ({ focus: () => focused++ }),
    commit: (target, text) => texts.push(text),
    notify: () => {},
    request: async (url, options) => {
      const action = JSON.parse(options.body).action;
      actions.push(action);
      return {
        ok: true,
        json: async () => ({
          state: action === "start" ? "listening" : "idle",
        }),
      };
    },
  });
  await button.onclick();
  instance.onresult({
    resultIndex: 0,
    results: [Object.assign([{ transcript: "保留" }], { isFinal: true })],
  });
  instance.onerror({ error: "network" });
  instance.onend();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(texts, ["保留"]);
  assert.equal(focused, 1);
  await controller.stop();
  assert.deepEqual(actions, ["start", "stop"]);
});
