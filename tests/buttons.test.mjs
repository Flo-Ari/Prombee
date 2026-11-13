import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { mountButtonStyles } from "../web/buttons.js";
test("named styles preserve labels, native window controls and dynamically created state controls", async () => {
  const dom = new JSDOM(
    await readFile(new URL("../web/index.html", import.meta.url), "utf8"),
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const $ = (id) => document.getElementById(id);
  const disconnect = mountButtonStyles();
  assert.ok($("copy").classList.contains("复制按钮样式"));
  assert.ok($("editorTab").classList.contains("LOGO按钮样式"));
  assert.ok($("deleteEmpty").classList.contains("状态类样式"));
  assert.ok($("template").classList.contains("一般按钮样式"));
  assert.equal($("deleteEmpty").textContent.trim(), "排除空项");
  for (const id of ["minimizeWindow", "maximizeWindow", "closeWindow"])
    assert.ok($(id).classList.contains("无框按钮样式"));
  const eye = document.createElement("button");
  eye.className = "eye";
  eye.setAttribute("aria-pressed", "true");
  document.body.append(eye);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(eye.classList.contains("无框按钮样式"));
  assert.equal(eye.getAttribute("aria-pressed"),"true");
  disconnect();
});
