// Let the browser move through visual lines; cross editors only at a line boundary.
export function moveAcrossEntries(paper, step) {
  const source = document.activeElement?.closest?.(".content"),
    selection = window.getSelection();
  if (!source || !selection?.isCollapsed || !selection.rangeCount) return false;
  const caret = selection.getRangeAt(0),
    full = document.createRange();
  if (!source.contains(caret.startContainer)) return false;
  full.selectNodeContents(source);
  const lines = [...(full.getClientRects?.() || [])].filter(
      (r) => r.height > 0,
    ),
    point = caret.getBoundingClientRect?.();
  if (point?.height && lines.length) {
    const first = Math.min(...lines.map((r) => r.top)),
      last = Math.max(...lines.map((r) => r.bottom));
    if (
      step < 0
        ? point.top > first + point.height * 0.5
        : point.bottom < last - point.height * 0.5
    )
      return false;
  }
  const fields = [...paper.querySelectorAll(".row:not([hidden]) .content")],
    target = fields[fields.indexOf(source) + step];
  if (!target) return false;
  target.focus({ preventScroll: true });
  full.selectNodeContents(target);
  const rects = [...(full.getClientRects?.() || [])].filter(
    (r) => r.height > 0,
  );
  let range;
  if (rects.length && point?.height) {
    const line = step > 0 ? rects[0] : rects.at(-1),
      bounds = target.getBoundingClientRect(),
      x = Math.max(bounds.left + 1, Math.min(point.left, bounds.right - 1)),
      y = (line.top + line.bottom) / 2;
    range = document.caretRangeFromPoint?.(x, y);
    if (!range && document.caretPositionFromPoint) {
      const position = document.caretPositionFromPoint(x, y);
      if (position) {
        range = document.createRange();
        range.setStart(position.offsetNode, position.offset);
        range.collapse(true);
      }
    }
  }
  if (!range || !target.contains(range.startContainer)) {
    range = full;
    range.collapse(step > 0);
  }
  selection.removeAllRanges();
  selection.addRange(range);
  target.scrollIntoView({ block: "nearest" });
  return true;
}
