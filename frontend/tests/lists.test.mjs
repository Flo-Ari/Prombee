import test from "node:test";
import assert from "node:assert/strict";
import { defaultListType, applyListType } from "../src/editor/lists.ts";
const fixture = () => ({
  id: "round",
  name: "第1轮",
  nodes: [
    { id: "a", kind: "heading", level: 1, html: "A" },
    { id: "b", kind: "item", level: 1, html: "B" },
    { id: "c", kind: "heading", level: 2, html: "C" },
    { id: "d", kind: "item", level: 1, html: "D" },
    { id: "e", kind: "heading", level: 1, html: "E" },
    { id: "f", kind: "item", level: 1, html: "F" },
  ],
});
test("global list choice persists independently of local commands and applies to new bodies", () => {
  const collection = fixture();
  assert.equal(defaultListType(collection), "unordered");
  assert.equal(applyListType(collection, "all-ordered"), true);
  assert.equal(defaultListType(collection), "ordered");
  assert.equal(applyListType(collection, "none", "a"), true);
  assert.equal(collection.nodes.find((n) => n.id === "b").listType, "none");
  assert.equal(collection.nodes.find((n) => n.id === "d").listType, "none");
  assert.equal(collection.nodes.find((n) => n.id === "f").listType, "ordered");
  assert.equal(defaultListType(collection), "ordered");
  const reopened = JSON.parse(JSON.stringify(collection));
  reopened.nodes.push({ id: "new", kind: "item", level: 1, html: "" });
  assert.equal(defaultListType(reopened), "ordered");
  assert.equal(reopened.nodes.at(-1).listType, "ordered");
  assert.equal(reopened.nodes.find((n) => n.id === "b").listType, "none");
});
test("collections keep separate defaults and local commands without an active entry do nothing", () => {
  const first = fixture(),
    second = fixture();
  applyListType(first, "all-none");
  assert.equal(defaultListType(second), "unordered");
  const before = JSON.stringify(first);
  assert.equal(applyListType(first, "ordered", "missing"), false);
  assert.equal(applyListType(first, "all-invalid"), false);
  assert.equal(JSON.stringify(first), before);
});
test("legacy body markers never select an implicit global mode", () => {
  const collection = fixture();
  for (const node of collection.nodes)
    if (node.kind === "item") node.listType = "ordered";
  assert.equal(defaultListType(collection), "unordered");
  assert.ok(
    collection.nodes
      .filter((n) => n.kind === "item")
      .every((n) => n.listType === "ordered"),
  );
  collection.defaultListType = "none";
  assert.equal(defaultListType(collection), "none");
});
