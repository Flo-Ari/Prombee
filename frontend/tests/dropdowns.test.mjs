import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountDropdowns } from "../src/editor/dropdowns.ts";
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

test("round and set wheels select, clamp, respect disabled state and keep recent ordering", () => {
  const dom = new JSDOM(
    '<select id="documents"><option>a</option><option disabled>b</option><option>c</option></select><select id="recentSets"><option>a</option><option>b</option><option>c</option></select>',
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  mountDropdowns();
  const wheel = (id, dy = 100) =>
    document
      .querySelector(`[data-select-id="${id}"] .dropdown-trigger`)
      .dispatchEvent(
        new window.WheelEvent("wheel", {
          deltaY: dy,
          bubbles: true,
          cancelable: true,
        }),
      );
  const rounds = document.getElementById("documents"),
    sets = document.getElementById("recentSets");
  let changes = 0;
  rounds.onchange = () => changes++;
  wheel("documents", 5);
  assert.equal(rounds.value, "a");
  wheel("documents");
  assert.equal(rounds.value, "c");
  assert.equal(changes, 1);
  wheel("documents");
  assert.equal(changes, 1);
  wheel("documents", -100);
  assert.equal(rounds.value, "a");
  rounds.disabled = true;
  wheel("documents");
  assert.equal(rounds.value, "a");
  wheel("recentSets");
  assert.equal(sets.value, "b");
  sets.prepend(sets.selectedOptions[0]);
  sets.value = "b";
  wheel("recentSets");
  assert.equal(sets.value, "c");
  document.body.inert = true;
  wheel("recentSets", -100);
  assert.equal(sets.value, "c");
  dom.window.close();
});

test("wheel switching never invokes the create-temporary-set option", () => {
  const dom = new JSDOM(
    '<select id="recentSets"><option value="one">One</option><optgroup label="New"><option value="__temporary__" data-action="createTemporarySet">Temporary</option></optgroup></select>',
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  mountDropdowns();
  document
    .querySelector(".dropdown-trigger")
    .dispatchEvent(
      new window.WheelEvent("wheel", {
        deltaY: 100,
        bubbles: true,
        cancelable: true,
      }),
    );
  assert.equal(document.querySelector("select").value, "one");
});
