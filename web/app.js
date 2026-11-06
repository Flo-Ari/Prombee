import {
  uid,
  cleanHTML,
  plain,
  toMarkdown,
  makeNode,
  visibility,
  scopeEnd,
  nextRoundName,
  hierarchyNodes,
  subtreeMarkdown,
  hasBlockMarkdown,
  selectionScope,
  foldedNodes,
  contextLevel,
  integrateMarkdown,
} from "./core.js";
import { renderMarkdown, renderComparison } from "./review.js";
import { createLibraryUI } from "./library.js";
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
let setId = null,
  fingerprint = null,
  noSet = false,
  libraryUI;
let multi = false,
  selected = new Set();
let page = "editor",
  previewSource = null;
const histories = new Map();
const currentDoc = () =>
  state.documents.find((d) => d.id === state.current) || state.documents[0];
const doc = () =>
  page === "preview"
    ? previewSource || currentDoc()
    : page === "template"
      ? state.template
      : page === "common"
        ? state.common
        : currentDoc();
const editing = () => ["editor", "template", "common"].includes(page);
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
  if (page === "template") state.template = JSON.parse(snapshot);
  else if (page === "common") state.common = JSON.parse(snapshot);
  else
    state.documents[state.documents.indexOf(currentDoc())] =
      JSON.parse(snapshot);
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
  $("documents").value = currentDoc().id;
  updatePages();
  $("paper").replaceChildren();
  const visibilityStates = visibility(doc().nodes);
  const folded = foldedNodes(doc().nodes);
  for (const n of doc().nodes) {
    const row = element(
      "section",
      `row ${n.kind === "heading" ? "heading h" + n.level : "item"}`,
    );
    row.dataset.id = n.id;
    row.hidden = folded.has(n.id);
    row.classList.toggle("batch-selected", selected.has(n.id));
    const leading = element("div", "row-leading");
    if (multi) {
      const checkbox = element("input");
      checkbox.type = "checkbox";
      checkbox.checked = selected.has(n.id);
      checkbox.setAttribute("aria-label", "选择此条目");
      checkbox.onchange = () => {
        if (checkbox.checked) selected.add(n.id);
        else selected.delete(n.id);
        row.classList.toggle("batch-selected", checkbox.checked);
        updateBatch();
      };
      leading.append(checkbox);
    }
    if (n.kind === "heading") {
      const fold = element("button", "fold", n.collapsed ? "▸" : "▾");
      fold.setAttribute(
        "aria-label",
        n.collapsed ? "展开此层级" : "折叠此层级",
      );
      fold.setAttribute("aria-expanded", String(!n.collapsed));
      fold.onclick = () => {
        n.collapsed = !n.collapsed;
        render();
        changed();
      };
      leading.append(fold);
    } else leading.append(element("span", "fold-spacer"));
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
      const nextId = doc().nodes[doc().nodes.indexOf(n) + 1]?.id;
      if (mergeMarkdown(n.id)) {
        const end = nextId
          ? doc().nodes.findIndex((node) => node.id === nextId)
          : doc().nodes.length;
        const last = doc().nodes[Math.max(0, end - 1)];
        if (last) focus(last.id, true);
      }
      changed();
    });
    content.addEventListener("blur", () => {
      setTimeout(() => {
        const target = document.activeElement?.closest(".content");
        if (target && target.dataset.id !== n.id && doc().nodes.includes(n)) {
          const targetId = target.dataset.id;
          if (mergeMarkdown(n.id)) focus(targetId);
        }
      }, 0);
    });
    const plus = element("button", "add-heading", "＋");
    plus.title = "添加条目或 Markdown 标题";
    plus.setAttribute("aria-label", "在此处添加标题或条目");
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
    if (page === "common") {
      const copyBranch = element("button", "row-action copy-branch", "复制");
      copyBranch.title = "复制当前条目及其子层级（含 Markdown 标题）";
      copyBranch.setAttribute("aria-label", "复制此条目及其子层级");
      copyBranch.onclick = () => copyText(subtreeMarkdown(doc().nodes, n.id));
      controls.append(copyBranch);
    }
    controls.append(plus, eye, remove);
    leading.append(mark);
    row.append(leading, content, controls);
    $("paper").append(row);
  }
  if (!doc().nodes.length) {
    const empty = element("div", "empty-document");
    const start = element("button", "", "＋ 添加条目");
    start.onclick = () => {
      active = null;
      addItem();
    };
    empty.append(start);
    $("paper").append(empty);
  }
  updateBatch();
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
    } else if (n.raw || hasBlockMarkdown(plain(n.html))) {
      row.querySelector(".marker").textContent = "MD";
      number = 0;
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
    localStorage.setItem(
      "prombee-draft",
      JSON.stringify({ state, revision, setId, fingerprint }),
    );
  } catch {}
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 250);
}
async function save() {
  if (!dirty || saveRunning || conflict || noSet) return;
  saveRunning = true;
  dirty = false;
  const payload = JSON.stringify({
    state,
    baseRevision: revision,
    setId,
    baseFingerprint: fingerprint,
  });
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
    fingerprint = result.fingerprint || fingerprint;
    $("status").textContent = "已保存到本机";
    if (!dirty) localStorage.removeItem("prombee-draft");
    else
      localStorage.setItem(
        "prombee-draft",
        JSON.stringify({ state, revision, setId, fingerprint }),
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
  closeMenu();
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
  const level = contextLevel(doc().nodes, id);
  $("menuContext").textContent = level
    ? `当前 H${level} · 可选择任意等级`
    : "当前为顶层";
  for (const button of menu.querySelectorAll("[data-level]")) {
    button.classList.toggle(
      "ancestor-level",
      Number(button.dataset.level) <= level,
    );
    button.classList.toggle(
      "current-level",
      Number(button.dataset.level) === level,
    );
  }
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
$("menuAddItem").onclick = () => {
  active = menuAnchor;
  addItem();
};
for (const b of $("headingMenu").querySelectorAll("[data-level]"))
  b.onclick = () => addHeading(Number(b.dataset.level));
function editKey(e, n, el) {
  if (e.isComposing) return;
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (mergeMarkdown(n.id)) {
      const nodes = doc().nodes,
        index = nodes.findIndex((node) => node.id === n.id);
      const next = nodes[index + 1] || nodes[index];
      focus(next.id, true);
      return;
    }
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
function mergeMarkdown(id) {
  const nodes = integrateMarkdown(doc().nodes, id);
  if (!nodes) return false;
  remember();
  doc().nodes = nodes;
  selection = null;
  render();
  changed();
  return true;
}
function integrateCurrent() {
  if (!editing() || noSet) return false;
  let modified = false;
  for (const id of doc().nodes.map((node) => node.id)) {
    const result = integrateMarkdown(doc().nodes, id);
    if (result) {
      remember();
      doc().nodes = result;
      modified = true;
      changed();
    }
  }
  return modified;
}
function updateBatch() {
  $("multiSelect").textContent = !multi
    ? "多选"
    : selected.size && selected.size === doc().nodes.length
      ? "取消全选"
      : "全选";
  $("multiSelect").setAttribute("aria-pressed", String(multi));
  $("batchControls").hidden = !multi;
  $("selectedCount").textContent = `已选 ${selected.size} 项`;
  $("batchDelete").disabled = $("batchExclude").disabled = !selected.size;
}
$("multiSelect").onclick = () => {
  if (!multi) {
    multi = true;
    selected.clear();
  } else if (selected.size === doc().nodes.length && selected.size) {
    multi = false;
    selected.clear();
  } else selected = new Set(doc().nodes.map((node) => node.id));
  render();
};
$("batchExclude").onclick = () => {
  if (!selected.size) return;
  remember();
  for (const node of doc().nodes)
    if (selected.has(node.id)) node.excluded = true;
  render();
  changed();
  toast("已排除所选条目及下级，可撤销");
};
$("batchDelete").onclick = () => {
  const ids = selectionScope(doc().nodes, selected);
  if (!ids.size) return;
  remember();
  doc().nodes = doc().nodes.filter((node) => !ids.has(node.id));
  selected.clear();
  active = null;
  selection = null;
  render();
  changed();
  toast(`已删除 ${ids.size} 项，可撤销`);
};
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
async function copyText(text) {
  try {
    if (window.webkit?.messageHandlers?.clipboard) {
      window.webkit.messageHandlers.clipboard.postMessage(text);
    } else {
      await navigator.clipboard.writeText(text);
    }
    toast("已复制提示词");
  } catch {
    const t = element("textarea");
    t.value = text;
    document.body.append(t);
    t.select();
    const ok = document.execCommand("copy");
    t.remove();
    toast(ok ? "已复制提示词" : "复制失败，请选中文字后按 Ctrl+C");
  }
}
function copy() {
  if (integrateCurrent()) render();
  return copyText(toMarkdown(doc().nodes));
}
function switchPage(next, roundId) {
  integrateCurrent();
  multi = false;
  selected.clear();
  if (next === "preview") previewSource = doc();
  histories.set(doc().id, { history, future });
  if (roundId) {
    state.current = roundId;
    $("compareLeft").value = "";
    $("compareRight").value = "";
  }
  page = next;
  ({ history, future } = histories.get(doc().id) || {
    history: [],
    future: [],
  });
  active = null;
  selection = null;
  closeMenu();
  render();
}
function fillRounds(select, fallback) {
  const value = select.value;
  select.replaceChildren();
  for (const d of state.documents) {
    const option = element("option", "", d.name);
    option.value = d.id;
    select.append(option);
  }
  select.value = state.documents.some((d) => d.id === value) ? value : fallback;
}
function updatePages() {
  for (const [id, target] of [
    ["template", "template"],
    ["editorTab", "editor"],
    ["preview", "preview"],
    ["compare", "compare"],
    ["commonTab", "common"],
    ["libraryTab", "library"],
  ]) {
    $(id).classList.toggle("selected-tab", page === target);
    $(id).setAttribute("aria-selected", String(page === target));
  }
  document.body.dataset.page = page;
  $("libraryPanel").hidden = page !== "library";
  for (const id of [
    "template",
    "editorTab",
    "compare",
    "preview",
    "commonTab",
    "newDoc",
    "documents",
    "copy",
  ])
    $(id).disabled = noSet;
  $("copy").hidden = page === "library";
  $("editorToolbar").hidden = !editing();
  $("editorPanel").hidden = !editing();
  $("previewToolbar").hidden = page !== "preview";
  $("previewPanel").hidden = page !== "preview";
  $("compareToolbar").hidden = page !== "compare";
  $("comparePanel").hidden = page !== "compare";
  $("hierarchyControls").hidden = page !== "template";
  $("copyAll").hidden = page !== "common";
  document.querySelector(".keys").hidden = !editing();
  $("paper").setAttribute(
    "aria-label",
    page === "template"
      ? "模板编辑区"
      : page === "common"
        ? "常用提示词编辑区"
        : "提示词编辑区",
  );
  fillRounds($("hierarchyRound"), currentDoc().id);
  fillRounds(
    $("compareLeft"),
    state.documents[state.documents.indexOf(currentDoc()) + 1]?.id ||
      currentDoc().id,
  );
  fillRounds($("compareRight"), currentDoc().id);
  if (page === "preview") updatePreview();
  if (page === "compare") updateComparison();
}
function updatePreview() {
  const text = toMarkdown(doc().nodes);
  const raw = $("previewMode").value === "raw";
  $("previewRendered").classList.toggle("active", !raw);
  $("previewRaw").classList.toggle("active", raw);
  $("previewRendered").setAttribute("aria-pressed", String(!raw));
  $("previewRaw").setAttribute("aria-pressed", String(raw));
  $("rawMarkdown").hidden = !raw;
  $("previewContent").hidden = raw;
  $("rawMarkdown").textContent = text;
  if (text) renderMarkdown(text, $("previewContent"));
  else $("previewContent").textContent = "没有参与复制的内容。";
}
function updateComparison() {
  const left = state.documents.find((d) => d.id === $("compareLeft").value);
  const right = state.documents.find((d) => d.id === $("compareRight").value);
  $("leftTitle").textContent = left.name;
  $("rightTitle").textContent = right.name;
  renderComparison(
    toMarkdown(left.nodes),
    toMarkdown(right.nodes),
    $("diffRows"),
  );
  requestAnimationFrame(() => {
    const scroll = $("diffScroll");
    document.documentElement.style.setProperty(
      "--compare-scrollbar",
      scroll.offsetWidth - scroll.clientWidth + "px",
    );
  });
}
$("newDoc").onclick = () => {
  const d = {
    id: uid(),
    name: nextRoundName(state.documents),
    nodes: hierarchyNodes(state.template.nodes),
  };
  state.documents.unshift(d);
  switchPage("editor", d.id);
  if (d.nodes.length) focus((d.nodes[1] || d.nodes[0]).id);
  changed();
};
$("documents").onchange = () => {
  switchPage("editor", $("documents").value);
  changed();
};
$("template").onclick = () => switchPage("template");
$("editorTab").onclick = () => switchPage("editor");
$("preview").onclick = () => switchPage("preview");
$("compare").onclick = () => switchPage("compare");
$("commonTab").onclick = () => switchPage("common");
$("copyAll").onclick = copy;
$("previewMode").onchange = updatePreview;
$("previewRendered").onclick = () => {
  $("previewMode").value = "rendered";
  updatePreview();
};
$("previewRaw").onclick = () => {
  $("previewMode").value = "raw";
  updatePreview();
};
$("compareLeft").onchange = updateComparison;
$("compareRight").onchange = updateComparison;
$("copyHierarchy").onclick = () => {
  const source = state.documents.find(
    (d) => d.id === $("hierarchyRound").value,
  );
  remember();
  state.template.nodes = hierarchyNodes(source.nodes);
  active = null;
  selection = null;
  render();
  changed();
  toast(`已复制${source.name}的标题层级，可撤销`);
};
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
$("deleteEmpty").onclick = deleteEmpty;
$("undo").onclick = undo;
$("redo").onclick = redo;
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
  if (!(e.ctrlKey || e.metaKey)) return;
  const k = e.key.toLowerCase();
  if (k === "s") {
    e.preventDefault();
    save();
  }
  if (k === "n") {
    e.preventDefault();
    $("newDoc").click();
  }
  if (editing() && (k === "b" || k === "i")) {
    e.preventDefault();
    format(k === "b" ? "bold" : "italic");
  }
  if (k === "c" && e.shiftKey) {
    e.preventDefault();
    copy();
  }
  if (editing() && k === "z") {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  }
  if (editing() && k === "y") {
    e.preventDefault();
    redo();
  }
});
window.addEventListener("pagehide", () => {
  if (dirty && !conflict)
    navigator.sendBeacon(
      "/api/state",
      JSON.stringify({
        state,
        baseRevision: revision,
        setId,
        baseFingerprint: fingerprint,
      }),
    );
});
async function flushWorkspace() {
  clearTimeout(saveTimer);
  if (!saveRunning) await save();
  let attempts = 0;
  while (saveRunning && attempts++ < 300)
    await new Promise((resolve) => setTimeout(resolve, 30));
  if (dirty && !conflict && !saveRunning) await save();
  if (dirty || conflict || saveRunning)
    throw new Error("当前内容尚未保存，请先复制内容并检查保存状态");
}
function acceptWorkspace(data) {
  state = data.state;
  revision = data.revision;
  setId = data.set?.id || null;
  fingerprint = data.fingerprint || null;
  noSet = false;
  dirty = false;
  conflict = false;
  active = null;
  selection = null;
  history = [];
  future = [];
  histories.clear();
  selected.clear();
  multi = false;
  if (!state.template) {
    state.template = {
      id: "template",
      name: "模板",
      nodes: hierarchyNodes(currentDoc().nodes),
    };
  }
  if (!state.common) {
    state.common = {
      id: "common",
      name: "常用提示词",
      nodes: [makeNode("heading", 1, "常用提示词"), makeNode()],
    };
  }
  for (const collection of state.documents) {
    if (collection.fromText) {
      const original = collection.nodes;
      for (const node of original) {
        const candidate = collection.nodes.map((n) =>
          n.id === node.id ? { ...n, raw: false } : n,
        );
        const integrated = integrateMarkdown(candidate, node.id);
        if (integrated) collection.nodes = integrated;
      }
      delete collection.fromText;
    }
  }
  page = "editor";
  previewSource = null;
  $("compareLeft").value = "";
  $("compareRight").value = "";
  render();
  $("status").textContent = data.set
    ? "已保存 · " + data.set.name + ".txt"
    : "已保存到本机";
  $("status").title = data.set?.path || "";
  if (dirty) changed();
}
try {
  const r = await fetch("/api/state");
  const data = await r.json();
  if (!r.ok) {
    acceptWorkspace({
      revision: 0,
      state: {
        documents: [{ id: "empty", name: "第1轮", nodes: [] }],
        current: "empty",
        dark: false,
        font: "sans-serif",
        size: 14,
      },
    });
    noSet = true;
    setId = null;
    page = "library";
    render();
    $("status").textContent = "请选择或新建词集";
  } else acceptWorkspace(data);
  let draft;
  try {
    draft = JSON.parse(localStorage.getItem("prombee-draft"));
  } catch {}
  if (
    !noSet &&
    draft?.state &&
    draft.revision === revision &&
    (draft.setId
      ? draft.setId === setId
      : !data.set || data.set.name === "当前词集") &&
    (!draft.fingerprint || draft.fingerprint === fingerprint)
  ) {
    state = draft.state;
    dirty = true;
    render();
    changed();
    toast("已恢复上次未完成保存的编辑");
  }
  libraryUI = createLibraryUI({
    beforeAction: flushWorkspace,
    onOpen: acceptWorkspace,
    getSetId: () => setId,
    onLocation: (entry) => {
      if (!entry) return;
      $("status").title = entry.path;
      if (!dirty && !conflict && !saveRunning)
        $("status").textContent = "已保存 · " + entry.name + ".txt";
    },
    notify: toast,
    showEditor: () => switchPage("editor"),
    onEmpty: () => {
      noSet = true;
      dirty = false;
      setId = null;
      switchPage("library");
      $("status").textContent = "请新建或打开词集";
    },
  });
  $("libraryTab").onclick = () => {
    switchPage("library");
    libraryUI.begin();
    libraryUI.refresh();
  };
  await libraryUI.refresh();
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
    if (devStamp && devStamp !== value.stamp && !dirty && !saveRunning)
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
