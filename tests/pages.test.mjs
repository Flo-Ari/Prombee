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
document.queryCommandState = () => false;
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
  $("deleteEmpty").click();
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
  assert.equal($("previewContent").querySelector("h1"), null);
  $("previewMode").value = "raw";
  $("previewMode").dispatchEvent(new window.Event("change"));
  assert.equal($("rawMarkdown").textContent, "");
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
    "",
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
  if(document.body.dataset.page!=="editor")$("editorTab").click();
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
  if(document.body.dataset.page!=="editor")$("editorTab").click();
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
  $("batchExclude").click();
  assert.equal(document.querySelectorAll(".row.excluded").length, 0);
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
  if(document.body.dataset.page!=="editor")$("editorTab").click();
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
  assert.equal(document.querySelectorAll(".row").length, 2);
  assert.equal($("headingMenu").hidden, true);
  assert.equal(document.querySelector("#editorToolbar #addItem"), null);
  assert.equal($("editorToolbar").querySelector("button").id, "voiceInput");
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
    groups: [{ id: "ungrouped", name: "未分组", pinned: false }],
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
    if (url === "/api/picker")
      return { ok: true, json: async () => ({ path: "/chosen" }) };
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
  if(document.body.dataset.page!=="editor")$("editorTab").click();
  $("newDoc").click();
  assert.equal(roundName(), "第1轮");
  const buttons = [...$("editorToolbar").querySelectorAll("button")];
  assert.deepEqual(
    buttons.slice(0, 3).map((b) => b.id),
    ["voiceInput", "multiSelect", "deleteEmpty"],
  );
  assert.equal($("deleteRound").previousElementSibling, $("documents").parentElement);
  assert.equal($("deleteRound").parentElement.className, "window-header");
  assert.equal($("deleteRound").textContent, "−");
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
test("Ctrl+N digits immediately create a heading; arrows select; Enter adds body; Escape cancels", () => {
  if(document.body.dataset.page!=="editor")$("editorTab").click();
  $("newDoc").click();
  let fields = [...document.querySelectorAll(".content")];
  fields[0].focus();
  const before = fields.length;
  key("n", { ctrlKey: true, isComposing: true });
  assert.equal($("headingMenu").hidden, true);
  key("n", { ctrlKey: true });
  assert.equal($("headingMenu").hidden, false);
  key("3", { ctrlKey: true });
  assert.equal($("headingMenu").hidden, true);
  assert.equal(
    document.activeElement.closest(".row").classList.contains("h3"),
    true,
  );
  const count = document.querySelectorAll(".content").length;
  assert.ok(count >= before);
  key("n", { ctrlKey: true });
  key("Enter");
  assert.equal(
    document.activeElement.closest(".row").classList.contains("item"),
    true,
  );
  assert.equal(document.querySelectorAll(".content").length, count);
  key("n", { ctrlKey: true });
  key("ArrowDown");
  key("Escape");
  assert.equal(document.querySelectorAll(".content").length, count);
  assert.equal($("headingMenu").hidden, true);
});
test("up and down switch visible entries, preserve text and skip folded children", () => {
  if(document.body.dataset.page!=="editor")$("editorTab").click();
  const fields = [...document.querySelectorAll(".content")];
  fields.at(-1).focus();
  key("n", { ctrlKey: true });
  key("1");
  const firstId = document.activeElement.dataset.id;
  document.activeElement.textContent = "First";
  document.activeElement.dispatchEvent(new window.Event("input"));
  key("n", { ctrlKey: true });
  key("Enter");
  key("n", { ctrlKey: true });
  key("1");
  const secondId = document.activeElement.dataset.id;
  document.querySelector(`.row[data-id="${firstId}"] .fold`).click();
  const visible = [
    ...document.querySelectorAll("#paper .row:not([hidden]) .content"),
  ];
  visible[0].focus();
  assert.equal(key("ArrowUp").defaultPrevented, false);
  assert.equal(document.activeElement, visible[0]);
  const first = visible.find((field) => field.dataset.id === firstId),
    second = visible.find((field) => field.dataset.id === secondId);
  first.focus();
  const caret = document.createRange(); caret.selectNodeContents(first); caret.collapse(false); window.getSelection().removeAllRanges(); window.getSelection().addRange(caret);
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
  assert.equal($("settingsTab").nextElementSibling, $("theme"));
  const input = document.querySelector('[data-action="insert"]');
  input.focus();
  key("k", { ctrlKey: true });
  assert.equal(input.dataset.binding, "Ctrl+K");
  assert.equal($("headingMenu").hidden, true);
  await $("saveShortcuts").onclick();
  assert.equal(savedShortcuts.insert, "Ctrl+K");
  if(document.body.dataset.page!=="editor")$("editorTab").click();
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
  if(document.body.dataset.page!=="editor")$("editorTab").click();
  document.querySelector(".content").focus();
  $("toast").classList.remove("show");
  const row = document.activeElement.closest(".row");
  row.querySelector(".remove").click();
  assert.equal($("toast").classList.contains("show"), false);
  $("undo").click();
});

test("shortcut sections follow component positions, have one redo, and tooltips follow saved keys", async () => {
  $("shortcutsTab").click();
  const sections = [...document.querySelectorAll(".shortcut-section")];
  assert.deepEqual(
    sections.map((section) => section.querySelector("h3").textContent),
    ["编辑区", "窗口栏", "顶部栏", "编辑工具栏", "状态栏"],
  );
  assert.equal(document.querySelectorAll('[data-action="redo"]').length, 1);
  assert.equal(document.querySelector('[data-action="redoAlt"]'), null);
  const editor = sections.find(
    (section) => section.dataset.section === "editor",
  );
  assert.match(editor.textContent, /排除本条目/);
  assert.match(editor.textContent, /删除本条目/);
  for (const [action, value, options] of [
    ["insert", "n", { ctrlKey: true, altKey: true }],
    ["exclude", "q", { ctrlKey: true, shiftKey: true }],
    ["delete", "x", { ctrlKey: true, shiftKey: true }],
    ["theme", "j", { ctrlKey: true, altKey: true }],
  ]) {
    const input = document.querySelector(`[data-action="${action}"]`);
    input.focus();
    key(value, options);
  }
  await $("saveShortcuts").onclick();
  if(document.body.dataset.page!=="editor")$("editorTab").click();
  assert.equal(
    document.querySelector(".add-heading").title,
    "添加（Ctrl+Alt+N）",
  );
  assert.equal(
    document.querySelector(".row-action.eye").title,
    "排除（Ctrl+Shift+Q）",
  );
  assert.equal(
    document.querySelector(".row-action.remove").title,
    "删除（Ctrl+Shift+X）",
  );
  $("theme").dispatchEvent(
    new window.MouseEvent("mouseover", { bubbles: true }),
  );
  assert.equal($("theme").title, "主题（Ctrl+Alt+J）");
  assert.equal($("undo").title, "撤销（Ctrl+Z）");
  assert.equal($("redo").title, "重做（Ctrl+Shift+Z）");
  document.querySelector(".content").focus();
  assert.equal(key("y", { ctrlKey: true }).defaultPrevented, false);
  $("shortcutsTab").click();
  $("resetShortcuts").click();
  await $("saveShortcuts").onclick();
  if(document.body.dataset.page!=="editor")$("editorTab").click();
});

test("level selector converts body to every heading level and back without losing content", () => {
  if(document.body.dataset.page!=="editor")$("editorTab").click();
  const field = document.querySelector(".content");
  field.focus();
  const id = field.dataset.id,
    text = field.innerHTML;
  for (const value of ["0", "1", "6", "3", "0"]) {
    $("headingLevel").value = value;
    $("headingLevel").dispatchEvent(new window.Event("change"));
    const row = document.querySelector(`.row[data-id="${id}"]`);
    assert.equal(
      row.classList.contains(value === "0" ? "item" : "h" + value),
      true,
    );
    assert.equal(row.querySelector(".content").innerHTML, text);
  }
});
test("mouse-opened add menu accepts arrows and creates the selected level on Enter", () => {
  if(document.body.dataset.page!=="editor")$("editorTab").click();
  document.querySelector(".add-heading").click();
  key("ArrowDown");
  key("ArrowDown");
  assert.equal(
    document.querySelector('[data-level="2"]').getAttribute("aria-current"),
    "true",
  );
  key("Enter");
  assert.equal(
    document.activeElement.closest(".row").classList.contains("h2"),
    true,
  );
});
test("keyboard sorting moves a heading and children as one block and supports cancel and undo", () => {
  if(document.body.dataset.page!=="editor")$("editorTab").click();
  document.querySelector(".content").focus();
  // Ensure two independent sibling subtrees at the tail.
  let ids = [];
  for (const text of ["排序 A", "排序 B"]) {
    const fields = [...document.querySelectorAll(".content")];
    fields.at(-1).focus();
    key("n", { ctrlKey: true });
    key("1");
    const heading = document.activeElement;
    heading.textContent = text;
    heading.dispatchEvent(new window.Event("input", { bubbles: true }));
    ids.push(heading.dataset.id);
  }
  const order = () =>
    [...document.querySelectorAll("#paper .row")].map((row) => row.dataset.id);
  const original = order();
  document.querySelector(`.content[data-id="${ids[0]}"]`).focus();
  key("g", { ctrlKey: true, shiftKey: true });
  key("ArrowDown");
  assert.ok(order().indexOf(ids[0]) > order().indexOf(ids[1]));
  key("Escape");
  assert.deepEqual(order(), original);
  document.querySelector(`.content[data-id="${ids[0]}"]`).focus();
  key("g", { ctrlKey: true, shiftKey: true });
  key("ArrowDown");
  key("Enter");
  assert.ok(order().indexOf(ids[0]) > order().indexOf(ids[1]));
  $("undo").click();
  assert.deepEqual(order(), original);
});

test("editing tabs restore independent caret, scroll and multi-selection state", () => {
  const main = document.querySelector("main");
  if(document.body.dataset.page!=="editor")$("editorTab").click();
  let field = document.querySelector(".content");
  field.focus();
  field.textContent = "保存光标和位置";
  field.dispatchEvent(new window.Event("input", { bubbles: true }));
  const range = document.createRange();
  range.setStart(field.firstChild, 2);
  range.setEnd(field.firstChild, 5);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(range);
  document.dispatchEvent(new window.Event("selectionchange"));
  const id = field.dataset.id;
  if ($("multiSelect").getAttribute("aria-pressed") !== "true")
    $("multiSelect").click();
  const check = document.querySelector(".row input[type=checkbox]");
  check.checked = true;
  check.dispatchEvent(new window.Event("change"));
  main.scrollTop = 325;
  $("template").click();
  main.scrollTop = 140;
  $("commonTab").click();
  main.scrollTop = 75;
  $("preview").click();
  if(document.body.dataset.page!=="editor")$("editorTab").click();
  assert.equal(main.scrollTop, 325);
  assert.equal(document.activeElement.dataset.id, id);
  assert.equal(window.getSelection().toString(), "光标和");
  assert.equal($("multiSelect").getAttribute("aria-pressed"), "true");
  assert.equal(
    document.querySelector(".row input[type=checkbox]").checked,
    true,
  );
  $("template").click();
  assert.equal(main.scrollTop, 140);
  $("commonTab").click();
  assert.equal(main.scrollTop, 75);
});

test("header follows editor and floating entry order; successful copy fills its button", async () => {
  assert.equal($("copy").previousElementSibling, $("editorTab"));
  assert.equal($("template").previousElementSibling, $("copy"));
  assert.equal($("floatingButton").previousElementSibling, $("shortcutsTab"));
  assert.equal($("size").nextElementSibling, $("bold"));
  assert.ok($("voiceInput").querySelector("svg"));
  assert.equal($("voiceInput").textContent.trim(), "");
  let minimized = false;
  window.addEventListener(
    "prombee-minimize",
    () => {
      minimized = true;
    },
    { once: true },
  );
  $("settingsTab").click();
  $("floatingButton").click();
  assert.equal($("floatingPanel").hidden, false);
  assert.equal($("floatingEnabled").type, "checkbox");
  assert.equal($("floatingEnabled").getAttribute("role"), "switch");
  assert.equal(minimized, false);
  $("copy").classList.remove("copied");
  await $("copy").onclick();
  assert.equal($("copy").classList.contains("copied"), true);
});

test("empty-entry filtering is a persistent copy option and never deletes editor rows", async () => {
  if(document.body.dataset.page!=="editor")$("editorTab").click();
  $("newDoc").click();
  const count = document.querySelectorAll(".row").length;
  if ($("deleteEmpty").getAttribute("aria-pressed") === "true")
    $("deleteEmpty").click();
  const copied = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text) => copied.push(text) },
  });
  await $("copy").onclick();
  assert.match(copied.at(-1), /- /);
  $("deleteEmpty").click();
  assert.equal($("deleteEmpty").getAttribute("aria-pressed"), "true");
  await $("copy").onclick();
  assert.equal(copied.at(-1), "");
  assert.equal(document.querySelectorAll(".row").length, count);
  $("preview").click();
  if(document.body.dataset.page!=="editor")$("editorTab").click();
  assert.equal($("deleteEmpty").getAttribute("aria-pressed"), "true");
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(saved.state.removeEmptyOnCopy, true);
  $("deleteEmpty").click();
  assert.equal($("deleteEmpty").getAttribute("aria-pressed"), "false");
  await $("copy").onclick();
  assert.match(copied.at(-1), /- /);
});

test("cut without text selection copies only this entry and preserves children; undo restores it", async () => {
  if(document.body.dataset.page!=="editor")$("editorTab").click();
  $("newDoc").click();
  const heading = document.querySelector(".content");
  heading.focus();
  heading.textContent = "剪切标题";
  heading.dispatchEvent(new window.Event("input", { bubbles: true }));
  const row = heading.closest(".row"),
    id = heading.dataset.id,
    count = document.querySelectorAll(".row").length;
  const childIds = [...document.querySelectorAll(".content")]
    .slice(1)
    .map((n) => n.dataset.id);
  window.getSelection().removeAllRanges();
  const range = document.createRange();
  range.selectNodeContents(heading);
  range.collapse(true);
  window.getSelection().addRange(range);
  const copies = [];
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text) => copies.push(text) },
  });
  assert.equal(key("x", { ctrlKey: true }).defaultPrevented, true);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(copies[0], "剪切标题");
  assert.equal(document.querySelectorAll(".row").length, count - 1);
  for (const childId of childIds)
    assert.ok(document.querySelector(`.content[data-id="${childId}"]`));
  $("undo").click();
  assert.ok(document.querySelector(`.content[data-id="${id}"]`));
  const restored = document.querySelector(`.content[data-id="${id}"]`);
  restored.focus();
  const selected = document.createRange();
  selected.selectNodeContents(restored);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(selected);
  assert.equal(key("x", { ctrlKey: true }).defaultPrevented, false);
  assert.equal(document.querySelectorAll(".row").length, count);
  selected.collapse(true);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(selected);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: async () => {
        throw Error("denied");
      },
    },
  });
  document.execCommand = () => false;
  key("x", { ctrlKey: true });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.ok(document.querySelector(`.content[data-id="${id}"]`));
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (text) => copies.push(text) },
  });
});

test("floating setting saves a persistent switch without minimizing the editor", async () => {
  const previous = globalThis.fetch;
  let payload;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/floating");
    payload = JSON.parse(options.body);
    return { ok: true, json: async () => payload };
  };
  try {
    $("floatingEnabled").checked = false;
    await $("floatingEnabled").onchange();
    assert.deepEqual(payload, { enabled: false });
    assert.equal($("floatingEnabled").checked, false);
    assert.equal($("floatingEnabled").disabled, false);
    $("floatingEnabled").checked = true;
    await $("floatingEnabled").onchange();
    assert.deepEqual(payload, { enabled: true });
  } finally { globalThis.fetch = previous; }
});


test("new rounds include Markdown hierarchy typed immediately before creation", () => {
  if(document.body.dataset.page!=="editor")$("editorTab").click();
  $("newDoc").click();
  const body = document.querySelector('.content[aria-label="正文条目"]');
  const row = body.closest('.row');
  if (row.hidden) document.querySelector('.fold[aria-expanded="false"]')?.click();
  const field = document.querySelector(`.content[data-id="${body.dataset.id}"]`);
  field.focus();field.innerHTML = "## 内联新结构";field.dispatchEvent(new window.Event("input",{bubbles:true}));
  $("newDoc").click();
  assert.ok([...document.querySelectorAll('.heading .content')].some(el=>el.textContent === "内联新结构"));
});
