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
globalThis.fetch = async (url, options) =>
  options
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
  assert.equal(document.querySelector(".content").textContent, "## 常用约束");
  await new Promise((resolve) => setTimeout(resolve, 350));
  assert.equal(saved.state.common.nodes[0].html, "## 常用约束");
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
