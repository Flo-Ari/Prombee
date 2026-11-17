// Size the row from rendered text, so a fully formatted entry can grow and shrink.
export function syncEntryMetrics(el) {
  if (!el) return;
  const cache = new Map();
  const pixels = (node) => {
    if (!cache.has(node)) {
      const value = window.getComputedStyle(node).fontSize;
      cache.set(node, parseFloat(value) * (/pt$/.test(value) ? 4 / 3 : 1) || 0);
    }
    return cache.get(node);
  };
  let size = 0,
    text;
  const walker = document.createTreeWalker(el, window.NodeFilter.SHOW_TEXT);
  while ((text = walker.nextNode()))
    if (text.length) size = Math.max(size, pixels(text.parentElement));
  for (const br of el.querySelectorAll("br"))
    size = Math.max(size, pixels(br.parentElement));
  el.closest(".row")?.style.setProperty(
    "--entry-font-size",
    (size || pixels(el) || 18.667) + "px",
  );
}
