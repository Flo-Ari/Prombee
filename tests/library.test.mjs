import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";
import { createLibraryUI } from "../web/library.js";
test("group management filters sets, creates inline, assigns metadata and opens TXT from the creation form", async () => {
  const dom = new JSDOM(
    await readFile(new URL("../web/index.html", import.meta.url), "utf8"),
    { url: "http://localhost/" },
  );
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  globalThis.innerWidth = 1200;
  globalThis.innerHeight = 900;
  const $ = (id) => document.getElementById(id),
    tick = () => new Promise((r) => setTimeout(r, 5));
  let registry = {
    active: "a",
    sets: [
      {
        id: "a",
        name: "默认",
        path: "/original/a.txt",
        groupId: "ungrouped",
        lastOpened: 1,
      },
      {
        id: "b",
        name: "迭代",
        path: "/elsewhere/b.txt",
        groupId: "g",
        lastOpened: 2,
      },
    ],
    groups: [
      { id: "ungrouped", name: "未分组", pinned: false },
      { id: "g", name: "工作", pinned: false },
    ],
  };
  const actions = [];
  globalThis.fetch = async (url, options) => {
    if (url.startsWith("/api/fs"))
      return {
        ok: true,
        json: async () => ({
          path: "/chosen",
          parent: "/",
          entries: [
            { kind: "text", name: "已有.txt", path: "/chosen/已有.txt" },
          ],
          shortcuts: [],
        }),
      };
    if (options) {
      const p = JSON.parse(options.body);
      actions.push(p);
      if (p.action === "assignGroup")
        registry.sets.find((s) => s.id === p.id).groupId = p.groupId;
      if (p.action === "createGroup")
        registry.groups.push({ id: "new", name: p.name, pinned: false });
      if (p.action === "openSet") registry.active = "b";
    }
    return { ok: true, json: async () => structuredClone(registry) };
  };
  let opened = 0;
  const ui = createLibraryUI({
    beforeAction: async () => {},
    onOpen: async () => {
      opened++;
    },
    onEmpty: () => {},
    getSetId: () => registry.active,
    notify: (message) => {
      throw Error(message);
    },
    showEditor: () => {},
  });
  await ui.refresh();
  assert.match($("setsList").textContent, /默认/);
  assert.doesNotMatch($("setsList").textContent, /迭代/);
  document.querySelector('.group-row[data-id="g"] .group-name').click();
  assert.match($("setsList").textContent, /迭代/);
  assert.doesNotMatch($("setsList").textContent, /默认/);
  document.querySelector(".assign-group").click();
  [...document.querySelectorAll(".library-popover button")]
    .find((b) => b.textContent === "未分组")
    .click();
  await tick();
  assert.equal(registry.sets[1].groupId, "ungrouped");
  assert.equal(registry.sets[1].path, "/elsewhere/b.txt");
  assert.doesNotMatch($("setsList").textContent, /迭代/);
  $("newGroup").click();
  assert.equal(document.activeElement.tagName, "INPUT");
  document.activeElement.value = "新组";
  document.activeElement.dispatchEvent(
    new dom.window.KeyboardEvent("keydown", { key: "Enter" }),
  );
  await tick();
  assert.ok(registry.groups.some((g) => g.name === "新组"));
  $("openFile").click();
  await tick();
  assert.equal($("folderPicker").hidden, false);
  assert.equal($("folderUse").hidden, true);
  document.querySelector(".folder-entry").click();
  await tick();
  assert.equal(opened, 1);
  assert.equal(actions.at(-1).action, "openSet");
  assert.equal(document.querySelector(".library-toolbar"), null);
  assert.equal($("trashSection"), null);
  assert.equal(
    document.querySelector('[data-library-mode="openProject"]'),
    null,
  );
  dom.window.close();
});
