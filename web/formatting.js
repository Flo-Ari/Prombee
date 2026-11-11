export function prepareFormatting(el) {
  const s = window.getSelection(),
    whole = !s.rangeCount || s.isCollapsed;
  let offset = 0;
  if (whole && s.rangeCount && el.contains(s.anchorNode)) {
    const r = s.getRangeAt(0).cloneRange();
    r.selectNodeContents(el);
    r.setEnd(s.anchorNode, s.anchorOffset);
    offset = r.toString().length;
  }
  if (whole) {
    const range = document.createRange();
    range.selectNodeContents(el);
    s.removeAllRanges();
    s.addRange(range);
  }
  return { whole, offset };
}
export function restoreFormattingCaret(el, target) {
  if (!target.whole) return;
  let remaining = target.offset,
    node;
  const walker = document.createTreeWalker(el, 4),
    range = document.createRange();
  while ((node = walker.nextNode())) {
    if (remaining <= node.textContent.length) {
      range.setStart(node, remaining);
      break;
    }
    remaining -= node.textContent.length;
  }
  if (!node) {
    range.selectNodeContents(el);
    range.collapse(false);
  } else range.collapse(true);
  const s = window.getSelection();
  s.removeAllRanges();
  s.addRange(range);
}
export function readFormatting(el) {
  if (!el) return null;
  const s = window.getSelection();
  let anchor = s?.anchorNode;
  if (!anchor || !el.contains(anchor))
    anchor = el.querySelector("span,b,strong,i,em") || el;
  if (anchor.nodeType === 3) anchor = anchor.parentElement;
  const style = window.getComputedStyle(anchor);
  const inherited = (property) => {
    let node = anchor;
    while (node && el.contains(node)) {
      if (node.style?.[property]) return node.style[property];
      node = node.parentElement;
    }
    return "";
  };
  const font = style.fontFamily || inherited("fontFamily"),
    size = style.fontSize || inherited("fontSize"),
    weight = style.fontWeight || inherited("fontWeight"),
    italic = style.fontStyle || inherited("fontStyle");
  const rgb = style.color.match(/\d+/g);
  const color =
    rgb?.length >= 3
      ? "#" +
        rgb
          .slice(0, 3)
          .map((n) => Number(n).toString(16).padStart(2, "0"))
          .join("")
      : null;
  return {
    font: font.split(",")[0].replace(/["']/g, "").trim(),
    size: parseFloat(size) * (/pt$/.test(size) ? 1 : 0.75),
    color,
    bold: weight === "bold" || Number(weight) >= 600,
    italic: italic === "italic",
  };
}
