import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { mountUpdates } from "../web/updates.js";
const html = await readFile(
  new URL("../web/index.html", import.meta.url),
  "utf8",
);
function dom() {
  const instance = new JSDOM(html, { url: "http://localhost" });
  globalThis.window = instance.window;
  globalThis.document = instance.window.document;
  return (id) => document.getElementById(id);
}
test("settings use the logo as editor, an icon gear and nested toolbar tabs", () => {
  const $ = dom();
  assert.ok($("editorTab").querySelector("img"));
  assert.ok($("editorTab").querySelector("[data-app-name]"));
  assert.equal($("settingsTab").textContent.trim(), "");
  assert.equal($("settingsTab").nextElementSibling, $("theme"));
  assert.equal($("shortcutsTab").parentElement, $("settingsToolbar"));
  assert.equal($("floatingButton").parentElement, $("settingsToolbar"));
  assert.equal($("updatesTab").parentElement, $("settingsToolbar"));
  assert.equal($("libraryTab").textContent.trim(), "文件");
  assert.equal($("newDoc").textContent, "＋");
  assert.equal($("deleteRound").textContent, "−");
});
test("update button saves, downloads, installs and closes only after restart was staged", async () => {
  const $ = dom();
  let status = "available",
    flushes = 0,
    closed = 0;
  const actions = [];
  window.addEventListener("prombee-close", () => closed++);
  const ui = mountUpdates({
    beforeInstall: async () => flushes++,
    request: async (url, options) => {
      const action = options && JSON.parse(options.body).action;
      if (action) {
        actions.push(action);
        status = {
          download: "ready",
          install: "installed",
          restart: "restart",
        }[action];
      }
      return {
        ok: true,
        json: async () => ({
          current: "0.9.4",
          latest: "0.9.5",
          status,
          canInstall: true,
          message: status,
          progress: 100,
        }),
      };
    },
  });
  await ui.show();
  assert.equal($("installUpdate").hidden, false);
  await $("installUpdate").onclick();
  assert.deepEqual(actions, ["download", "install", "restart"]);
  assert.equal(flushes, 3);
  assert.equal(closed, 1);
  assert.equal($("currentVersion").textContent, "0.9.4");
});
test("failed save prevents download and closing; offline check can be retried", async () => {
  const $ = dom();
  let calls = 0,
    closed = 0;
  window.addEventListener("prombee-close", () => closed++);
  mountUpdates({
    beforeInstall: async () => {
      throw Error("保存失败");
    },
    request: async () => {
      calls++;
      throw Error("离线");
    },
  });
  await $("installUpdate").onclick();
  assert.equal(calls, 0);
  assert.equal(closed, 0);
  assert.equal($("updateStatus").textContent, "保存失败");
  await $("checkUpdate").onclick();
  assert.equal($("updateStatus").textContent, "离线");
  assert.equal($("checkUpdate").disabled, false);
});
