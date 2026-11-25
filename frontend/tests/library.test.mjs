import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { readFile } from "./helpers/read-fixture.mjs";
import { createLibraryUI } from "../src/editor/library.ts";

test("temporary sets can be created from File or an empty recent selector without a picker", async () => {
  const dom = new JSDOM(
    await readFile(new URL("../dist/index.html", import.meta.url), "utf8"),
    { url: "http://localhost" },
  );
  globalThis.document = dom.window.document;
  globalThis.window = dom.window;
  const $ = (id) => document.getElementById(id);
  let registry = {
    active: null,
    sets: [],
    groups: [{ id: "ungrouped", name: "未分组" }],
    temporaryDirectory: "/chosen/app/data",
  };
  let selected = null,
    flushed = 0,
    opened = 0;
  const errors = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (url === "/api/library") {
      if (options) {
        const action = JSON.parse(options.body);
        assert.equal(action.action, "createTemporarySet");
        assert.equal(action.groupId, "ungrouped");
        const index = registry.sets.length + 1;
        const entry = {
          id: "temp" + index,
          name: "临时词集" + index,
          path: "/chosen/app/data/临时词集" + index + ".txt",
          groupId: "ungrouped",
          lastOpened: index,
        };
        registry = {
          ...registry,
          active: entry.id,
          sets: [...registry.sets, entry],
        };
      }
      return { ok: true, json: async () => registry };
    }
    assert.ok(url.startsWith("/api/state?"), url);
    return { ok: true, json: async () => ({ set: registry.sets.at(-1) }) };
  };
  try {
    const ui = createLibraryUI({
      beforeAction: async () => {
        flushed++;
      },
      onOpen: async (value) => {
        selected = value.set.id;
      },
      onEmpty: () => {},
      getSetId: () => selected,
      notify: (error) => errors.push(error),
      showEditor: () => {
        opened++;
      },
    });
    await ui.refresh();
    assert.equal($("recentSets").disabled, false);
    assert.ok(
      $("recentSets").querySelector('[data-action="createTemporarySet"]'),
    );
    assert.ok(
      $("createTemporarySet").title.includes(registry.temporaryDirectory),
    );
    $("recentSets").value = "__temporary__";
    await $("recentSets").onchange();
    assert.equal(selected, "temp1");
    await $("createTemporarySet").onclick();
    assert.equal(selected, "temp2");
    assert.equal($("recentSets").value, "temp2");
    assert.equal(flushed, 2);
    assert.equal(opened, 2);
    assert.deepEqual(errors, []);
    assert.equal(document.body.inert, false);
  } finally {
    globalThis.fetch = previous;
  }
});
