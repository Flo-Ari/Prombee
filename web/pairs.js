const PAIRS = new Map(
  Object.entries({
    '"': '"',
    "'": "'",
    "(": ")",
    "[": "]",
    "{": "}",
    "`": "`",
    "“": "”",
    "‘": "’",
    "（": "）",
    "［": "］",
    "【": "】",
    "｛": "｝",
    "「": "」",
    "『": "』",
    "《": "》",
    "〈": "〉",
  }),
);
export function bindPairs(el, enabled) {
  const selection = () => {
    const s = window.getSelection();
    return s?.rangeCount && el.contains(s.getRangeAt(0).commonAncestorContainer)
      ? s
      : null;
  };
  function around(range) {
    const prefix = document.createRange(),
      suffix = document.createRange();
    prefix.selectNodeContents(el);
    prefix.setEnd(range.startContainer, range.startOffset);
    suffix.selectNodeContents(el);
    suffix.setStart(range.endContainer, range.endOffset);
    return [prefix.toString(), suffix.toString()];
  }
  function changed() {
    el.dispatchEvent(new window.Event("input", { bubbles: true }));
  }
  el.addEventListener("beforeinput", (event) => {
    if (
      !enabled() ||
      event.isComposing ||
      event.inputType !== "insertText" ||
      event.data?.length !== 1
    )
      return;
    const s = selection();
    if (!s) return;
    const r = s.getRangeAt(0),
      c = event.data,
      [before, after] = around(r);
    if (r.collapsed && c === "`" && before.endsWith("``")) {
      event.preventDefault();
      const t = document.createTextNode("````");
      r.insertNode(t);
      r.setStart(t, 1);
      r.collapse(true);
      s.removeAllRanges();
      s.addRange(r);
      changed();
      return;
    }
    if (r.collapsed && [...PAIRS.values()].includes(c) && after.startsWith(c)) {
      // Move through an existing closing delimiter without inserting a duplicate.
      event.preventDefault();
      const walker = document.createTreeWalker(el, window.NodeFilter.SHOW_TEXT);
      let offset = before.length + 1,
        t;
      while ((t = walker.nextNode())) {
        if (offset <= t.length) {
          r.setStart(t, offset);
          r.collapse(true);
          break;
        }
        offset -= t.length;
      }
      s.removeAllRanges();
      s.addRange(r);
      return;
    }
    const close = PAIRS.get(c);
    if (!close) return;
    event.preventDefault();
    const selected = r.extractContents(),
      open = document.createTextNode(c),
      end = document.createTextNode(close),
      fragment = document.createDocumentFragment();
    fragment.append(open, selected, end);
    r.insertNode(fragment);
    r.setStartAfter(open);
    r.collapse(true);
    s.removeAllRanges();
    s.addRange(r);
    changed();
  });
  el.addEventListener("compositionend", (event) => {
    if (!enabled() || event.data?.length !== 1 || !PAIRS.has(event.data))
      return;
    queueMicrotask(() => {
      const s = selection();
      if (!s?.isCollapsed) return;
      const r = s.getRangeAt(0),
        [before, after] = around(r),
        close = PAIRS.get(event.data);
      if (!before.endsWith(event.data) || after.startsWith(close)) return;
      const end = document.createTextNode(close);
      r.insertNode(end);
      r.setStartBefore(end);
      r.collapse(true);
      s.removeAllRanges();
      s.addRange(r);
      changed();
    });
  });
}
