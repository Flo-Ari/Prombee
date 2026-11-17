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
        : ["lookup", "attach"].includes(p.action)
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
  assert.equal(copies[0], "图");
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
  assert.equal(content.textContent, "he图llo");
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
  assert.equal(content.textContent, "textimage");
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
  assert.equal(content.textContent, "beforescreenshot");
  dom.window.close();
});

test("21 pasted lines become temporary TXT; 20 lines remain text; collapse and Save As keep assets intact", async () => {
  const dom = new JSDOM(
    '<main><div id="paper"><section class="row"><div class="content">before</div></section></div></main>',
    { url: "http://localhost/" },
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const content = document.querySelector(".content"),
    node = { id: "n", html: "before" },
    doc = { nodes: [node] },
    messages = [],
    requests = [];
  globalThis.fetch = async (url, options) => {
    requests.push([url, options]);
    if (url.includes("/upload")) {
      assert.ok(url.includes("temporary=1"));
      assert.equal(await options.body.text(), long);
      return {
        ok: true,
        json: async () => ({
          id: "tmp",
          name: "粘贴内容(1).txt",
          path: "/tmp/temporary.txt",
          type: "text/plain",
          temporary: true,
        }),
      };
    }
    return { ok: true, json: async () => ({ path: "/chosen/kept.txt" }) };
  };
  const gallery = mountAttachments({
    getDoc: () => doc,
    editable: () => true,
    remember() {},
    changed() {},
    notify: (m) => messages.push(m),
  });
  const range = document.createRange();
  range.selectNodeContents(content);
  range.collapse(false);
  window.getSelection().addRange(range);
  const long = Array.from({ length: 21 }, (_, i) => "原文" + i).join("\r\n");
  const paste = (text) => ({
    clipboardData: { files: [], getData: () => text },
    preventDefault() {},
  });
  assert.equal(gallery.hasPaste(paste("one\n".repeat(19) + "last")), false);
  assert.equal(
    await gallery.paste(paste("one\n".repeat(19) + "last"), content, node),
    false,
  );
  assert.equal(gallery.hasPaste(paste(long)), true);
  assert.equal(await gallery.paste(paste(long), content, node), true);
  assert.equal(content.textContent, "before粘贴内容(1)");
  assert.equal(doc.attachments[0].temporary, true);
  assert.ok(!gallery.bundle(content.textContent).text.includes("/tmp/"));
  assert.deepEqual(gallery.bundle("").files, ["tmp"]);
  let toggle = document.querySelector(".attachment-toggle");
  toggle.click();
  assert.equal(document.querySelector("#attachmentItems").hidden, true);
  assert.equal(
    document.querySelector(".attachment-toggle").getAttribute("aria-expanded"),
    "false",
  );
  gallery.paint();
  assert.equal(document.querySelector("#attachmentItems").hidden, true);
  document.querySelector(".attachment-toggle").click();
  assert.equal(document.querySelector("#attachmentItems").hidden, false);
  document.querySelector(".attachment-card").dispatchEvent(
    new window.MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: 50,
      clientY: 50,
    }),
  );
  const save = document.querySelector(".attachment-menu button");
  assert.equal(save.textContent, "另存为");
  await save.onclick();
  assert.equal(JSON.parse(requests.at(-1)[1].body).action, "saveAs");
  assert.equal(doc.attachments.length, 1);
  assert.deepEqual(messages, []);
  dom.window.close();
});

test("ingestion uses only the current gallery, serializes concurrent additions and references stems", async () => {
  const dom = new JSDOM(
    '<div id="paper"><section class="row"><div class="content"></div></section></div>',
    { url: "http://localhost/" },
  );
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  const content = document.querySelector(".content"),
    collection = { nodes: [] },
    node = { html: "" },
    scopes = [];
  globalThis.fetch = async (url) => {
    const scope = new URL(url, "http://localhost").searchParams.get("scope");
    scopes.push(scope);
    await new Promise((r) => setTimeout(r, 3));
    const id = "a" + scopes.length,
      name = scope ? "照片(1).png" : "照片.png";
    return {
      ok: true,
      json: async () => ({
        id,
        name,
        path: "/tmp/" + id + "/" + name,
        type: "image/png",
      }),
    };
  };
  const gallery = mountAttachments({
    getDoc: () => collection,
    editable: () => true,
    remember() {},
    changed() {},
    notify: (e) => assert.fail(e),
  });
  const r = document.createRange();
  r.selectNodeContents(content);
  window.getSelection().addRange(r);
  const event = () => ({
    clipboardData: {
      files: [new window.File(["img"], "照片.png")],
      getData: () => "",
    },
    preventDefault() {},
  });
  await Promise.all([
    gallery.paste(event(), content, node),
    gallery.paste(event(), content, node),
  ]);
  assert.deepEqual(scopes, ["", "a1"]);
  assert.deepEqual(
    collection.attachments.map((a) => a.name),
    ["照片.png", "照片(1).png"],
  );
  assert.ok(content.textContent.includes("照片(1)"));
  assert.ok(!content.textContent.includes(".png"));
  for (let i = 0; i < 2; i++)
    document.querySelector(".attachment-remove").click();
  await gallery.paste(event(), content, node);
  assert.equal(scopes.at(-1), "");
  assert.equal(collection.attachments[0].name, "照片.png");
  dom.window.close();
});
