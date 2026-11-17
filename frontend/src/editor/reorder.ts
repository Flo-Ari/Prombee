// Move complete subtrees without changing their levels or dropping hidden children.
export function moveSubtree(nodes, id, targetId, after = false) {
  const endAt = (index) => {
    const n = nodes[index];
    if (n.kind !== "heading") return index + 1;
    let end = index + 1;
    while (
      end < nodes.length &&
      !(nodes[end].kind === "heading" && nodes[end].level <= n.level)
    )
      end++;
    return end;
  };
  const start = nodes.findIndex((n) => n.id === id),
    target = nodes.findIndex((n) => n.id === targetId);
  if (start < 0 || target < 0) return false;
  const end = endAt(start);
  if (target >= start && target < end) return false;
  let insert = after ? endAt(target) : target;
  if (insert === end || insert === start) return false;
  const block = nodes.splice(start, end - start);
  if (insert > end) insert -= block.length;
  nodes.splice(insert, 0, ...block);
  return true;
}
// A stationary long press starts sorting; ordinary clicks, text selection and scrolling stay native.
export function bindHoldDrag(
  row,
  { start, move, end, holdSelector = null },
  handle = null,
) {
  row.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.pointerType === "touch") return;
    const direct = handle && handle.contains(event.target);
    if (
      !direct &&
      event.target.closest("button,input,select,a") &&
      !(holdSelector && event.target.closest(holdSelector))
    )
      return;
    const x = event.clientX,
      y = event.clientY;
    let dragging = false,
      timer;
    const begin = () => {
      if (!row.isConnected) return;
      dragging = true;
      window.getSelection()?.removeAllRanges();
      try {
        row.setPointerCapture?.(event.pointerId);
      } catch {
        /* Synthetic test events have no active pointer. */
      }
      start();
    };
    const motion = (e) => {
      if (!dragging) {
        if (Math.hypot(e.clientX - x, e.clientY - y) > 6) clearTimeout(timer);
        return;
      }
      e.preventDefault();
      move(e.clientX, e.clientY);
    };
    const finish = (e) => {
      clearTimeout(timer);
      window.removeEventListener("blur", finish);
      document.removeEventListener("pointermove", motion);
      document.removeEventListener("pointerup", finish);
      document.removeEventListener("pointercancel", finish);
      if (dragging) {
        if (row.hasPointerCapture?.(event.pointerId))
          row.releasePointerCapture(event.pointerId);
        end(e.type === "pointercancel" || e.type === "blur");
        if (e.type === "pointerup")
          row.addEventListener(
            "click",
            (e) => {
              e.preventDefault();
              e.stopImmediatePropagation();
            },
            { once: true, capture: true },
          );
      }
    };
    window.addEventListener("blur", finish);
    document.addEventListener("pointermove", motion);
    document.addEventListener("pointerup", finish);
    document.addEventListener("pointercancel", finish);
    if (direct) {
      event.preventDefault();
      begin();
    } else timer = setTimeout(begin, 450);
  });
}
