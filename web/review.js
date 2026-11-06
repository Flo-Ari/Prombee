import { marked } from "./vendor/marked.esm.js";
import DOMPurify from "./vendor/purify.es.mjs";
import { toMarkdown } from "./core.js";

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

export function openReview(state, current, mode) {
  const dialog = document.getElementById("reviewDialog");
  const output = document.getElementById("reviewContent");
  const controls = document.getElementById("compareControls");
  document.getElementById("reviewTitle").textContent =
    mode === "preview" ? "复制预览" : "历史对比";
  const text = toMarkdown(current.nodes);
  controls.hidden = mode !== "compare";
  output.className = mode === "preview" ? "markdown-preview" : "diff-preview";
  if (mode === "preview") {
    if (text) renderMarkdown(text, output);
    else output.textContent = "没有参与复制的内容。";
  } else {
    const select = document.getElementById("compareRound");
    select.replaceChildren();
    for (const doc of state.documents.filter((doc) => doc.id !== current.id)) {
      const option = document.createElement("option");
      option.value = doc.id;
      option.textContent = doc.name;
      select.append(option);
    }
    const index = state.documents.indexOf(current);
    const previous =
      state.documents[index + 1] ||
      state.documents.find((doc) => doc.id !== current.id);
    if (previous) select.value = previous.id;
    const compare = () => {
      output.replaceChildren();
      if (!select.options.length) {
        output.textContent = "再新建一轮后，可以在这里比较两轮提示词。";
        return;
      }
      const reference = state.documents.find((doc) => doc.id === select.value);
      for (const line of lineDiff(toMarkdown(reference.nodes), text)) {
        const row = document.createElement("div");
        row.className = "diff-" + line.type;
        row.textContent =
          (line.type === "add" ? "+ " : line.type === "remove" ? "− " : "  ") +
          line.text;
        output.append(row);
      }
    };
    select.onchange = compare;
    compare();
  }
  dialog.showModal();
}
