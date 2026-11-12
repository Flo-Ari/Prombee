import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { nextRoundNodes } from "../web/rounds.js";
import { hierarchyNodes } from "../web/core.js";
globalThis.document = new JSDOM("").window.document;
const h = (id, level, html) => ({ id, kind: "heading", level, html }),
  b = (id, html = "") => ({ id, kind: "item", level: 1, html });
test("new rounds stably sort empty heading subtrees to the end of their parent and collapse them independently of the switch", () => {
  const previous = [
      h("p", 1, "父"),
      h("empty", 2, "空"),
      b("a"),
      h("nested", 3, "空孙"),
      b("b"),
      h("filled", 2, "非空"),
      b("c", "正文"),
      h("last", 1, "最后"),
      b("d", "正文"),
    ],
    template = hierarchyNodes(previous),
    before = structuredClone(previous);
  const sorted = nextRoundNodes(template, previous),
    headings = sorted.filter((n) => n.kind === "heading");
  assert.deepEqual(
    headings.map((n) => n.html),
    ["父", "非空", "空", "空孙", "最后"],
  );
  assert.deepEqual(
    headings.filter((n) => n.collapsed).map((n) => n.html),
    ["空", "空孙"],
  );
  const unsorted = nextRoundNodes(template, previous, false);
  assert.deepEqual(
    unsorted.filter((n) => n.kind === "heading").map((n) => n.html),
    ["父", "空", "空孙", "非空", "最后"],
  );
  assert.equal(unsorted.filter((n) => n.collapsed).length, 2);
  assert.equal(
    sorted.filter((n) => n.kind === "item").every((n) => n.html === ""),
    true,
  );
  assert.deepEqual(previous, before);
});
test("duplicate heading names retain their separate empty/populated identities", () => {
  const previous = [
      h("p", 1, "父"),
      h("a", 2, "重复"),
      b("ab"),
      h("b", 2, "重复"),
      b("bb", "有正文"),
    ],
    result = nextRoundNodes(hierarchyNodes(previous), previous);
  assert.deepEqual(
    result.filter((n) => n.kind === "heading").map((n) => !!n.collapsed),
    [false, false, true],
  );
  assert.equal(new Set(result.map((n) => n.id)).size, result.length);
});
