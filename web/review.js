import { marked } from "./vendor/marked.esm.js";
import DOMPurify from "./vendor/purify.es.mjs";

export function renderMarkdown(text, target) {
  target.innerHTML = DOMPurify.sanitize(marked.parse(text), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ["img", "iframe", "video", "audio", "style"],
    FORBID_ATTR: ["style"],
  });
  for (const link of target.querySelectorAll("a")) {
    link.removeAttribute("href");
    link.setAttribute("title", "仅预览文字，不打开外部链接");
  }
}

export function lineDiff(before, after) {
  const a = before.split("\n"),
    b = after.split("\n");
  if (a.length * b.length > 1000000)
    return [
      ...a.map((text) => ({ type: "remove", text })),
      ...b.map((text) => ({ type: "add", text })),
    ];
  const dp = Array.from(
    { length: a.length + 1 },
    () => new Uint32Array(b.length + 1),
  );
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const result = [];
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      result.push({ type: "same", text: a[i++] });
      j++;
    } else if (j < b.length && (i === a.length || dp[i][j + 1] >= dp[i + 1][j]))
      result.push({ type: "add", text: b[j++] });
    else result.push({ type: "remove", text: a[i++] });
  }
  return result;
}

export function renderComparison(before, after, target) {
  target.replaceChildren();
  const diff = lineDiff(before, after);
  const pairs = [];
  for (let i = 0; i < diff.length; ) {
    if (diff[i].type === "same") {
      pairs.push([diff[i], diff[i]]);
      i++;
      continue;
    }
    const removed = [],
      added = [];
    while (i < diff.length && diff[i].type !== "same") {
      (diff[i].type === "remove" ? removed : added).push(diff[i++]);
    }
    for (let j = 0; j < Math.max(removed.length, added.length); j++)
      pairs.push([removed[j], added[j]]);
  }
  let left = 0,
    right = 0;
  for (const pair of pairs) {
    const row = document.createElement("div");
    row.className = "diff-row";
    for (let side = 0; side < 2; side++) {
      const line = pair[side];
      const cell = document.createElement("div");
      cell.className =
        "diff-cell " + (line ? "diff-" + line.type : "diff-blank");
      const number = document.createElement("span");
      number.className = "line-number";
      number.textContent = line ? String(side === 0 ? ++left : ++right) : "";
      const text = document.createElement("span");
      text.className = "diff-text";
      text.textContent = line?.text || "";
      cell.append(number, text);
      row.append(cell);
    }
    target.append(row);
  }
}
