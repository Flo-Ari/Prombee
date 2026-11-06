import {
  uid,
  cleanHTML,
  plain,
  toMarkdown,
  makeNode,
  visibility,
  scopeEnd,
  nextRoundName,
} from "./core.js";
import { openReview } from "./review.js";
const $ = (id) => document.getElementById(id);
let state,
  revision = 0,
  active = null,
  selection = null,
  saveTimer,
  saveRunning = false,
  dirty = false,
  conflict = false,
  menuAnchor = null,
  history = [],
  future = [],
  toastTimer;
const doc = () =>
  state.documents.find((d) => d.id === state.current) || state.documents[0];
function toast(text) {
  $("toast").textContent = text;
  $("toast").classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $("toast").classList.remove("show"), 2000);
}
function remember() {
  if (!state) return;
  const copy = JSON.stringify(doc());
  if (history.at(-1) !== copy) history.push(copy);
  if (history.length > 120) history.shift();
  future = [];
  buttons();
}
function buttons() {
  $("undo").disabled = !history.length;
  $("redo").disabled = !future.length;
}
function restore(snapshot) {
  const old = doc(),
    index = state.documents.indexOf(old);
  state.documents[index] = JSON.parse(snapshot);
  active = null;
  selection = null;
  render();
  changed();
}
function undo() {
  if (!history.length) return;
  future.push(JSON.stringify(doc()));
  restore(history.pop());
  buttons();
}
function redo() {
  if (!future.length) return;
  history.push(JSON.stringify(doc()));
  restore(future.pop());
  buttons();
}
function element(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
function applyTheme() {
  document.body.classList.toggle("dark", state.dark);
  $("theme").textContent = state.dark ? "☀" : "☾";
  $("theme").setAttribute("aria-pressed", String(state.dark));
  window.webkit?.messageHandlers?.theme?.postMessage(state.dark);
  document.documentElement.style.setProperty(
    "--doc-font",
    ["sans-serif", "serif", "monospace"].includes(state.font)
      ? state.font
      : `"${state.font}",sans-serif`,
  );
  document.documentElement.style.setProperty("--doc-size", state.size + "pt");
  $("size").value = state.size;
  $("font").value = state.font;
}
function render() {
  applyTheme();
  $("documents").replaceChildren();
  for (const d of state.documents) {
    const o = element("option", "", d.name);
    o.value = d.id;
    $("documents").append(o);
  }
  $("documents").value = doc().id;
  $("paper").replaceChildren();
  const visibilityStates = visibility(doc().nodes);
  for (const n of doc().nodes) {
    const row = element(
      "section",
      `row ${n.kind === "heading" ? "heading h" + n.level : "item"}`,
    );
    row.dataset.id = n.id;
    row.classList.toggle("excluded", visibilityStates.get(n.id).excluded);
    const mark = element("span", "marker");
    mark.setAttribute("aria-hidden", "true");
    const content = element("div", "content");
    content.contentEditable = "true";
    content.spellcheck = false;
    content.dataset.id = n.id;
    content.dataset.placeholder =
      n.kind === "heading" ? "标题" : "写下一条要求…";
    content.setAttribute("role", "textbox");
    content.setAttribute("aria-multiline", "true");
    content.setAttribute(
      "aria-label",
      n.kind === "heading" ? `H${n.level} 标题` : "内容条目",
    );
    content.innerHTML = cleanHTML(n.html);
    content.onfocus = () => {
      active = n.id;
    };
    content.addEventListener("beforeinput", () => remember());
    content.addEventListener("input", () => {
      for (const empty of content.querySelectorAll("span,font"))
        if (!empty.textContent && !empty.querySelector("br")) empty.remove();
      n.html = cleanHTML(content.innerHTML);
      changed();
      renumber();
    });
    content.addEventListener("keydown", (e) => editKey(e, n, content));
    content.addEventListener("paste", (e) => {
      e.preventDefault();
      remember();
      document.execCommand(
        "insertText",
        false,
        e.clipboardData.getData("text/plain"),
      );
      n.html = cleanHTML(content.innerHTML);
      changed();
    });
    const plus = element("button", "add-heading", "＋");
    plus.title = "添加 Markdown 标题";
    plus.setAttribute("aria-label", "在此处添加标题");
    plus.onclick = (e) => openMenu(n.id, e.currentTarget);
    const controls = element("div", "row-controls");
    const visibilityState = visibilityStates.get(n.id);
    const eye = element("button", "row-action eye");
    eye.innerHTML = visibilityState.excluded
      ? '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10 5c5-1 9 3 12 7-1 2-3 4-5 5M7 7c-3 1-5 3-7 5 3 4 7 7 12 7 2 0 3 0 4-1"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    eye.setAttribute(
      "aria-label",
      visibilityState.excluded ? "开启此层级复制" : "排除此层级复制",
    );
    eye.setAttribute("aria-pressed", String(visibilityState.excluded));
    eye.title = visibilityState.inherited
      ? "上级已排除，请先开启上级"
      : visibilityState.excluded
        ? "此层级不参与复制，点击开启"
        : "此层级参与复制，点击排除";
    eye.disabled = visibilityState.inherited;
    eye.onclick = () => {
      remember();
      n.excluded = !n.excluded;
      render();
      changed();
    };
    const remove = element("button", "row-action remove");
    remove.innerHTML =
      '<svg viewBox="0 0 24 24"><path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7"/></svg>';
    remove.setAttribute(
      "aria-label",
      n.kind === "heading" ? "删除此标题及下级" : "删除此条目",
    );
    remove.title = "删除，可用 Ctrl+Z 撤销";
    remove.onclick = () => deleteNode(n.id);
    controls.append(plus, eye, remove);
    row.append(mark, content, controls);
    $("paper").append(row);
  }
  if (!doc().nodes.length)
    $("paper").append(
      element("p", "empty-document", "点击工具栏「＋ 条目」开始编写"),
    );
  renumber();
  buttons();
}
function renumber() {
  let number = 0;
  for (const n of doc().nodes) {
    const row = [...$("paper").children].find((r) => r.dataset.id === n.id);
    if (!row) continue;
    if (n.kind === "heading") {
      number = 0;
      row.querySelector(".marker").textContent = "H" + n.level;
    } else
      row.querySelector(".marker").textContent = plain(n.html).trim()
        ? `${++number}.`
        : "·";
  }
  $("stats").textContent =
    `${doc().nodes.filter((n) => n.kind === "heading").length} 个标题 · ${doc().nodes.filter((n) => n.kind === "item" && plain(n.html).trim()).length} 个条目 · ${doc().nodes.reduce((s, n) => s + plain(n.html).length, 0)} 字`;
}
function contentFor(id) {
  return [...document.querySelectorAll(".content")].find(
    (x) => x.dataset.id === id,
  );
}
function focus(id, end = false) {
  const el = contentFor(id);
  if (!el) return;
  active = id;
  el.focus();
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(!end);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(range);
  selection = range.cloneRange();
  el.scrollIntoView({ block: "nearest" });
}
function saveSelection() {
  const s = window.getSelection();
  if (!s?.rangeCount) return;
  const range = s.getRangeAt(0),
    anchor =
      s.anchorNode?.nodeType === 1 ? s.anchorNode : s.anchorNode?.parentElement,
    el = anchor?.closest(".content");
  if (
    el &&
    document.activeElement === el &&
    el.contains(range.commonAncestorContainer)
  ) {
    active = el.dataset.id;
    selection = range.cloneRange();
    $("bold").classList.toggle("active", document.queryCommandState("bold"));
    $("italic").classList.toggle(
      "active",
      document.queryCommandState("italic"),
    );
  }
}
document.addEventListener("selectionchange", saveSelection);
function restoreSelection() {
  const el = contentFor(active);
  if (!el) {
    toast("请先选择文字或条目");
    return null;
  }
  const saved = selection?.cloneRange();
  el.focus();
  const s = window.getSelection();
  if (saved && el.contains(saved.commonAncestorContainer)) {
    s.removeAllRanges();
    s.addRange(saved);
  } else {
    const r = document.createRange();
    r.selectNodeContents(el);
    r.collapse(false);
    s.removeAllRanges();
    s.addRange(r);
  }
  return el;
}
function commitActive(el) {
  const n = doc().nodes.find((n) => n.id === active);
  if (n) n.html = cleanHTML(el.innerHTML);
  changed();
  saveSelection();
  renumber();
}
function format(command, value) {
  const el = restoreSelection();
  if (!el) return;
  remember();
  document.execCommand("styleWithCSS", false, true);
  document.execCommand(command, false, value);
  commitActive(el);
}
function spanStyle(property, value) {
  const el = restoreSelection();
  if (!el) return false;
  const s = window.getSelection();
  if (s.isCollapsed) return false;
  remember();
  const range = s.getRangeAt(0),
    span = element("span");
  span.style[property] = value;
  const allText = range.toString() === el.textContent;
  let fragment;
  if (allText) {
    fragment = document.createDocumentFragment();
    while (el.firstChild) fragment.append(el.firstChild);
  } else fragment = range.extractContents();
  for (const child of fragment.querySelectorAll("span,font")) {
    child.style[property] = "";
    if (property === "fontFamily") child.removeAttribute("face");
    if (property === "fontSize") child.removeAttribute("size");
    if (property === "color") child.removeAttribute("color");
  }
  span.append(fragment);
  if (allText) el.append(span);
  else range.insertNode(span);
  range.selectNodeContents(span);
  s.removeAllRanges();
  s.addRange(range);
  selection = range.cloneRange();
  commitActive(el);
  return true;
}
function changed() {
  dirty = true;
  $("status").textContent = "正在保存…";
  try {
    localStorage.setItem("prombee-draft", JSON.stringify({ state, revision }));
  } catch {}
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 250);
}
async function save() {
  if (!dirty || saveRunning || conflict) return;
  saveRunning = true;
  dirty = false;
  const payload = JSON.stringify({ state, baseRevision: revision });
  try {
    const r = await fetch("/api/state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true,
    });
    if (r.status === 409) {
      conflict = true;
      dirty = true;
      $("status").textContent = "另一窗口已修改 · 请先复制本页内容再刷新";
      toast("检测到其他窗口的修改，已暂停保存以保护内容");
      return;
    }
    if (!r.ok) throw Error();
    const result = await r.json();
    revision = result.revision;
    $("status").textContent = "已保存到本机";
    if (!dirty) localStorage.removeItem("prombee-draft");
    else
      localStorage.setItem(
        "prombee-draft",
        JSON.stringify({ state, revision }),
      );
  } catch {
    dirty = true;
    $("status").textContent = "保存失败 · 请复制文字保留内容";
  } finally {
    saveRunning = false;
    if (dirty && !conflict) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(save, 1200);
    }
  }
}
function addItem() {
  remember();
  const nodes = doc().nodes,
    index = nodes.findIndex((n) => n.id === active),
    n = makeNode();
  nodes.splice(index < 0 ? nodes.length : index + 1, 0, n);
  render();
  focus(n.id);
  changed();
}
function addHeading(level) {
  remember();
  const nodes = doc().nodes,
    index = nodes.findIndex((n) => n.id === menuAnchor),
    heading = makeNode("heading", level),
    following = nodes[index + 1];
  nodes.splice(
    index + 1,
    0,
    heading,
    ...(following?.kind === "item" ? [] : [makeNode()]),
  );
  closeMenu();
  render();
  focus(heading.id);
  changed();
}
function openMenu(id, anchor) {
  menuAnchor = id;
  const menu = $("headingMenu");
  menu.hidden = false;
  const r = anchor.getBoundingClientRect();
  menu.style.left =
    Math.max(8, Math.min(r.right - 205, window.innerWidth - 213)) + "px";
  menu.style.top =
    Math.max(
      8,
      Math.min(r.bottom + 5, window.innerHeight - menu.offsetHeight - 10),
    ) + "px";
}
function closeMenu() {
  $("headingMenu").hidden = true;
}
document.addEventListener("click", (e) => {
  if (!e.target.closest("#headingMenu,.add-heading")) closeMenu();
});
for (const b of $("headingMenu").querySelectorAll("button"))
  b.onclick = () => addHeading(Number(b.dataset.level));
function editKey(e, n, el) {
  if (e.isComposing) return;
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    const nodes = doc().nodes,
      index = nodes.indexOf(n);
    if (
      n.kind === "heading" &&
      nodes[index + 1]?.kind === "item" &&
      !plain(nodes[index + 1].html).trim()
    ) {
      focus(nodes[index + 1].id);
      return;
    }
    remember();
    let next = makeNode();
    if (n.kind === "item") {
      const s = window.getSelection();
      if (s.rangeCount) {
        const range = s.getRangeAt(0);
        range.deleteContents();
        const tail = document.createRange();
        tail.selectNodeContents(el);
        tail.setStart(range.endContainer, range.endOffset);
        const fragment = tail.extractContents(),
          box = element("div");
        box.append(fragment);
        next.html = cleanHTML(box.innerHTML);
        n.html = cleanHTML(el.innerHTML);
      }
    }
    nodes.splice(index + 1, 0, next);
    render();
    focus(next.id);
    changed();
  }
  if (e.key === "Backspace" && !plain(n.html) && doc().nodes.length > 1) {
    e.preventDefault();
    deleteNode(n.id);
  }
}
function deleteNode(id) {
  const nodes = doc().nodes,
    index = nodes.findIndex((n) => n.id === id);
  if (index < 0) return;
  remember();
  const count = scopeEnd(nodes, index) - index;
  nodes.splice(index, count);
  active = null;
  selection = null;
  render();
  if (nodes.length) focus(nodes[Math.min(index, nodes.length - 1)].id);
  changed();
  toast(`已删除 ${count} 项，可撤销`);
}
function deleteEmpty() {
  const nodes = doc().nodes;
  const remaining = nodes.filter((node) => plain(node.html).trim());
  const count = nodes.length - remaining.length;
  if (!count) {
    toast("本轮没有空项");
    return;
  }
  remember();
  doc().nodes = remaining;
  active = null;
  selection = null;
  render();
  changed();
  toast(`已清理本轮 ${count} 个空项，可撤销`);
}
async function copy() {
  const text = toMarkdown(doc().nodes);
  try {
    if (window.webkit?.messageHandlers?.clipboard) {
      window.webkit.messageHandlers.clipboard.postMessage(text);
    } else {
      await navigator.clipboard.writeText(text);
    }
    toast("已复制 Markdown 文字");
  } catch {
    const t = element("textarea");
    t.value = text;
    document.body.append(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    toast(ok ? "已复制 Markdown 文字" : "复制失败，请选中文字后按 Ctrl+C");
  }
}
$("newDoc").onclick = () => {
  const d = {
    id: uid(),
    name: nextRoundName(state.documents),
    nodes: [makeNode("heading", 1, "整体"), makeNode()],
  };
  state.documents.unshift(d);
  state.current = d.id;
  history = [];
  future = [];
  active = null;
  selection = null;
  render();
  focus(d.nodes[1].id);
  changed();
};
$("documents").onchange = () => {
  state.current = $("documents").value;
  history = [];
  future = [];
  active = null;
  selection = null;
  render();
  changed();
};
$("closeReview").onclick = () => $("reviewDialog").close();
$("preview").onclick = () => openReview(state, doc(), "preview");
$("compare").onclick = () => openReview(state, doc(), "compare");
$("copy").onclick = copy;
$("theme").onclick = () => {
  state.dark = !state.dark;
  applyTheme();
  changed();
};
$("bold").onmousedown = (e) => e.preventDefault();
$("italic").onmousedown = (e) => e.preventDefault();
$("clear").onmousedown = (e) => e.preventDefault();
$("bold").onclick = () => format("bold");
$("italic").onclick = () => format("italic");
$("clear").onclick = () => format("removeFormat");
$("font").onchange = () => {
  const value = $("font").value;
  if (!spanStyle("fontFamily", value)) {
    state.font = value;
    applyTheme();
    changed();
  }
};
const applySize = () => {
  clearTimeout(sizeTimer);
  const value = Math.max(9, Math.min(96, Number($("size").value) || 14));
  if (!spanStyle("fontSize", value + "pt")) {
    state.size = value;
    applyTheme();
    changed();
  }
  $("size").value = value;
};
$("size").onchange = applySize;
let sizeTimer;
$("size").addEventListener("input", () => {
  clearTimeout(sizeTimer);
  sizeTimer = setTimeout(() => {
    if (Number($("size").value) >= 9 && Number($("size").value) <= 96)
      applySize();
  }, 250);
});
$("size").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    clearTimeout(sizeTimer);
    applySize();
  }
});
$("color").oninput = () => {
  document.documentElement.style.setProperty(
    "--chosen-color",
    $("color").value,
  );
  format("foreColor", $("color").value);
};
$("headingLevel").onchange = () => {
  const level = Number($("headingLevel").value),
    n = doc().nodes.find((n) => n.id === active);
  if (level && n?.kind === "heading") {
    remember();
    n.level = level;
    render();
    focus(n.id);
    changed();
  } else if (level) toast("请先选择一个标题");
  $("headingLevel").value = "0";
};
$("addItem").onclick = addItem;
$("deleteEmpty").onclick = deleteEmpty;
$("undo").onclick = undo;
$("redo").onclick = redo;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
  if (!(e.ctrlKey || e.metaKey) || $("reviewDialog").open) return;
  const k = e.key.toLowerCase();
  if (k === "s") {
    e.preventDefault();
    save();
  }
  if (k === "n") {
    e.preventDefault();
    $("newDoc").click();
  }
  if (k === "b" || k === "i") {
    e.preventDefault();
    format(k === "b" ? "bold" : "italic");
  }
  if (k === "c" && e.shiftKey) {
    e.preventDefault();
    copy();
  }
  if (k === "z") {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  }
  if (k === "y") {
    e.preventDefault();
    redo();
  }
});
window.addEventListener("pagehide", () => {
  if (dirty && !conflict)
    navigator.sendBeacon(
      "/api/state",
      JSON.stringify({ state, baseRevision: revision }),
    );
});
try {
  const r = await fetch("/api/state");
  if (!r.ok) throw Error("无法载入文档");
  const data = await r.json();
  state = data.state;
  revision = data.revision;
  let draft;
  try {
    draft = JSON.parse(localStorage.getItem("prombee-draft"));
  } catch {}
  if (draft?.state && draft.revision === revision) {
    state = draft.state;
    dirty = true;
    toast("已恢复上次未完成保存的编辑");
  }
  render();
  $("status").textContent = "已保存到本机";
  if (dirty) changed();
  window.prombeeReady = true;
} catch (err) {
  $("status").textContent = err.message;
}

let devStamp;
setInterval(async () => {
  try {
    const response = await fetch("/api/dev");
    const value = await response.json();
    if (!value.enabled) return;
    if (
      devStamp &&
      devStamp !== value.stamp &&
      !dirty &&
      !saveRunning &&
      !$("reviewDialog").open
    )
      location.reload();
    else if (!devStamp) devStamp = value.stamp;
  } catch {}
}, 1000);

window.addEventListener("prombee-close", async () => {
  clearTimeout(saveTimer);
  if (!saveRunning) await save();
  let ticks = 0;
  while (saveRunning && ticks++ < 100)
    await new Promise((resolve) => setTimeout(resolve, 30));
  if (dirty && !conflict) await save();
  window.webkit?.messageHandlers?.close?.postMessage(
    dirty || conflict ? "error" : "saved",
  );
});
