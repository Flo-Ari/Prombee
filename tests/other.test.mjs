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
  await $("copyJumpTarget").onchange();
  await ui.afterCopy();
  assert.equal(jumps, 1);
  assert.equal(target.name, "Browser — page");
  $("copyJumpTarget").value = "url";
  $("copyJumpTarget").dispatchEvent(new window.Event("change"));
  assert.equal($("copyJumpUrlRow").hidden, false);
  $("copyJumpUrl").value = "https://example.com/page";
  await $("copyJumpTarget").onchange();
  assert.equal(target.url, "https://example.com/page");
  $("copyJumpEnabled").checked = false;
  await $("copyJumpTarget").onchange();
  await ui.afterCopy();
  assert.equal(jumps, 1);
});

test("Markdown preference auto-saves independently and the manual save button is absent", async () => {
  const $ = setup();
  let recognized = true,
    changed;
  const ui = mountOtherSettings({
    onMarkdownChange: (value) => (changed = value),
    request: async (url, options) => {
      if (options) {
        const p = JSON.parse(options.body);
        assert.equal(p.action, "markdown");
        recognized = p.recognizeMarkdown;
      }
      return {
        ok: true,
        json: async () => ({
          enabled: false,
          target: null,
          recognizeMarkdown: recognized,
        }),
      };
    },
  });
  await ui.ready;
  assert.equal($("saveOtherSettings"), null);
  $("recognizeMarkdown").checked = false;
  await $("recognizeMarkdown").onchange();
  assert.equal(recognized, false);
  assert.equal(changed, false);
  assert.equal(ui.recognizeMarkdown(), false);
});
