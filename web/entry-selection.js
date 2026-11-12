import { plain } from "./core.js";
function pointRange(x, y) {
  if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x, y);
  const p = document.caretPositionFromPoint?.(x, y);
  if (!p) return null;
  const range = document.createRange();
  range.setStart(p.offsetNode, p.offset);
  range.collapse(true);
  return range;
}
export function selectedEntryText(paper, selection = window.getSelection()) {
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0),
    parts = [];
  for (const field of paper.querySelectorAll(".row:not([hidden]) .content")) {
    if (!range.intersectsNode(field)) continue;
    const part = document.createRange();
    part.selectNodeContents(field);
    if (range.compareBoundaryPoints(window.Range.START_TO_START, part) > 0)
      part.setStart(range.startContainer, range.startOffset);
    if (range.compareBoundaryPoints(window.Range.END_TO_END, part) < 0)
      part.setEnd(range.endContainer, range.endOffset);
    const box = document.createElement("div");
    box.append(part.cloneContents());
    parts.push(plain(box.innerHTML));
  }
  return parts.length ? parts.join("\n") : null;
}
export function mountEntrySelection(paper) {
  let readOnlyFields = [];
  function restoreEditing() {
    for (const field of readOnlyFields)
      if (field.isConnected) field.setAttribute("contenteditable", "true");
    readOnlyFields = [];
  }
  let anchor = null,
    cross = false,
    last = null,
    frame = 0;
  function extend(event) {
    if (!anchor || !(event.buttons & 1)) return;
    const target = document
      .elementFromPoint?.(event.clientX, event.clientY)
      ?.closest(".content");
    if (!target || !paper.contains(target)) return;
    if (target !== anchor.field && !cross) {
      cross = true;
      // WebKit clamps a selection to its editing host. Temporarily use ordinary
      // document text selection while spanning entries; the next click restores editing.
      readOnlyFields = [...paper.querySelectorAll(".content")];
      for (const field of readOnlyFields)
        field.setAttribute("contenteditable", "false");
    }
    if (!cross) return;
    const point = pointRange(event.clientX, event.clientY);
    if (!point || !target.contains(point.startContainer)) return;
    event.preventDefault();
    window
      .getSelection()
      .setBaseAndExtent(
        anchor.node,
        anchor.offset,
        point.startContainer,
        point.startOffset,
      );
    last = {
      clientX: event.clientX,
      clientY: event.clientY,
      buttons: 1,
      preventDefault() {},
    };
  }
  function scroll() {
    if (!cross || !last) return;
    const main = paper.closest("main"),
      rect = main.getBoundingClientRect(),
      dy =
        last.clientY < rect.top + 28
          ? -12
          : last.clientY > rect.bottom - 28
            ? 12
            : 0;
    if (dy) {
      main.scrollTop += dy;
      extend(last);
    }
    frame = requestAnimationFrame(scroll);
  }
  document.addEventListener(
    "mousedown",
    (event) => {
      if (event.button !== 0) return;
      restoreEditing();
      const field = event.target.closest?.(".content");
      if (!field || !paper.contains(field)) return;
      const range = pointRange(event.clientX, event.clientY);
      if (range && field.contains(range.startContainer))
        anchor = {
          field,
          node: range.startContainer,
          offset: range.startOffset,
        };
    },
    true,
  );
  document.addEventListener(
    "mousemove",
    (event) => {
      extend(event);
      if (cross && !frame) frame = requestAnimationFrame(scroll);
    },
    true,
  );
  document.addEventListener(
    "mouseup",
    () => {
      anchor = null;
      cross = false;
      last = null;
      cancelAnimationFrame(frame);
      frame = 0;
    },
    true,
  );
  document.addEventListener(
    "keydown",
    (event) => {
      if (
        !readOnlyFields.length ||
        event.isComposing ||
        ["Control", "Meta", "Shift", "Alt"].includes(event.key) ||
        ((event.ctrlKey || event.metaKey) &&
          ["c", "x", "a"].includes(event.key.toLowerCase())) ||
        /^(Arrow|Home|End|Page)/.test(event.key)
      )
        return;
      const s = window.getSelection(),
        node = s?.focusNode,
        offset = s?.focusOffset,
        field = (node?.nodeType === 1 ? node : node?.parentElement)?.closest(
          ".content",
        );
      restoreEditing();
      if (field && event.key !== "Tab") {
        field.focus({ preventScroll: true });
        const r = document.createRange();
        r.setStart(node, offset);
        r.collapse(true);
        s.removeAllRanges();
        s.addRange(r);
      }
    },
    true,
  );
  document.addEventListener("copy", (event) => {
    const text = selectedEntryText(paper);
    if (text === null || !event.clipboardData) return;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
  });
  document.addEventListener("cut", (event) => {
    const text = selectedEntryText(paper),
      s = window.getSelection();
    if (text === null || !event.clipboardData) return;
    event.clipboardData.setData("text/plain", text);
    event.preventDefault();
    if (readOnlyFields.length) return; // A cross-entry selection is ordinary document text.
    const range = s.getRangeAt(0),
      field = (
        range.commonAncestorContainer.nodeType === 1
          ? range.commonAncestorContainer
          : range.commonAncestorContainer.parentElement
      )?.closest(".content");
    if (!field) return;
    field.dispatchEvent(
      new window.InputEvent("beforeinput", {
        inputType: "deleteByCut",
        bubbles: true,
      }),
    );
    range.deleteContents();
    range.collapse(true);
    s.removeAllRanges();
    s.addRange(range);
    field.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}
