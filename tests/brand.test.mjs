import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";

test("browser and desktop surfaces show exactly one name in the active language", async () => {
  const dom = new JSDOM(
    "<title>提示蜂</title><strong data-app-name>提示蜂</strong>",
  );
  globalThis.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", {
    value: { languages: ["zh-CN"], language: "zh-CN" },
    configurable: true,
  });
  globalThis.location = { search: "" };
  const zh = await import("../web/brand.js?zh");
  assert.equal(zh.productName, "提示蜂");
  assert.equal(document.title, "提示蜂");
  assert.equal(document.querySelector("[data-app-name]").textContent, "提示蜂");
  globalThis.location = { search: "?desktop=windows&lang=en" };
  const en = await import("../web/brand.js?en");
  assert.equal(en.productName, "Prombee");
  assert.equal(document.title, "Prombee");
  assert.equal(
    document.querySelector("[data-app-name]").textContent,
    "Prombee",
  );
  globalThis.location = { search: "?desktop=gtk&lang=zh" };
  Object.defineProperty(globalThis, "navigator", {
    value: { languages: ["en-US"], language: "en-US" },
    configurable: true,
  });
  const native = await import("../web/brand.js?native");
  assert.equal(native.productName, "提示蜂");
});
