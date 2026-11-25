import test from "node:test";
import assert from "node:assert/strict";
import { editorSession, restoreSession } from "../src/editor/session.ts";
test("editor sessions round-trip scroll, caret and selection per round and page", () => {
  const views = new Map([
    [
      "editor:round-two",
      {
        top: 320,
        active: "node2",
        caret: { start: [0], startOffset: 3, end: [0], endOffset: 3 },
        selected: ["node2"],
        multi: true,
      },
    ],
    ["template:t", { top: 50, active: null, selected: [] }],
  ]);
  const stored = JSON.parse(
    JSON.stringify(editorSession(null, "template", views)),
  );
  const reopened = restoreSession(stored);
  assert.equal(reopened.page, "template");
  assert.deepEqual(reopened.views, views);
  assert.equal(editorSession(stored, "settings", views).page, "template");
});
test("absent or malformed session metadata cannot block opening an old TXT", () => {
  assert.equal(restoreSession(null).page, "editor");
  const restored = restoreSession({
    page: "invalid",
    views: {
      broken: null,
      invalid: { top: -1, active: "a" },
      valid: { top: 0, active: "a" },
    },
  });
  assert.equal(restored.page, "editor");
  assert.deepEqual([...restored.views.keys()], ["valid"]);
  assert.deepEqual(restored.views.get("valid").selected, []);
});
