export const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;
export function cleanHTML(html) {
  const t = document.createElement("template");
  t.innerHTML = html;
  const clean = (node) => {
    if (node.nodeType === 3) return document.createTextNode(node.textContent);
    if (node.nodeType !== 1) return document.createTextNode("");
    const tag = node.tagName.toLowerCase();
    if (["script", "style", "iframe", "object"].includes(tag))
      return document.createTextNode("");
    if (tag === "br") return document.createElement("br");
    const out = document.createElement(
      ["b", "strong", "i", "em", "u"].includes(tag) ? tag : "span",
    );
    for (const attr of [
      "fontFamily",
      "fontSize",
      "color",
      "fontWeight",
      "fontStyle",
    ]) {
      let val = node.style[attr];
      if (tag === "font") {
        if (attr === "fontFamily") val = node.getAttribute("face") || val;
        if (attr === "color") val = node.getAttribute("color") || val;
      }
      if (val && !/url\s*\(|expression|javascript:/i.test(val))
        out.style[attr] = val;
    }
    for (const child of node.childNodes) out.append(clean(child));
    if (["div", "p"].includes(tag)) out.append(document.createElement("br"));
    if (!out.textContent && !out.querySelector("br"))
      return document.createTextNode("");
    return out;
  };
  const box = document.createElement("div");
  for (const child of t.content.childNodes) box.append(clean(child));
  return box.innerHTML;
}
export function plain(html) {
  const t = document.createElement("div");
  t.innerHTML = cleanHTML(html);
  for (const b of t.querySelectorAll("br")) b.replaceWith("\n");
  return t.textContent.replace(/\n$/, "");
}
export function inlineMarkdown(html) {
  const t = document.createElement("div");
  t.innerHTML = cleanHTML(html);
  const convert = (n) => {
    if (n.nodeType === 3) return n.textContent;
    if (n.tagName === "BR") return "\n";
    let text = [...n.childNodes].map(convert).join("");
    if (["I", "EM"].includes(n.tagName) || n.style?.fontStyle === "italic")
      text = "*" + text + "*";
    if (
      ["B", "STRONG"].includes(n.tagName) ||
      Number(n.style?.fontWeight) >= 600 ||
      n.style?.fontWeight === "bold"
    )
      text = "**" + text + "**";
    return text;
  };
  return [...t.childNodes].map(convert).join("");
}
export function visibility(nodes) {
  const stack = [],
    result = new Map();
  for (const node of nodes) {
    if (node.kind === "heading") {
      while (stack.length && stack.at(-1).level >= node.level) stack.pop();
    }
    const inherited = stack.some((parent) => parent.excluded);
    const excluded = inherited || node.excluded === true;
    result.set(node.id, { excluded, inherited });
    if (node.kind === "heading") stack.push({ level: node.level, excluded });
  }
  return result;
}
export function scopeEnd(nodes, index) {
  const node = nodes[index];
  if (!node || node.kind !== "heading") return index + 1;
  let end = index + 1;
  while (
    end < nodes.length &&
    !(nodes[end].kind === "heading" && nodes[end].level <= node.level)
  )
    end++;
  return end;
}
export function nextRoundName(documents) {
  const numbers = documents.map((doc) =>
    Number(/^第\s*(\d+)\s*轮$/.exec(doc.name)?.[1] || 0),
  );
  return `第${Math.max(0, ...numbers) + 1}轮`;
}
// Inspect authored Markdown, ignoring headings inside fenced code blocks.
export function markdownHeadings(text) {
  const result = [];
  let fence = null,
    previous = "";
  for (const line of text.split("\n")) {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      previous = "";
      if (
        match &&
        match[1][0] === fence[0] &&
        match[1].length >= fence.length &&
        !match[2].trim()
      )
        fence = null;
      continue;
    }
    if (match) {
      previous = "";
      fence = match[1];
      continue;
    }
    const heading = /^ {0,3}(#{1,6})(?:[ \t]+|$)/.exec(line);
    if (heading) {
      result.push(heading[1].length);
      previous = "";
      continue;
    }
    const underline = /^ {0,3}(=+|-+)[ \t]*$/.exec(line);
    if (
      underline &&
      previous.trim() &&
      !/^ {0,3}(?:[-+*]|\d+[.)])[ \t]/.test(previous)
    ) {
      result.push(underline[1][0] === "=" ? 1 : 2);
      previous = "";
    } else previous = line;
  }
  return result;
}
export function containsMarkdown(text) {
  return (
    /^ {0,3}(?:#{1,6}(?:[ \t]+|$)|(?:[-+*]|\d+[.)])[ \t]+|>|`{3,}|~{3,}|(?:[-*_][ \t]*){3,}$)/m.test(
      text,
    ) ||
    /(?:\*\*[^\n]+?\*\*|__[^\n]+?__|\*[^*\n]+?\*|_[^_\n]+?_|`[^`\n]+`|!?\[[^\]\n]+\]\([^)\n]+\))/.test(
      text,
    ) ||
    /\n {0,3}(?:=+|-+)[ \t]*(?:\n|$)/.test(text) ||
    /^.*\|.*\n[ \t]*\|?[ \t]*:?-{3,}/m.test(text)
  );
}
export function toMarkdown(nodes, { start = 0, end = nodes.length } = {}) {
  let count = 0;
  const lines = [],
    stack = [];
  const states = visibility(nodes);
  const blank = () => {
    if (lines.length && lines.at(-1) !== "") lines.push("");
  };
  // Walk ancestors even for a subtree copy so local heading overrides remain intact.
  for (let index = 0; index < end; index++) {
    const n = nodes[index];
    if (n.kind === "heading") {
      while (stack.length && stack.at(-1).level >= n.level) stack.pop();
    }
    if (states.get(n.id).excluded) continue;
    const source = plain(n.html);
    const authored = containsMarkdown(source);
    const text = authored ? source : inlineMarkdown(n.html);
    const headings = markdownHeadings(source);
    const inheritedDelta = stack.at(-1)?.delta || 0;
    const level = Math.max(1, Math.min(6, n.level + inheritedDelta));
    if (n.kind === "heading") {
      stack.push({
        level: n.level,
        delta: headings.length ? headings.at(-1) - n.level : inheritedDelta,
      });
      count = 0;
    }
    if (index < start || !source.trim()) continue;
    if (authored) {
      blank();
      lines.push(text);
      // A Markdown block owns its own list numbering and hierarchy.
      lines.push("");
      count = 0;
    } else if (n.kind === "heading") {
      blank();
      lines.push("#".repeat(level) + " " + text);
    } else {
      count++;
      const parts = text.split("\n");
      lines.push(
        `${count}. ${parts[0]}`,
        ...parts.slice(1).map((x) => "   " + x),
      );
    }
  }
  while (lines.at(-1) === "") lines.pop();
  return lines.length ? lines.join("\n") + "\n" : "";
}
export function subtreeMarkdown(nodes, id) {
  const start = nodes.findIndex((n) => n.id === id);
  return start < 0
    ? ""
    : toMarkdown(nodes, { start, end: scopeEnd(nodes, start) });
}
export function makeNode(kind = "item", level = 1, html = "") {
  return { id: uid(), kind, level, html };
}

// A template copies hierarchy, never prior-round body text or copy exclusions.
export function hierarchyNodes(nodes) {
  return nodes
    .filter((n) => n.kind === "heading")
    .flatMap((n) => [
      makeNode("heading", n.level, cleanHTML(n.html)),
      makeNode(),
    ]);
}
