import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountDropdowns } from "../web/dropdowns.js";
test("dropdowns keep native values and change events, keyboard navigation and programmatic display sync", () => {
  const dom = new JSDOM(
    '<select id="font" aria-label="字体"><option value="a">甲</option><option value="b">乙</option></select>',
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const ui = mountDropdowns(),
    select = document.querySelector("select"),
    trigger = document.querySelector(".dropdown-trigger");
  let changed = 0;
  select.onchange = () => changed++;
  trigger.click();
  assert.equal(document.querySelectorAll("[role=option]").length, 2);
  trigger.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
  );
  trigger.dispatchEvent(
    new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
  );
  assert.equal(select.value, "b");
  assert.equal(changed, 1);
  assert.equal(document.querySelector(".dropdown-popup"), null);
  select.value = "a";
  ui.sync();
  assert.equal(trigger.textContent, "甲");
  select.disabled = true;
  ui.sync();
  assert.equal(trigger.disabled, true);
});
