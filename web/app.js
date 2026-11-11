import { mountDropdowns } from "./dropdowns.js";
import {
  prepareFormatting,
  restoreFormattingCaret,
  readFormatting,
} from "./formatting.js";
import { mountButtonStyles } from "./buttons.js";
import { mountBars } from "./bars.js";
import { mountOtherSettings } from "./other.js";
import { mountUpdates } from "./updates.js";
import { moveSubtree, bindHoldDrag } from "./reorder.js";
import {
  mountShortcuts,
  DEFAULT_SHORTCUTS,
  keyCombo,
  displayCombo,
  shortcutTitle,
} from "./shortcuts.js";
import { mountEdgeNavigation } from "./edge-navigation.js";
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
import { bindSpeech } from "./speech.js";
import { createLibraryUI } from "./library.js";
const $ = (id) => document.getElementById(id);
const bars = mountBars();
mountButtonStyles();
const dropdowns = mountDropdowns();
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
const settingsPages = ["shortcuts", "floating", "updates", "other"];
let lastSettingsPage = "shortcuts";
let keyboardInsert = false,
  keyboardLevel = 0,
  shortcutBindings = { ...DEFAULT_SHORTCUTS };
let sorting = null;
const histories = new Map();
const editorViews = new Map();
const emptyRound = { id: "no-round", name: "", nodes: [] };
const currentDoc = () =>
  state.documents.find((d) => d.id === state.current) ||
  state.documents[0] ||
  emptyRound;
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
const speech = bindSpeech({
  button: $("voiceInput"),

  notify: toast,
  capture: () => {
    if (!editing()) return null;
    const node = doc().nodes.find((node) => node.id === active);
    return node
      ? { collection: doc(), node, focus: () => focus(node.id, true) }
      : null;
  },
  commit: (target, text) => {
    const { collection, node } = target;
    if (
      ![...state.documents, state.template, state.common].includes(
        collection,
      ) ||
      !collection.nodes.includes(node)
    ) {
      toast("原条目已删除或词集已切换，听写文字：" + text);
      $("speechResult").hidden = false;
      $("speechResult").value = text;
      return;
    }
    // Preserve edits made while dictating and never insert recognition as HTML.
    if (doc() === collection) remember();
    const span = document.createElement("span");
    span.textContent = text;
    node.html = cleanHTML(node.html + span.outerHTML);
    if (doc() === collection) {
      render();
      focus(node.id, true);
    }
    changed();
  },
});
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
  let inverse;
  if (snapshot?.action === "restoreRound") {
    inverse = { action: "deleteRound", id: snapshot.document.id };
    histories.delete(currentDoc().id);
    state.documents.splice(
      Math.min(snapshot.index, state.documents.length),
      0,
      structuredClone(snapshot.document),
    );
    state.current = snapshot.document.id;
    histories.delete(state.current);
  } else if (snapshot?.action === "deleteRound") {
    const index = state.documents.findIndex((d) => d.id === snapshot.id);
    if (index < 0) return null;
    inverse = {
      action: "restoreRound",
      index,
      document: structuredClone(state.documents[index]),
    };
    state.documents.splice(index, 1);
    histories.delete(snapshot.id);
    state.current =
      state.documents[Math.min(index, state.documents.length - 1)]?.id || null;
    histories.delete(state.current);
  } else {
    inverse = JSON.stringify(doc());
    if (page === "template") state.template = JSON.parse(snapshot);
    else if (page === "common") state.common = JSON.parse(snapshot);
    else
      state.documents[state.documents.indexOf(currentDoc())] =
        JSON.parse(snapshot);
  }
  active = null;
  selection = null;
  if (snapshot?.action) {
    selected.clear();
    multi = false;
  }
  render();
  changed();
  return inverse;
}
function undo() {
  if (!history.length) return;
  const inverse = restore(history.pop());
  if (inverse) future.push(inverse);
  buttons();
}
function redo() {
  if (!future.length) return;
  const inverse = restore(future.pop());
  if (inverse) history.push(inverse);
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
    const o = element("option", "", d.name.replace(/^第\s*/, ""));
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
    const drag = element("button", "drag-handle", "⠿");
    drag.setAttribute("aria-label", "拖动排序");
    drag.title = shortcutTitle("拖动排序", "drag", shortcutBindings);
    leading.append(drag);
    bindHoldDrag(
      row,
      {
        start: () => beginSort(n.id, false),
        move: (x, y) => pointerSort(x, y),
        end: (cancel) => finishSort(cancel),
      },
      drag,
    );
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
      fold.title = shortcutTitle(
        n.collapsed ? "展开" : "折叠",
        "fold",
        shortcutBindings,
      );
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
    content.setAttribute("contenteditable", "true");
    content.spellcheck = false;
    content.dataset.id = n.id;
    content.dataset.placeholder =
      n.kind === "heading" ? "标题正文" : "写下一条要求…";
    content.setAttribute("role", "textbox");
    content.setAttribute("aria-multiline", "true");
    content.setAttribute(
      "aria-label",
      n.kind === "heading" ? `H${n.level} 条目` : "正文条目",
    );
    content.innerHTML = cleanHTML(n.html);
    content.onfocus = () => {
      active = n.id;
      syncToolbar(content);
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
    plus.title = shortcutTitle("添加", "insert", shortcutBindings);
    plus.setAttribute("aria-label", "添加");
    plus.onclick = (e) => openMenu(n.id, e.currentTarget);
    const controls = element("div", "row-controls");
    const visibilityState = visibilityStates.get(n.id);
    const eye = element("button", "row-action eye");
    eye.innerHTML = visibilityState.excluded
      ? '<svg viewBox="0 0 24 24"><path d="M3 3l18 18M10 5c5-1 9 3 12 7-1 2-3 4-5 5M7 7c-3 1-5 3-7 5 3 4 7 7 12 7 2 0 3 0 4-1"/></svg>'
      : '<svg viewBox="0 0 24 24"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
    eye.setAttribute("aria-label", "排除");
    eye.setAttribute("aria-pressed", String(visibilityState.excluded));
    eye.title = shortcutTitle("排除", "exclude", shortcutBindings);
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
    remove.setAttribute("aria-label", "删除");
    remove.title = shortcutTitle("删除", "delete", shortcutBindings);
    remove.onclick = () => deleteNode(n.id);
    if (page === "common") {
      const copyBranch = element("button", "row-action copy-branch", "复制");
      copyBranch.title = "复制当前条目及其子层级（含 Markdown 标题）";
      copyBranch.setAttribute("aria-label", "复制此条目及其子层级");
      copyBranch.onclick = () =>
        copyText(subtreeMarkdown(doc().nodes, n.id, copyOptions()));
      controls.append(copyBranch);
    }
    controls.append(plus, eye, remove);
    leading.append(mark);
    row.append(leading, content, controls);
    $("paper").append(row);
  }
  if (!doc().nodes.length) {
    const empty = element("div", "empty-document");
    const start = element(
      "button",
      "",
      state.documents.length || page !== "editor"
        ? "＋ 添加条目"
        : "＋ 新建一轮",
    );
    start.onclick = () => {
      if (!state.documents.length && page === "editor") $("newDoc").click();
      else {
        active = null;
        addItem();
      }
    };
    empty.append(start);
    $("paper").append(empty);
  }
  updateBatch();
  renumber();
  buttons();
  refreshShortcutHints();
  if (active) syncToolbar(contentFor(active));
  dropdowns.sync();
}
function renumber() {
  let number = 0,
    characters = 0;
  const rows = new Map(
    [...$("paper").children].map((row) => [row.dataset.id, row]),
  );
  for (const n of doc().nodes) {
    const row = rows.get(n.id);
    if (!row) continue;
    const text = plain(n.html);
    characters += text.length;
    let marker;
    if (n.kind === "heading") {
      number = 0;
      marker = "H" + n.level;
    } else if (
      otherUI.recognizeMarkdown() &&
      (n.raw || hasBlockMarkdown(text))
    ) {
      marker = "MD";
      number = 0;
    } else marker = text.trim() ? `${++number}.` : "·";
    const field = row.querySelector(".marker");
    if (field.textContent !== marker) field.textContent = marker;
  }
  $("stats").textContent = `${doc().nodes.length} 个条目 · ${characters} 字`;
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
    syncToolbar(el);
  }
}
document.addEventListener("selectionchange", saveSelection);
function syncToolbar(el) {
  if (!el) return;
  const info = readFormatting(el),
    node = doc().nodes.find((n) => n.id === el.dataset.id);
  if (info.font) {
    if (![...$("font").options].some((o) => o.value === info.font)) {
      const option = element("option", "", info.font);
      option.value = info.font;
      $("font").append(option);
    }
    $("font").value = info.font;
  }
  if (Number.isFinite(info.size) && info.size > 0)
    $("size").value = Math.round(info.size * 10) / 10;
  if (info.color) {
    $("color").value = info.color;
    document.documentElement.style.setProperty("--chosen-color", info.color);
  }
  for (const [id, on] of [
    ["bold", info.bold],
    ["italic", info.italic],
  ]) {
    $(id).classList.toggle("active", on);
    $(id).setAttribute("aria-pressed", String(on));
  }
  if (node)
    $("headingLevel").value =
      node.kind === "heading" ? String(node.level) : "0";
}
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
function spanStyle(property, value) {
  const el = restoreSelection();
  if (!el) return false;
  const target = prepareFormatting(el);
  const s = window.getSelection();
  if (s.isCollapsed) {
    if (property) {
      remember();
      const span = element("span");
      span.style[property] = value;
      span.append(document.createElement("br"));
      el.replaceChildren(span);
      const range = document.createRange();
      range.setStart(span, 0);
      range.collapse(true);
      s.removeAllRanges();
      s.addRange(range);
      commitActive(el);
      syncToolbar(el);
    }
    return true;
  }
  remember();
  const range = s.getRangeAt(0),
    span = element("span");
  if (property) span.style[property] = value;
  const allText = range.toString() === el.textContent;
  let fragment;
  if (allText) {
    fragment = document.createDocumentFragment();
    while (el.firstChild) fragment.append(el.firstChild);
  } else fragment = range.extractContents();
  for (const child of [...fragment.querySelectorAll("*")]) {
    if (property) {
      child.style[property] = "";
      if (property === "fontFamily") child.removeAttribute("face");
      if (property === "fontSize") child.removeAttribute("size");
      if (property === "color") child.removeAttribute("color");
    } else child.removeAttribute("style");
    if (
      (!property && ["B", "STRONG", "I", "EM", "U"].includes(child.tagName)) ||
      (property === "fontWeight" && ["B", "STRONG"].includes(child.tagName)) ||
      (property === "fontStyle" && ["I", "EM"].includes(child.tagName))
    )
      child.replaceWith(...child.childNodes);
  }
  span.append(fragment);
  if (allText) el.append(span);
  else range.insertNode(span);
  range.selectNodeContents(span);
  s.removeAllRanges();
  s.addRange(range);
  selection = range.cloneRange();
  commitActive(el);
  restoreFormattingCaret(el, target);
  saveSelection();
  syncToolbar(el);
  return true;
}
let templateSourceSignature = null;
function syncLatestTemplate() {
  if (!state?.template || !state.documents.length) return;
  const latest = state.documents.reduce((a, b) =>
    Number(/^第\s*(\d+)/.exec(b.name)?.[1] || 0) >
    Number(/^第\s*(\d+)/.exec(a.name)?.[1] || 0)
      ? b
      : a,
  );
  const headings = latest.nodes.filter((n) => n.kind === "heading");
  const signature = JSON.stringify([
    latest.id,
    headings.map((n) => [n.level, n.html]),
  ]);
  if (signature === templateSourceSignature) return;
  templateSourceSignature = signature;
  state.template.nodes = hierarchyNodes(latest.nodes);
}
function changed() {
  if (page !== "template") syncLatestTemplate();
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
  keyboardInsert = true;
  keyboardLevel = 0;
  for (const button of $("headingMenu").querySelectorAll("button")) {
    button.classList.remove("keyboard-choice");
    button.setAttribute("aria-current", "false");
  }
  menuAnchor = id;
  const menu = $("headingMenu");
  menu.hidden = false;
  selectKeyboardLevel();
  const level = contextLevel(doc().nodes, id);
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
  keyboardInsert = false;
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
  if (
    ["Backspace", "Delete"].includes(e.key) &&
    !e.ctrlKey &&
    !e.altKey &&
    !e.metaKey &&
    !plain(el.innerHTML).trim()
  ) {
    e.preventDefault();
    deleteNode(n.id, false);
  }
}
function mergeMarkdown(id) {
  if (!otherUI.recognizeMarkdown()) return false;
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
  if (!editing() || noSet || !otherUI.recognizeMarkdown()) return false;
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
  captureEditorView();
  const view = editorViews.get(viewKey());
  if (!multi) {
    multi = true;
    selected.clear();
  } else if (selected.size === doc().nodes.length && selected.size) {
    multi = false;
    selected.clear();
  } else selected = new Set(doc().nodes.map((node) => node.id));
  render();
  restoreEditorView(view);
};
$("batchExclude").onclick = () => {
  if (!selected.size) return;
  remember();
  const excluded = !doc()
    .nodes.filter((node) => selected.has(node.id))
    .every((node) => node.excluded);
  for (const node of doc().nodes)
    if (selected.has(node.id)) node.excluded = excluded;
  render();
  changed();
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
};
function deleteNode(id, subtree = true) {
  const nodes = doc().nodes,
    index = nodes.findIndex((n) => n.id === id);
  if (index < 0) return;
  remember();
  const count = subtree ? scopeEnd(nodes, index) - index : 1;
  nodes.splice(index, count);
  active = null;
  selection = null;
  render();
  if (nodes.length) focus(nodes[Math.min(index, nodes.length - 1)].id);
  changed();
}
function copyOptions() {
  return {
    removeEmpty: state.removeEmptyOnCopy === true,
    recognizeMarkdown: otherUI.recognizeMarkdown(),
  };
}
function deleteEmpty() {
  state.removeEmptyOnCopy = !state.removeEmptyOnCopy;
  $("deleteEmpty").setAttribute(
    "aria-pressed",
    String(state.removeEmptyOnCopy),
  );
  changed();
}
let copyFeedbackTimer;
function copiedFeedback() {
  clearTimeout(copyFeedbackTimer);
  $("copy").classList.add("copied");
  copyFeedbackTimer = setTimeout(
    () => $("copy").classList.remove("copied"),
    1400,
  );
}
function nativeClipboard(text) {
  return new Promise((resolve, reject) => {
    const id = uid();
    const done = (event) => {
      if (event.detail?.id !== id) return;
      cleanup();
      event.detail.ok ? resolve() : reject(Error("剪贴板写入失败"));
    };
    const cleanup = () => {
      clearTimeout(timer);
      window.removeEventListener("prombee-clipboard", done);
    };
    const timer = setTimeout(() => {
      cleanup();
      reject(Error("剪贴板写入超时"));
    }, 3000);
    window.addEventListener("prombee-clipboard", done);
    try {
      window.webkit.messageHandlers.clipboardWrite.postMessage(
        JSON.stringify({ id, text }),
      );
    } catch (error) {
      cleanup();
      reject(error);
    }
  });
}
async function copyText(text, { jump = true, quiet = false } = {}) {
  let success = false;
  try {
    if (window.webkit?.messageHandlers?.clipboardWrite)
      await nativeClipboard(text);
    else if (window.pywebview?.api?.clipboard)
      await window.pywebview.api.clipboard(text);
    else await navigator.clipboard.writeText(text);
    success = true;
  } catch {
    const previous = document.activeElement,
      ranges = [...Array(window.getSelection().rangeCount)].map((_, i) =>
        window.getSelection().getRangeAt(i).cloneRange(),
      );
    const t = element("textarea");
    t.value = text;
    document.body.append(t);
    t.select();
    try {
      success = document.execCommand("copy");
    } catch {
    } finally {
      t.remove();
      previous?.focus();
      const selected = window.getSelection();
      selected.removeAllRanges();
      for (const range of ranges) selected.addRange(range);
    }
  }
  if (!success) {
    toast("复制失败，条目已保留");
    return false;
  }
  if (!quiet) {
    copiedFeedback();
    toast("已复制提示词");
  }
  if (jump) {
    try {
      await otherUI.afterCopy();
    } catch (error) {
      toast("已复制，" + error.message);
    }
  }
  return true;
}
let cutRunning = false;
async function cutEntry(id) {
  if (cutRunning) return;
  const current = doc(),
    node = current.nodes.find((n) => n.id === id);
  if (!node) return;
  const snapshot = JSON.stringify(node);
  cutRunning = true;
  try {
    const text = toMarkdown([{ ...node, excluded: false }], {
      removeEmpty: false,
      recognizeMarkdown: otherUI.recognizeMarkdown(),
    });
    if (!(await copyText(text, { jump: false, quiet: true }))) return;
    // Keep new edits intact if focus/content changed while the clipboard was pending.
    if (
      !editing() ||
      doc() !== current ||
      JSON.stringify(current.nodes.find((n) => n.id === id)) !== snapshot
    )
      return;
    deleteNode(id, false);
  } finally {
    cutRunning = false;
  }
}

function copy() {
  if (integrateCurrent()) render();
  return copyText(toMarkdown(doc().nodes, copyOptions()));
}
function viewKey() {
  return `${page}:${doc().id}`;
}
function captureEditorView() {
  if (!editing()) return;
  const field = contentFor(active),
    range = selection;
  const path = (node) => {
    const result = [];
    while (node && node !== field) {
      const parent = node.parentNode;
      if (!parent) return null;
      result.unshift([...parent.childNodes].indexOf(node));
      node = parent;
    }
    return node === field ? result : null;
  };
  let caret = null;
  if (field && range && field.contains(range.commonAncestorContainer)) {
    caret = {
      start: path(range.startContainer),
      startOffset: range.startOffset,
      end: path(range.endContainer),
      endOffset: range.endOffset,
    };
  }
  editorViews.set(viewKey(), {
    top: document.querySelector("main").scrollTop,
    active,
    caret,
    multi,
    selected: [...selected],
  });
}
function restoreEditorView(view) {
  if (!view) {
    document.querySelector("main").scrollTop = 0;
    return;
  }
  const field = contentFor(view.active);
  if (field) {
    field.focus({ preventScroll: true });
    active = view.active;
    if (view.caret) {
      const resolve = (path) =>
        path?.reduce((node, index) => node?.childNodes[index], field);
      const start = resolve(view.caret.start),
        end = resolve(view.caret.end);
      if (start && end) {
        const range = document.createRange(),
          limit = (node) =>
            node.nodeType === 3 ? node.length : node.childNodes.length;
        range.setStart(start, Math.min(view.caret.startOffset, limit(start)));
        range.setEnd(end, Math.min(view.caret.endOffset, limit(end)));
        const selectedRange = window.getSelection();
        selectedRange.removeAllRanges();
        selectedRange.addRange(range);
        selection = range.cloneRange();
      }
    }
  }
  const key = viewKey(),
    main = document.querySelector("main");
  main.scrollTop = view.top;
  requestAnimationFrame(() => {
    if (viewKey() === key && editing()) main.scrollTop = view.top;
  });
}
function switchPage(next, roundId) {
  if (next === page && (!roundId || roundId === state.current)) return;
  speech.stop();
  captureEditorView();
  integrateCurrent();
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
  const view = editing() ? editorViews.get(viewKey()) : null;
  multi = !!view?.multi;
  selected = new Set(
    (view?.selected || []).filter((id) => doc().nodes.some((n) => n.id === id)),
  );
  active = null;
  selection = null;
  closeMenu();
  render();
  if (editing()) restoreEditorView(view);
  else document.querySelector("main").scrollTop = 0;
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
  $("deleteEmpty").setAttribute(
    "aria-pressed",
    String(state.removeEmptyOnCopy === true),
  );
  for (const [id, target] of [
    ["template", "template"],
    ["editorTab", "editor"],
    ["preview", "preview"],
    ["compare", "compare"],
    ["commonTab", "common"],
    ["libraryTab", "library"],
    ["shortcutsTab", "shortcuts"],
  ]) {
    $(id).classList.toggle("selected-tab", page === target);
    $(id).setAttribute("aria-selected", String(page === target));
  }
  document.body.dataset.page = page;
  $("libraryPanel").hidden = page !== "library";
  $("shortcutsPanel").hidden = page !== "shortcuts";
  $("floatingPanel").hidden = page !== "floating";
  $("updatesPanel").hidden = page !== "updates";
  $("otherPanel").hidden = page !== "other";
  $("settingsToolbar").hidden = !settingsPages.includes(page);
  $("settingsTab").setAttribute(
    "aria-selected",
    String(settingsPages.includes(page)),
  );
  for (const [id, target] of [
    ["shortcutsTab", "shortcuts"],
    ["floatingButton", "floating"],
    ["updatesTab", "updates"],
    ["otherTab", "other"],
  ]) {
    $(id).setAttribute("aria-selected", String(page === target));
  }
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
  $("copy").hidden = ["library", ...settingsPages].includes(page);
  $("editorToolbar").hidden = !editing();
  $("editorPanel").hidden = !editing();
  $("previewToolbar").hidden = page !== "preview";
  $("previewPanel").hidden = page !== "preview";
  $("compareToolbar").hidden = page !== "compare";
  $("comparePanel").hidden = page !== "compare";
  $("hierarchyControls").hidden = page !== "template";
  $("copyAll").hidden = page !== "common";
  $("copyHierarchy").disabled = $("hierarchyRound").disabled =
    !state.documents.length;
  $("deleteRound").hidden = false;
  $("deleteRound").disabled = noSet || !state.documents.length;
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
  bars.show(page);
  if (page === "preview") updatePreview();
  if (page === "compare") updateComparison();
}
function updatePreview() {
  const text = toMarkdown(doc().nodes, copyOptions());
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
  $("leftTitle").textContent = left?.name || "暂无轮次";
  $("rightTitle").textContent = right?.name || "暂无轮次";
  renderComparison(
    toMarkdown(left?.nodes || [], copyOptions()),
    toMarkdown(right?.nodes || [], copyOptions()),
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
  syncLatestTemplate();
  const d = {
    id: uid(),
    name: nextRoundName(state.documents),
    nodes: hierarchyNodes(state.template.nodes),
  };
  if (!state.documents.length && doc().id === emptyRound.id) {
    histories.set(emptyRound.id, { history, future });
    history = [];
    future = [];
  }
  state.documents.unshift(d);
  switchPage("editor", d.id);
  if (d.nodes.length) focus((d.nodes[1] || d.nodes[0]).id);
  changed();
};
$("deleteRound").onclick = () => {
  if (noSet || !state.documents.length) return;
  if (page !== "editor") switchPage("editor");
  integrateCurrent();
  const current = currentDoc(),
    index = state.documents.indexOf(current);
  // Round actions affect only the deleted round, never snapshots of other rounds.
  const deletions = history.filter((entry) => entry?.action);
  const snapshot = {
    action: "restoreRound",
    index,
    document: structuredClone(current),
  };
  histories.delete(current.id);
  state.documents.splice(index, 1);
  state.current =
    state.documents[Math.min(index, state.documents.length - 1)]?.id || null;
  histories.delete(state.current);
  history = [...deletions, snapshot];
  future = [];
  active = null;
  selection = null;
  selected.clear();
  multi = false;
  $("compareLeft").value = "";
  $("compareRight").value = "";
  render();
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
  if (!source) return;
  remember();
  state.template.nodes = hierarchyNodes(source.nodes);
  active = null;
  selection = null;
  render();
  changed();
  toast(`已复制${source.name}的标题层级，可撤销`);
};
$("copy").onclick = copy;
async function floatingSettings(enabled) {
  const response = await fetch(
    "/api/floating",
    enabled === undefined
      ? undefined
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        },
  );
  const value = await response.json();
  if (!response.ok) throw Error(value.error || "悬浮球设置保存失败");
  $("floatingEnabled").checked = value.enabled !== false;
  window.dispatchEvent(
    new window.CustomEvent("prombee-floating-enabled", {
      detail: value.enabled !== false,
    }),
  );
}
let floatingReady = floatingSettings().catch(() => {});
$("floatingEnabled").onchange = async () => {
  const enabled = $("floatingEnabled").checked;
  $("floatingEnabled").disabled = true;
  try {
    await floatingReady;
    await floatingSettings(enabled);
    $("floatingStatus").textContent = "";
  } catch (error) {
    $("floatingEnabled").checked = !enabled;
    $("floatingStatus").textContent = error.message;
  } finally {
    $("floatingEnabled").disabled = false;
  }
};
$("theme").onclick = () => {
  state.dark = !state.dark;
  applyTheme();
  if (active) syncToolbar(contentFor(active));
  changed();
};
$("bold").onmousedown = (e) => e.preventDefault();
$("italic").onmousedown = (e) => e.preventDefault();
$("clear").onmousedown = (e) => e.preventDefault();
$("bold").onclick = () =>
  spanStyle(
    "fontWeight",
    readFormatting(contentFor(active))?.bold ? "400" : "700",
  );
$("italic").onclick = () =>
  spanStyle(
    "fontStyle",
    readFormatting(contentFor(active))?.italic ? "normal" : "italic",
  );
$("clear").onclick = () => spanStyle(null, null);
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
  spanStyle("color", $("color").value);
};
$("headingLevel").onchange = () => {
  if ($("headingLevel").value === "") return;
  const level = Number($("headingLevel").value),
    n = doc().nodes.find((n) => n.id === active);
  if (!n) {
    $("headingLevel").value = "0";
    return;
  }
  remember();
  n.kind = level ? "heading" : "item";
  n.level = level || 1;
  n.collapsed = false;
  render();
  focus(n.id);
  changed();
};
$("deleteEmpty").onclick = deleteEmpty;
$("undo").onclick = undo;
$("redo").onclick = redo;
$("shortcutsTab").onclick = () => {
  lastSettingsPage = "shortcuts";
  switchPage("shortcuts");
};
$("floatingButton").onclick = () => {
  lastSettingsPage = "floating";
  switchPage("floating");
};
const updaterUI = mountUpdates({ beforeInstall: flushWorkspace });
const otherUI = mountOtherSettings({
  onMarkdownChange(enabled) {
    if (state && enabled && integrateCurrent()) render();
    else if (state) renumber();
  },
});
$("otherTab").onclick = () => {
  lastSettingsPage = "other";
  switchPage("other");
  otherUI.show();
};
$("updatesTab").onclick = () => {
  lastSettingsPage = "updates";
  switchPage("updates");
  updaterUI.show();
};
$("settingsTab").onclick = () => {
  switchPage(lastSettingsPage);
  if (lastSettingsPage === "updates") updaterUI.show();
  if (lastSettingsPage === "other") otherUI.show();
};
const shortcutsUI = mountShortcuts($("shortcutsPanel"), {
  onChange: (bindings) => {
    shortcutBindings = bindings;
    if ($("insertShortcutHint"))
      $("insertShortcutHint").textContent = bindings.insert
        ? `添加：${displayCombo(bindings.insert)} → 1–6 立即创建；↑↓ 选择，Enter 添加正文，Esc 取消。`
        : "添加快捷键未设置";
    refreshShortcutHints();
    window.webkit?.messageHandlers?.shortcutHints?.postMessage(
      JSON.stringify({ collapse: bindings.collapse }),
    );
  },
});
function refreshShortcutHints() {
  for (const [id, action, name] of [
    ["libraryTab", "library", "文件"],
    ["template", "template", "模板"],
    ["newDoc", "newRound", "新建"],
    ["editorTab", "editor", "编写"],
    ["compare", "compare", "历史"],
    ["preview", "preview", "预览"],
    ["commonTab", "common", "常用"],
    ["settingsTab", "settings", "设置"],
    ["theme", "theme", "主题"],
    ["copy", "copy", "复制提示词"],
    ["multiSelect", "multi", $("multiSelect").textContent],
    ["deleteEmpty", "deleteEmpty", "排除空项"],
    ["undo", "undo", "撤销"],
    ["redo", "redo", "重做"],
    ["bold", "bold", "粗体"],
    ["italic", "italic", "斜体"],
    ["voiceInput", "voice", "语音输入"],
    ["copyAll", "copyAll", "全部复制"],
    ["deleteRound", "deleteRound", "删除"],
  ]) {
    $(id).dataset.shortcutAction = action;
    $(id).dataset.shortcutName = name;
    $(id).title = shortcutTitle(name, action, shortcutBindings);
  }
  for (const [selector, action, name] of [
    [".add-heading", "insert", "添加"],
    [".eye", "exclude", "排除"],
    [".remove", "delete", "删除"],
    [".fold", "fold", null],
    [".drag-handle", "drag", "拖动排序"],
  ])
    for (const button of $("paper").querySelectorAll(selector))
      button.title = shortcutTitle(
        name ||
          (button.getAttribute("aria-expanded") === "true" ? "折叠" : "展开"),
        action,
        shortcutBindings,
      );
  const minimize = document.getElementById("minimizeWindow");
  if (minimize)
    minimize.title = shortcutTitle("最小化", "collapse", shortcutBindings);
}
document.addEventListener("mouseover", (event) => {
  const button = event.target.closest?.("[data-shortcut-action]");
  if (button)
    button.title = shortcutTitle(
      button.id === "multiSelect"
        ? button.textContent.trim()
        : button.dataset.shortcutName,
      button.dataset.shortcutAction,
      shortcutBindings,
    );
});
function beginKeyboardInsert() {
  if (!editing() || noSet) return;
  const node =
    doc().nodes.find((node) => node.id === active) || doc().nodes.at(-1);
  active = node?.id || null;
  openMenu(
    active,
    contentFor(active)?.closest(".row").querySelector(".add-heading") ||
      $("newDoc"),
  );
  keyboardInsert = true;
  keyboardLevel = 0;
  selectKeyboardLevel();
}
function selectKeyboardLevel() {
  for (const button of $("headingMenu").querySelectorAll("button")) {
    const chosen = keyboardLevel
      ? Number(button.dataset.level) === keyboardLevel
      : button.id === "menuAddItem";
    button.classList.toggle("keyboard-choice", chosen);
    button.setAttribute("aria-current", String(chosen));
  }
}
function confirmInsert() {
  const level = keyboardLevel;
  if (page === "editor" && !state.documents.length) {
    $("newDoc").click();
    active = doc().nodes.at(-1)?.id || null;
    menuAnchor = active;
  }
  active = menuAnchor;
  level ? addHeading(level) : addItem();
}
function beginSort(id, keyboard) {
  if (!id || !editing()) return;
  closeMenu();
  const nodes = doc().nodes,
    index = nodes.findIndex((n) => n.id === id);
  if (index < 0) return;
  sorting = {
    id,
    keyboard,
    original: [...nodes],
    changed: false,
    historyLength: history.length,
    previousFuture: [...future],
  };
  clearTimeout(saveTimer);
  active = id;
  const end = scopeEnd(nodes, index);
  for (const node of nodes.slice(index, end))
    contentFor(node.id)?.closest(".row").classList.add("sorting");
  document.body.classList.add("sorting-active");
}
function reorderBefore(targetId, after) {
  if (!sorting) return;
  const nodes = doc().nodes;
  // Capture the original state once; the whole gesture is one undo operation.
  if (!sorting.changed) {
    const copy = [...nodes];
    if (!moveSubtree(copy, sorting.id, targetId, after)) return;
    remember();
  }
  if (!moveSubtree(nodes, sorting.id, targetId, after)) return;
  sorting.changed = true;
  const rows = new Map(
    [...$("paper").children].map((row) => [row.dataset.id, row]),
  );
  // Retain the actual editable nodes and pointer capture while changing their order.
  let previous = null;
  for (const node of nodes) {
    const row = rows.get(node.id);
    const expected = previous ? previous.nextSibling : $("paper").firstChild;
    if (row !== expected) $("paper").insertBefore(row, expected);
    previous = row;
  }
  renumber();
}
function keyboardSort(step) {
  const nodes = doc().nodes,
    start = nodes.findIndex((n) => n.id === sorting.id),
    end = scopeEnd(nodes, start);
  const level = nodes[start].kind === "heading" ? nodes[start].level : 7;
  let target;
  if (step > 0) target = nodes[end];
  else {
    // Move past the preceding sibling's complete subtree, keeping its children attached.
    let i = start - 1;
    while (i > 0 && nodes[i].kind === "heading" && nodes[i].level > level) i--;
    if (nodes[start].kind === "heading") {
      i = start - 1;
      while (
        i >= 0 &&
        !(nodes[i].kind === "heading" && nodes[i].level <= level)
      )
        i--;
    }
    target = nodes[i];
  }
  if (target) {
    reorderBefore(target.id, step > 0);
    contentFor(sorting.id)?.scrollIntoView?.({ block: "nearest" });
  }
}
function pointerSort(x, y) {
  if (!sorting) return;
  const rows = [
    ...$("paper").querySelectorAll(".row:not([hidden]):not(.sorting)"),
  ];
  const target = rows.find((row) => {
    const r = row.getBoundingClientRect();
    return y >= r.top && y <= r.bottom;
  });
  if (target) {
    const r = target.getBoundingClientRect();
    reorderBefore(target.dataset.id, y > r.top + r.height / 2);
  }
  const main = document.querySelector("main"),
    r = main.getBoundingClientRect();
  if (y < r.top + 45) main.scrollTop -= 18;
  else if (y > r.bottom - 45) main.scrollTop += 18;
}
function finishSort(cancel = false) {
  if (!sorting) return;
  const {
    id,
    changed: moved,
    original,
    historyLength,
    previousFuture,
  } = sorting;
  sorting = null;
  document.body.classList.remove("sorting-active");
  if (cancel && moved) {
    doc().nodes = original;
    history.length = historyLength;
    future = previousFuture;
  }
  if (moved) {
    render();
    focus(id);
    if (!cancel || dirty) changed();
  } else
    for (const row of $("paper").querySelectorAll(".sorting"))
      row.classList.remove("sorting");
}
function moveEntry(step) {
  const source = document.activeElement?.closest(".content");
  if (!source) return false;
  const fields = [
    ...$("paper").querySelectorAll(".row:not([hidden]) .content"),
  ];
  const index = fields.indexOf(source),
    target = fields[index + step];
  if (!target) return true;
  const selectedRange = window.getSelection();
  let offset = 0;
  if (selectedRange?.rangeCount && source.contains(selectedRange.focusNode)) {
    const prefix = document.createRange();
    prefix.selectNodeContents(source);
    prefix.setEnd(selectedRange.focusNode, selectedRange.focusOffset);
    offset = prefix.toString().length;
  }
  focus(target.dataset.id);
  const walker = document.createTreeWalker(target, window.NodeFilter.SHOW_TEXT);
  const texts = [];
  let text;
  while ((text = walker.nextNode())) texts.push(text);
  for (let i = 0; i < texts.length; i++) {
    text = texts[i];
    if (offset <= text.length || i === texts.length - 1) {
      const range = document.createRange();
      range.setStart(text, Math.min(offset, text.length));
      range.collapse(true);
      selectedRange.removeAllRanges();
      selectedRange.addRange(range);
      selection = range.cloneRange();
      break;
    }
    offset -= text.length;
  }
  return true;
}
function runShortcut(action) {
  if (action === "cutEntry") {
    const field = document.activeElement?.closest?.(".content");
    if (!editing() || !field || window.getSelection()?.toString()) return false;
    cutEntry(field.dataset.id);
    return true;
  }
  if (action === "collapse") {
    window.dispatchEvent(new window.Event("prombee-minimize"));
    return true;
  }
  if (action === "library") {
    $("libraryTab").click();
    return true;
  }
  if (action === "settings") {
    $("settingsTab").click();
    return true;
  }
  if (action === "theme") {
    $("theme").click();
    return true;
  }
  if (action === "save") {
    save();
    return true;
  }
  if (noSet) return true;
  if (["previous", "next"].includes(action))
    return editing() && moveEntry(action === "previous" ? -1 : 1);
  if (action === "deleteRound") {
    $("deleteRound").click();
    return true;
  }
  if (action === "copyAll") {
    if (page === "common") $("copyAll").click();
    return true;
  }
  if (action === "newRound") {
    $("newDoc").click();
    return true;
  }
  if (["preview", "compare", "editor", "template", "common"].includes(action)) {
    switchPage(action);
    return true;
  }
  if (action === "copy" && !["library", ...settingsPages].includes(page)) {
    copy();
    return true;
  }
  if (!editing()) return true;
  if (action === "drag") beginSort(active, true);
  else if (action === "insert") beginKeyboardInsert();
  else if (action === "copy") copy();
  else if (action === "undo") undo();
  else if (action === "redo") redo();
  else if (["bold", "italic"].includes(action)) $(action).click();
  else if (action === "multi") $("multiSelect").click();
  else if (action === "deleteEmpty") deleteEmpty();
  else if (action === "voice") $("voiceInput").click();
  else {
    const row = contentFor(active)?.closest(".row");
    if (action === "delete" && active) deleteNode(active);
    if (action === "exclude") row?.querySelector(".eye")?.click();
    if (action === "fold") row?.querySelector(".fold")?.click();
  }
  return true;
}
document.addEventListener(
  "keydown",
  (event) => {
    if (
      !window.prombeeReady ||
      event.isComposing ||
      event.target.closest?.(".shortcut-key")
    )
      return;
    if (sorting?.keyboard) {
      if (event.key === "ArrowUp" || event.key === "ArrowDown")
        keyboardSort(event.key === "ArrowUp" ? -1 : 1);
      else if (event.key === "Enter" || event.key === "Escape")
        finishSort(event.key === "Escape");
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (keyboardInsert) {
      if (event.key === "Escape") closeMenu();
      else if (/^[0-6]$/.test(event.key)) {
        keyboardLevel = Number(event.key);
        confirmInsert();
      } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        keyboardLevel = (keyboardLevel + (event.key === "ArrowUp" ? 6 : 1)) % 7;
        selectKeyboardLevel();
      } else if (event.key === "Backspace") {
        keyboardLevel = 0;
        selectKeyboardLevel();
      } else if (event.key === "Enter") confirmInsert();
      else if (event.key === "Tab") {
        closeMenu();
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (event.key === "Escape") closeMenu();
    const combo = keyCombo(event);
    if (!combo) return;
    const action = Object.keys(shortcutBindings).find(
      (id) => shortcutBindings[id] === combo,
    );
    if (!action) return;
    if (
      event.repeat &&
      !["previous", "next", "undo", "redo"].includes(action)
    ) {
      event.preventDefault();
      return;
    }
    if (runShortcut(action)) {
      event.preventDefault();
      event.stopPropagation();
    }
  },
  true,
);
document.addEventListener("compositionstart", closeMenu);
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
  speech.stop();
  state = data.state;
  templateSourceSignature = null;
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
  editorViews.clear();
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
      name: "常用",
      nodes: [makeNode("heading", 1, "常用"), makeNode()],
    };
  }
  for (const collection of state.documents) {
    if (collection.fromText && otherUI.recognizeMarkdown()) {
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
  syncLatestTemplate();
  page = "editor";
  previewSource = null;
  closeMenu();
  keyboardLevel = 0;
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
  await otherUI.ready;
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
  await shortcutsUI.ready;
  window.prombeeReady = true;
} catch (err) {
  $("status").textContent = err.message;
}

let devStamp;
const devPoll = setInterval(async () => {
  try {
    const response = await fetch("/api/dev");
    const value = await response.json();
    if (!value.enabled) {
      clearInterval(devPoll);
      return;
    }
    if (devStamp && devStamp !== value.stamp && !dirty && !saveRunning)
      location.reload();
    else if (!devStamp) devStamp = value.stamp;
  } catch {}
}, 1000);

window.addEventListener("prombee-close", async () => {
  await speech.stop();
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

mountEdgeNavigation(document.getElementById("edgeNavigation"), () =>
  document.body.dataset.page === "compare"
    ? document.getElementById("diffScroll")
    : document.querySelector("main"),
);
