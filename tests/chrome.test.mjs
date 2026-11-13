import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

test("unified window-header preserves control order and drags only blank space", async () => {
  const html = await readFile(new URL("../web/index.html", import.meta.url), "utf8");
  const dom = new JSDOM(html, { url: "http://localhost/?desktop=gtk&lang=zh" });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.location = dom.window.location;
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  const messages = [];
  window.webkit = { messageHandlers: { mascot: { postMessage: (raw) => messages.push(JSON.parse(raw)) } } };
  await import("../web/desktop-chrome.js");
  assert.equal(messages.shift().action,"windowState");
  const $ = (id) => document.getElementById(id);
  const header = document.querySelector(".window-header");
  assert.equal(document.querySelectorAll(".window-header").length, 1);
  assert.equal(document.querySelector(".window-drag,.pywebview-drag-region"), null);
  assert.equal($("editorTab").nextElementSibling, $("copy"));
  assert.equal($("copy").nextElementSibling, $("template"));
  assert.ok(!$("commonTab").nextElementSibling.classList.contains("separator"));
  assert.equal($("settingsTab").parentElement, $("minimizeWindow").parentElement);
  assert.equal($("theme").nextElementSibling,$("minimizeWindow"));
  assert.equal($("settingsTab").nextElementSibling, $("theme"));
  assert.equal($("minimizeWindow").parentElement.className, "window-controls");
  for (const id of ["copy", "documents", "settingsTab", "theme"]) {
    $(id).dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, button: 0 }));
  }
  assert.equal(messages.length, 0);
  header.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true, button: 0 }));
  assert.equal(messages.pop().action, "windowDrag");
  for (const [id, action] of [["minimizeWindow", "collapse"], ["maximizeWindow", "maximize"], ["closeWindow", "close"]]) {
    $(id).click();
    assert.equal(messages.pop().action, action);
  }
  window.dispatchEvent(new window.CustomEvent('prombee-window-state',{detail:{maximized:true}}));assert.equal($('maximizeWindow').dataset.maximized,'true');assert.equal($('maximizeWindow').getAttribute('aria-label'),'还原窗口');
  window.dispatchEvent(new window.CustomEvent('prombee-window-state',{detail:{maximized:false}}));assert.equal($('maximizeWindow').dataset.maximized,'false');
  header.dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, button: 0 }));
  assert.equal(messages.pop().action, "maximize");
});
