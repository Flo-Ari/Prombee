import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "./helpers/read-fixture.mjs";
import { waitFor } from "./helpers/wait-for.mjs";
import { mountUpdates } from "../src/editor/updates.ts";
const html = await readFile(
  new URL("../dist/index.html", import.meta.url),
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

test("background status decorates both controls, keeps shortcut hints, and never installs", async () => {
  const $ = dom();
  let value = {
    current: "0.9.19",
    latest: "0.9.20",
    status: "downloading",
    canInstall: true,
    updateAvailable: true,
    cached: false,
    progress: 30,
  };
  const actions = [];
  $("settingsTab").title = "设置（Ctrl+,）";
  const ui = mountUpdates({
    beforeInstall: async () => {
      throw Error("Background must not save or install");
    },
    request: async (_, options) => {
      if (options) actions.push(JSON.parse(options.body).action);
      return { ok: true, json: async () => value };
    },
  });
  try {
    ui.start();
    ui.start();
    await waitFor(() => $("settingsTab").classList.contains("has-update"));
    for (const id of ["settingsTab", "updatesTab"]) {
      assert.ok($(id).classList.contains("has-update"));
      assert.match($(id).title, /可更新至 0.9.20/);
      assert.match($(id).title, /手动确认/);
    }
    assert.match($("settingsTab").title, /Ctrl/);
    value = { ...value, status: "ready", cached: true, progress: 100 };
    await ui.show();
    assert.match($("updatesTab").title, /已缓存/);
    assert.ok($("settingsTab").classList.contains("has-update"));
    assert.deepEqual(actions, []);
    value = { ...value, status: "installed", updateAvailable: false };
    await ui.show();
    for (const id of ["settingsTab", "updatesTab"]) {
      assert.equal($(id).classList.contains("has-update"), false);
      assert.doesNotMatch($(id).title, /可更新/);
    }
    assert.match($("settingsTab").title, /Ctrl/);
    assert.deepEqual(actions, []);
  } finally {
    ui.stop();
  }
});

test("returning online requests only background startup, never an installation", async () => {
  const $ = dom();
  const actions = [];
  const ui = mountUpdates({
    beforeInstall: async () => {
      throw Error("No install consent");
    },
    request: async (_, options) => {
      if (options) actions.push(JSON.parse(options.body).action);
      return {
        ok: true,
        json: async () => ({
          current: "0.9.19",
          status: "current",
          updateAvailable: false,
        }),
      };
    },
  });
  try {
    ui.start();
    await waitFor(() => $("currentVersion").textContent === "0.9.19");
    window.dispatchEvent(new window.Event("online"));
    await waitFor(() => actions.length > 0);
    assert.deepEqual(actions, ["startup"]);
    assert.equal($("settingsTab").classList.contains("has-update"), false);
  } finally {
    ui.stop();
  }
});

test("valid offline cache retains notifications until the user confirms installation", async () => {
  const $ = dom();
  const actions = [];
  let status = "ready";
  const ui = mountUpdates({
    beforeInstall: async () => {},
    request: async (_, options) => {
      if (options) {
        const action = JSON.parse(options.body).action;
        actions.push(action);
        status = action === "install" ? "restart" : status;
      }
      return {
        ok: true,
        json: async () => ({
          current: "0.9.19",
          latest: "0.9.20",
          status,
          cached: true,
          canInstall: true,
          updateAvailable: status === "ready",
          lastError: "offline",
          message: "暂时无法检查更新，已缓存的版本可安装",
        }),
      };
    },
  });
  try {
    await ui.show();
    assert.ok($("updatesTab").classList.contains("has-update"));
    assert.equal($("installUpdate").hidden, false);
    assert.deepEqual(actions, []);
    await $("installUpdate").onclick();
    assert.deepEqual(actions, ["install"]);
    assert.equal($("settingsTab").classList.contains("has-update"), false);
  } finally {
    ui.stop();
  }
});
