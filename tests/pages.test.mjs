import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

// Exercise real app handlers against an isolated workspace, never the user's data.
const html = await readFile(
  new URL("../web/index.html", import.meta.url),
  "utf8",
);
const dom = new JSDOM(html, { url: "http://127.0.0.1/" });
for (const key of ["window", "document", "localStorage", "navigator"])
  Object.defineProperty(globalThis, key, {
    value: dom.window[key],
    configurable: true,
  });
globalThis.setInterval = () => 0;
globalThis.requestAnimationFrame = (callback) => callback();
dom.window.requestAnimationFrame = (callback) => setTimeout(callback, 0);
dom.window.cancelAnimationFrame = clearTimeout;
dom.window.HTMLElement.prototype.scrollIntoView = () => {};
const node = (id, kind, level, html) => ({ id, kind, level, html });
const source = {
  current: "r2",
  dark: false,
  font: "sans-serif",
  size: 14,
  documents: [
    {
      id: "r2",
      name: "第2轮",
      nodes: [
        node("a", "heading", 1, "目标"),
        node("b", "item", 1, "新正文"),
        node("c", "heading", 2, "格式"),
      ],
    },
    {
      id: "r1",
      name: "第1轮",
      nodes: [node("d", "heading", 1, "约束"), node("e", "item", 1, "旧正文")],
    },
  ],
};
let saved;
let savedShortcuts = {};
globalThis.fetch = async (url, options) =>
  url === "/api/shortcuts"
    ? {
        ok: true,
        json: async () => {
          if (options) savedShortcuts = JSON.parse(options.body).bindings;
          return { bindings: savedShortcuts };
        },
      }
    : options
      ? ((saved = JSON.parse(options.body)),
        { ok: true, json: async () => ({ revision: 1 }) })
      : {
          ok: true,
          json: async () => ({ state: structuredClone(source), revision: 0 }),
        };
await import("../web/app.js");
const $ = (id) => document.getElementById(id);
const { hierarchyNodes, toMarkdown } = await import("../web/core.js");
const { renderComparison } = await import("../web/review.js");

test("template cloning keeps fresh heading IDs and empty bodies, with no exclusions", () => {
  const original = [...source.documents[0].nodes];
  original[0] = { ...original[0], excluded: true };
  const a = hierarchyNodes(original),
    b = hierarchyNodes(a);
  assert.deepEqual(
    a.map((n) => [n.kind, n.level, n.html]),
    [
      ["heading", 1, "目标"],
      ["item", 1, ""],
      ["heading", 2, "格式"],
      ["item", 1, ""],
    ],
  );
  assert.ok(a.every((n) => !n.excluded));
  assert.ok(a.every((n) => !b.some((other) => other.id === n.id)));
});

test("tabs, historical template import, new round, raw preview and undo work together", async () => {
  assert.equal(document.querySelectorAll("dialog").length, 0);
  $("template").click();
  assert.equal($("hierarchyControls").hidden, false);
  $("hierarchyRound").value = "r1";
  $("copyHierarchy").click();
  assert.equal(document.querySelector(".content").textContent, "约束");
  $("newDoc").click();
  assert.equal($("documents").selectedOptions[0].textContent, "第3轮");
  assert.equal($("editorPanel").hidden, false);
  assert.deepEqual(
    [...document.querySelectorAll(".content")].map((n) => n.textContent),
    ["约束", ""],
  );
  $("preview").click();
  assert.equal($("editorToolbar").hidden, true);
  assert.equal($("previewContent").querySelector("h1").textContent, "约束");
  $("previewMode").value = "raw";
  $("previewMode").dispatchEvent(new window.Event("change"));
  assert.equal($("rawMarkdown").textContent, "# 约束\n");
  assert.equal($("rawMarkdown").hidden, false);
  $("compare").click();
  $("compareLeft").value = "r1";
  $("compareRight").value = "r2";
  $("compareRight").dispatchEvent(new window.Event("change"));
  assert.equal($("leftTitle").textContent, "第1轮");
  assert.equal($("rightTitle").textContent, "第2轮");
  assert.ok($("diffRows").querySelector(".diff-remove"));
  assert.ok($("diffRows").querySelector(".diff-add"));
  $("template").click();
  $("undo").click();
  assert.equal(document.querySelector(".content").textContent, "目标");
  $("preview").click();
  $("template").click();
  $("redo").click();
  assert.equal(document.querySelector(".content").textContent, "约束");
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(saved.state.template.nodes[0].html, "约束");
  assert.equal(
    toMarkdown(saved.state.documents.find((d) => d.name === "第3轮").nodes),
    "# 约束\n",
  );
  assert.equal(source.documents[0].nodes[1].html, "新正文");
});

test("common prompts have independent editing, scoped copy, full copy and matching preview", async () => {
  const copied = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text) => copied.push(text) },
  });
  $("commonTab").click();
  assert.equal($("copyAll").hidden, false);
  assert.equal($("paper").getAttribute("aria-label"), "常用提示词编辑区");
  const title = document.querySelector(".content");
  title.textContent = "## 常用约束";
  title.dispatchEvent(new window.Event("input"));
  const body = document.querySelectorAll(".content")[1];
  body.textContent = "- 保留全部内容";
  body.dispatchEvent(new window.Event("input"));
  document.querySelector(".copy-branch").click();
  await Promise.resolve();
  assert.equal(copied.at(-1), "## 常用约束\n\n- 保留全部内容\n");
  $("copyAll").click();
  await Promise.resolve();
  assert.equal(copied.at(-1), "## 常用约束\n\n- 保留全部内容\n");
  $("preview").click();
  assert.equal($("rawMarkdown").textContent, copied.at(-1));
  $("copy").click();
  await Promise.resolve();
  assert.equal(copied.at(-1), $("rawMarkdown").textContent);
  $("editorTab").click();
  assert.equal(document.querySelector(".content").textContent, "约束");
  assert.equal(document.querySelector(".copy-branch"), null);
  assert.equal($("copyAll").hidden, true);
  $("commonTab").click();
  assert.equal(document.querySelector(".content").textContent, "常用约束");
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(saved.state.common.nodes[0].html, "常用约束");
});

test("split diff aligns left/right rows and reconstructs exact original texts", () => {
  const target = document.createElement("div");
  const left = "# A\n旧行\n共同",
    right = "# A\n新行\n共同\n尾行";
  renderComparison(left, right, target);
  for (const row of target.children) assert.equal(row.children.length, 2);
  for (const [index, text] of [
    [0, left],
    [1, right],
  ]) {
    const lines = [...target.children]
      .map((r) => r.children[index])
      .filter((c) => !c.classList.contains("diff-blank"));
    assert.equal(
      lines.map((c) => c.querySelector(".diff-text").textContent).join("\n"),
      text,
    );
    assert.deepEqual(
      lines.map((c) => c.querySelector(".line-number").textContent),
      lines.map((_, i) => String(i + 1)),
    );
  }
});

test("batch selection cycles, exclusion and subtree deletion can be undone", () => {
  $("editorTab").click();
  $("multiSelect").click();
  assert.equal($("multiSelect").textContent, "全选");
  assert.equal(
    document.querySelectorAll(".row-leading input[type=checkbox]").length,
    2,
  );
  $("multiSelect").click();
  assert.equal($("multiSelect").textContent, "取消全选");
  $("batchExclude").click();
  assert.equal(document.querySelectorAll(".row.excluded").length, 2);
  $("undo").click();
  assert.equal(document.querySelectorAll(".row.excluded").length, 0);
  $("batchDelete").click();
  assert.equal(document.querySelectorAll(".row").length, 0);
  assert.ok(document.querySelector(".empty-document button"));
  $("undo").click();
  assert.equal(document.querySelectorAll(".row").length, 2);
  $("multiSelect").click();
  assert.equal($("multiSelect").textContent, "取消全选");
  $("multiSelect").click();
  assert.equal($("multiSelect").textContent, "多选");
});

test("folding changes visibility only; contextual add has item first and keeps ancestor levels enabled", () => {
  $("editorTab").click();
  const fold = document.querySelector(".fold");
  fold.click();
  assert.equal(document.querySelectorAll(".row")[1].hidden, true);
  assert.equal(
    document.querySelector(".fold").getAttribute("aria-expanded"),
    "false",
  );
  document.querySelector(".fold").click();
  document.querySelectorAll(".add-heading")[1].click();
  assert.equal($("headingMenu").querySelector("button").id, "menuAddItem");
  const current = $("headingMenu").querySelector(".current-level");
  assert.equal(current.dataset.level, "1");
  assert.equal(current.disabled, false);
  $("menuAddItem").click();
  assert.equal(document.querySelectorAll(".row").length, 3);
  assert.equal($("headingMenu").hidden, true);
  assert.equal(document.querySelector("#editorToolbar #addItem"), null);
  assert.equal($("editorToolbar").querySelector("button").id, "multiSelect");
  $("preview").click();
  assert.equal($("previewToolbar").querySelector("select"), null);
  $("previewRaw").click();
  assert.equal($("rawMarkdown").hidden, false);
  $("previewRendered").click();
  assert.equal($("previewContent").hidden, false);
});

test("new prompt set requires a selected directory and recent selector follows the loaded set", async () => {
  await new Promise((resolve) => setTimeout(resolve, 350));
  let registry = {
    active: "old",
    sets: [
      { id: "old", name: "原词集", path: "/chosen/原词集.txt", lastOpened: 1 },
    ],
    projects: [],
    trash: [],
  };
  globalThis.fetch = async (url, options) => {
    if (url === "/api/library" && options) {
      const data = JSON.parse(options.body);
      if (data.action === "createSet") {
        assert.equal(data.folder, "/chosen");
        registry = {
          ...registry,
          active: "new",
          sets: [
            ...registry.sets,
            {
              id: "new",
              name: data.name,
              path: "/chosen/" + data.name + ".txt",
              lastOpened: 2,
            },
          ],
        };
      }
      return { ok: true, json: async () => registry };
    }
    if (url === "/api/library") return { ok: true, json: async () => registry };
    if (url.startsWith("/api/fs"))
      return {
        ok: true,
        json: async () => ({
          path: "/chosen",
          parent: "/",
          entries: [],
          shortcuts: [],
        }),
      };
    if (url.startsWith("/api/state?"))
      return {
        ok: true,
        json: async () => ({
          state: structuredClone(source),
          revision: 0,
          fingerprint: "new-file",
          set: registry.sets.find((s) => s.id === registry.active),
        }),
      };
    if (options)
      return {
        ok: true,
        json: async () => ({ revision: 5, fingerprint: "saved" }),
      };
    throw Error("Unexpected URL " + url);
  };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 10));
  $("libraryTab").click();
  await settle();
  $("libraryName").value = "新词集";
  assert.equal($("libraryCreate").disabled, true);
  $("chooseLocation").click();
  await settle();
  $("folderUse").click();
  assert.equal($("libraryCreate").disabled, false);
  $("libraryCreate").click();
  await settle();
  assert.equal($("recentSets").value, "new");
  assert.equal($("editorTab").getAttribute("aria-selected"), "true");
  assert.equal(document.body.inert, false);
});

test("round deletion is reversible, numbering follows remaining rounds, and empty sets restart at round one", () => {
  const roundName = () => $("documents").selectedOptions[0]?.textContent;
  assert.equal(roundName(), "第2轮");
  const content = document.querySelector(".content").textContent;
  $("deleteRound").click();
  assert.equal(roundName(), "第1轮");
  $("undo").click();
  assert.equal(roundName(), "第2轮");
  assert.equal(document.querySelector(".content").textContent, content);
  $("redo").click();
  assert.equal(roundName(), "第1轮");
  $("newDoc").click();
  assert.equal(roundName(), "第2轮");
  $("deleteRound").click();
  $("deleteRound").click();
  assert.equal($("documents").options.length, 0);
  assert.equal(
    document.querySelector(".empty-document button").textContent,
    "＋ 新建一轮",
  );
  $("undo").click();
  assert.equal(roundName(), "第1轮");
  $("undo").click();
  assert.equal(roundName(), "第2轮");
  $("redo").click();
  $("redo").click();
  assert.equal($("documents").options.length, 0);
  $("template").click();
  assert.equal($("copyHierarchy").disabled, true);
  $("editorTab").click();
  $("newDoc").click();
  assert.equal(roundName(), "第1轮");
  const buttons = [...$("editorToolbar").querySelectorAll("button")];
  assert.deepEqual(
    buttons.slice(0, 2).map((b) => b.id),
    ["multiSelect", "deleteEmpty"],
  );
  assert.equal(buttons.at(-1).id, "deleteRound");
  assert.equal(document.querySelector("#menuContext,.menu-caption"), null);
});

test("empty Delete and Backspace remove only the current node, preserve children and undo", () => {
  $("template").click();
  let fields = [...document.querySelectorAll(".content")];
  const field = fields[0];
  field.innerHTML = "<br>";
  field.dispatchEvent(new window.Event("input", { bubbles: true }));
  const before = fields.length;
  field.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key: "Delete",
      bubbles: true,
      cancelable: true,
      isComposing: true,
    }),
  );
  assert.equal(document.querySelectorAll(".content").length, before);
  field.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key: "Delete",
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(document.querySelectorAll(".content").length, before - 1);
  $("undo").click();
  assert.equal(document.querySelectorAll(".content").length, before);
  const restored = document.querySelector(".content");
  restored.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key: "Backspace",
      bubbles: true,
      cancelable: true,
    }),
  );
  assert.equal(document.querySelectorAll(".content").length, before - 1);
  $("undo").click();
});

const key = (key, options = {}, target = document.activeElement) => {
  const event = new window.KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  target.dispatchEvent(event);
  return event;
};
test("Ctrl+N then level and Enter adds a heading; plain Enter adds an item; Escape cancels", () => {
  $("editorTab").click();
  $("newDoc").click();
  let fields = [...document.querySelectorAll(".content")];
  fields[0].focus();
  const before = fields.length;
  key("n", { ctrlKey: true, isComposing: true });
  assert.equal($("headingMenu").hidden, true);
  key("n", { ctrlKey: true });
  assert.equal($("headingMenu").hidden, false);
  key("3", { ctrlKey: true });
  assert.ok(
    document
      .querySelector('[data-level="3"]')
      .classList.contains("keyboard-choice"),
  );
  key("Enter");
  assert.equal(
    document.activeElement.closest(".row").classList.contains("h3"),
    true,
  );
  const count = document.querySelectorAll(".content").length;
  assert.ok(count > before);
  key("n", { ctrlKey: true });
  key("Enter");
  assert.equal(
    document.activeElement.closest(".row").classList.contains("item"),
    true,
  );
  assert.equal(document.querySelectorAll(".content").length, count + 1);
  key("n", { ctrlKey: true });
  key("6");
  key("Escape");
  assert.equal(document.querySelectorAll(".content").length, count + 1);
  assert.equal($("headingMenu").hidden, true);
});
test("up and down switch visible entries, preserve text and skip folded children", () => {
  $("editorTab").click();
  const fields = [...document.querySelectorAll(".content")];
  fields.at(-1).focus();
  key("n", { ctrlKey: true });
  key("1");
  key("Enter");
  const firstId = document.activeElement.dataset.id;
  key("n", { ctrlKey: true });
  key("Enter");
  key("n", { ctrlKey: true });
  key("1");
  key("Enter");
  const secondId = document.activeElement.dataset.id;
  document.querySelector(`.row[data-id="${firstId}"] .fold`).click();
  const visible = [
    ...document.querySelectorAll("#paper .row:not([hidden]) .content"),
  ];
  visible[0].focus();
  assert.equal(key("ArrowUp").defaultPrevented, true);
  assert.equal(document.activeElement, visible[0]);
  const first = visible.find((field) => field.dataset.id === firstId),
    second = visible.find((field) => field.dataset.id === secondId);
  first.focus();
  const original = first.innerHTML;
  key("ArrowDown");
  assert.equal(document.activeElement, second);
  key("ArrowUp");
  assert.equal(document.activeElement, first);
  assert.equal(first.innerHTML, original);
  assert.equal(key("ArrowDown", { shiftKey: true }).defaultPrevented, false);
});
test("shortcut tab records, validates, saves and activates edited bindings without triggering editor commands", async () => {
  $("shortcutsTab").click();
  assert.equal($("shortcutsPanel").hidden, false);
  assert.equal($("editorToolbar").hidden, true);
  assert.equal($("commonTab").nextElementSibling, $("shortcutsTab"));
  const input = document.querySelector('[data-action="insert"]');
  input.focus();
  key("k", { ctrlKey: true });
  assert.equal(input.dataset.binding, "Ctrl+K");
  assert.equal($("headingMenu").hidden, true);
  await $("saveShortcuts").onclick();
  assert.equal(savedShortcuts.insert, "Ctrl+K");
  $("editorTab").click();
  document.querySelector(".content").focus();
  key("k", { ctrlKey: true });
  assert.equal($("headingMenu").hidden, false);
  key("Escape");
  assert.equal(key("n", { ctrlKey: true }).defaultPrevented, false);
  $("shortcutsTab").click();
  const bold = document.querySelector('[data-action="bold"]');
  bold.focus();
  key("k", { ctrlKey: true });
  assert.equal($("saveShortcuts").disabled, true);
  assert.match($("shortcutStatus").textContent, /冲突/);
  key("Escape");
  $("resetShortcuts").click();
  assert.equal($("saveShortcuts").disabled, false);
  // Restore and save defaults before returning to normal editing.
  await $("saveShortcuts").onclick();
  $("editorTab").click();
  document.querySelector(".content").focus();
  $("toast").classList.remove("show");
  const row = document.activeElement.closest(".row");
  row.querySelector(".remove").click();
  assert.equal($("toast").classList.contains("show"), false);
  $("undo").click();
});
