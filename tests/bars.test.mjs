import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "node:fs/promises";
import { mountBars } from "../web/bars.js";
test("fixed sidebar preserves the editor and has no drag or docking controls", async () => {
  const dom = new JSDOM(
    await readFile(new URL("../web/index.html", import.meta.url), "utf8"),
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const main = document.querySelector("main");
  main.scrollTop = 123;
  const ui = mountBars();
  ui.show("editor");
  assert.equal(document.querySelector("main"), main);
  assert.equal(main.scrollTop, 123);
  assert.equal(document.querySelector(".bar-grip,.dock-target"), null);
  for (const toolbar of document.querySelectorAll(".toolbar"))
    toolbar.hidden = true;
  ui.show("library");
  assert.equal(document.querySelector(".tool-rail").hidden, true);
  document.querySelector("#settingsToolbar").hidden = false;
  ui.show("other");
  assert.equal(document.querySelector(".tool-rail").hidden, false);
});
