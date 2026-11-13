import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountAttachments } from "../web/attachments.js";
test("gallery cards expose copyable references, drag into a precise text position and follow copied references", async () => {
  const dom = new JSDOM(
    '<div id="paper"><div class="content" contenteditable>hello</div></div>',
    { url: "http://localhost/" },
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const one = {
      id: "one",
      path: "/tmp/图.png",
      name: "图.png",
      type: "image/png",
    },
    two = {
      id: "two",
      path: "/tmp/二.txt",
      name: "二.txt",
      type: "text/plain",
    };
  const doc = { id: "doc", nodes: [] };
  let copies = [],
    updates = 0;
  globalThis.fetch = async (url, options) => ({
    ok: true,
    json: async () => {
      let p = JSON.parse(options.body);
      return p.action === "pick"
        ? { attachment: one }
        : p.action === "lookup"
          ? { attachments: [one] }
          : { attachments: [two] };
    },
  });
  const gallery = mountAttachments({
    getDoc: () => doc,
    editable: () => true,
    remember() {},
    changed() {
      updates++;
    },
    notify: (e) => assert.fail(e),
    copyReference: async (text) => copies.push(text),
  });
  gallery.paint();
  document.querySelector(".attachment-add").click();
  await new Promise((r) => setTimeout(r, 5));
  let card = document.querySelector(".attachment-card");
  assert.equal(card.draggable, true);
  await card.querySelector(".attachment-reference").onclick();
  assert.match(copies[0], /file:\/\/\//);
  let data = {};
  const transfer = {
    types: ["application/x-prombee-attachment"],
    setData: (type, value) => (data[type] = value),
    getData: (type) => data[type] || "",
  };
  let event = new window.Event("dragstart");
  Object.defineProperty(event, "dataTransfer", { value: transfer });
  card.dispatchEvent(event);
  assert.equal(data["application/x-prombee-attachment"], "one");
  const content = document.querySelector(".content");
  document.caretRangeFromPoint = () => {
    const r = document.createRange();
    r.setStart(content.firstChild, 2);
    r.collapse(true);
    return r;
  };
  content.addEventListener("input", () => updates++);
  await gallery.drop(
    { dataTransfer: transfer, clientX: 1, clientY: 2, preventDefault() {} },
    content,
    {},
  );
  assert.match(content.textContent, /^he\[图.png\]\(file:.*llo$/);
  assert.equal(doc.attachments.length, 1);
  content.textContent = "[二.txt](file:///tmp/%E4%BA%8C.txt)";
  let r = document.createRange();
  r.selectNodeContents(content);
  window.getSelection().removeAllRanges();
  window.getSelection().addRange(r);
  const copy = new window.Event("copy", { bubbles: true });
  Object.defineProperty(copy, "clipboardData", {
    value: { getData: () => content.textContent },
  });
  content.dispatchEvent(copy);
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(doc.attachments.length, 2);
  await gallery.syncReferences(content.textContent);
  assert.equal(doc.attachments.length, 2);
  assert.ok(updates >= 2);
  dom.window.close();
});
