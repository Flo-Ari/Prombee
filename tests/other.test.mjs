import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { mountOtherSettings } from "../web/other.js";
const html = await readFile(
  new URL("../web/index.html", import.meta.url),
  "utf8",
);
function setup() {
  const dom = new JSDOM(html, { url: "http://localhost" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  return (id) => document.getElementById(id);
}
test("other settings enumerate targets, save on this device and jump only when enabled", async () => {
  const $ = setup();
  let enabled = false,
    target = null,
    jumps = 0;
  const windows = [
    {
      kind: "window",
      id: "win:1",
      pid: 10,
      name: "Browser — page",
      identity: "chrome.exe",
    },
  ];
  const applications = [
    { kind: "application", id: "app:1", name: "Editor", identity: "editor" },
  ];
  const ui = mountOtherSettings({
    request: async (url, options) => {
      const payload = options && JSON.parse(options.body);
      if (payload?.action === "save") {
        enabled = payload.enabled;
        target = payload.target;
      }
      if (payload?.action === "jump") jumps++;
      return {
        ok: true,
        json: async () => ({ enabled, target, windows, applications }),
      };
    },
  });
  await ui.ready;
  await ui.afterCopy();
  assert.equal(jumps, 0);
  await ui.show();
  assert.equal($("copyJumpTarget").querySelectorAll("optgroup").length, 2);
  $("copyJumpEnabled").checked = true;
  $("copyJumpTarget").value = "win:1";
  await $("saveOtherSettings").onclick();
  await ui.afterCopy();
  assert.equal(jumps, 1);
  assert.equal(target.name, "Browser — page");
  $("copyJumpTarget").value = "url";
  $("copyJumpTarget").dispatchEvent(new window.Event("change"));
  assert.equal($("copyJumpUrlRow").hidden, false);
  $("copyJumpUrl").value = "https://example.com/page";
  await $("saveOtherSettings").onclick();
  assert.equal(target.url, "https://example.com/page");
  $("copyJumpEnabled").checked = false;
  await $("saveOtherSettings").onclick();
  await ui.afterCopy();
  assert.equal(jumps, 1);
});
