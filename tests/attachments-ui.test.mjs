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
  assert.equal(copies[0], "图.png");
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

test("files dropped on editor blank space appear in the gallery and insert one reference", async () => {
  const dom = new JSDOM(
    '<main><div id="paper"><div class="content" contenteditable>text</div><div id="blank"></div></div></main>',
    { url: "http://localhost/" },
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const content = document.querySelector(".content"),
    node = { id: "n", html: "text" },
    doc = { nodes: [node] };
  let uploads = 0;
  globalThis.fetch = async (url, options) => {
    assert.match(url, /attachments\/upload/);
    assert.equal(options.body.name, "image.png");
    uploads++;
    return {
      ok: true,
      json: async () => ({
        id: "png",
        name: "image.png",
        type: "image/png",
        path: "/tmp/image.png",
      }),
    };
  };
  const gallery = mountAttachments({
    getDoc: () => doc,
    editable: () => true,
    remember() {},
    changed() {},
    notify: (e) => assert.fail(e),
    dropTarget: () => ({ content, node }),
  });
  const transfer = {
    types: ["Files"],
    files: [new window.File(["png"], "image.png", { type: "image/png" })],
    getData: () => "",
  };
  const event = new window.Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", { value: transfer });
  document.getElementById("blank").dispatchEvent(event);
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(uploads, 1);
  assert.equal(doc.attachments.length, 1);
  assert.equal(
    document.querySelector(".attachment-card").dataset.attachmentId,
    "png",
  );
  assert.match(
    content.textContent,
    /text\[image.png\]\(file:\/\/\/tmp\/image.png\)/,
  );
  assert.equal(document.querySelector("img").decoding, "async");
  dom.window.close();
});

test("native screenshot path is inserted after the asynchronous clipboard response", async () => {
  const dom = new JSDOM(
    '<div id="paper"><div class="content" contenteditable>before</div></div>',
    { url: "http://localhost/" },
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const content = document.querySelector(".content"),
    node = { id: "n", html: "before" },
    doc = { nodes: [node] };
  window.pywebview = {
    api: { clipboard_files: async () => ["/tmp/screenshot.png"] },
  };
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      attachments: [
        {
          id: "png",
          name: "screenshot.png",
          path: "/tmp/screenshot.png",
          type: "image/png",
        },
      ],
    }),
  });
  const gallery = mountAttachments({
    getDoc: () => doc,
    editable: () => true,
    remember() {},
    changed() {},
    notify: (e) => assert.fail(e),
  });
  const range = document.createRange();
  range.selectNodeContents(content);
  range.collapse(false);
  window.getSelection().addRange(range);
  let permitted = true;
  await gallery.paste(
    {
      clipboardData: {
        files: [],
        getData: () => {
          assert.ok(permitted, "must snapshot clipboard text before await");
          return "";
        },
      },
      preventDefault() {
        queueMicrotask(() => (permitted = false));
      },
    },
    content,
    node,
  );
  assert.equal(doc.attachments.length, 1);
  assert.match(content.textContent, /before\[screenshot.png\]/);
  dom.window.close();
});
