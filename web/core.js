import { marked } from "./vendor/marked.esm.js";
export const uid = () =>
  globalThis.crypto?.randomUUID?.() ||
  `${Date.now()}-${Math.random().toString(16).slice(2)}`;
export function cleanHTML(html) {
  const t = document.createElement("template");
  t.innerHTML = html;
  const endsBreak = (parent) => {
    let last = parent.lastChild;
    while (last?.lastChild) last = last.lastChild;
    return last?.nodeName === "BR" || last?.textContent?.endsWith("\n");
  };
  const appendClean = (parent, child) => {
    const cleaned = clean(child);
    if (cleaned.nodeType === 3 && !cleaned.textContent) return;
    if (
      ["DIV", "P"].includes(child.nodeName) &&
      parent.childNodes.length &&
      !endsBreak(parent)
    )
      parent.append(document.createElement("br"));
    parent.append(cleaned);
  };
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
    for (const child of node.childNodes) appendClean(out, child);
    if (["div", "p"].includes(tag) && !endsBreak(out))
      out.append(document.createElement("br"));
    if (!out.textContent && !out.querySelector("br"))
      return document.createTextNode("");
    return out;
  };
  const box = document.createElement("div");
  for (const child of t.content.childNodes) appendClean(box, child);
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
// Empty headings are omitted from copy, while stored hierarchy remains untouched.
export function populatedHeadings(nodes, states = visibility(nodes)) {
  const populated = new Set(),
    stack = [];
  const mark = () => {
    for (const heading of stack) populated.add(heading.id);
  };
  for (const n of nodes) {
    if (n.kind === "heading") {
      while (stack.length && stack.at(-1).level >= n.level) stack.pop();
      stack.push(n);
    }
    if (states.get(n.id).excluded) continue;
    const text = plain(n.html);
    if (!text.trim()) continue;
    if (n.kind !== "heading") {
      mark();
      continue;
    }
    if (markdownHeadings(text).length) {
      const lines = text.split("\n");
      if (
        lines.some(
          (line, i) =>
            line.trim() &&
            !/^ {0,3}#{1,6}(?:[ \t]+|$)/.test(line) &&
            !/^ {0,3}(?:=+|-+)[ \t]*$/.test(line) &&
            !/^ {0,3}(?:=+|-+)[ \t]*$/.test(lines[i + 1] || ""),
        )
      )
        mark();
    } else if (n.raw) mark();
  }
  return populated;
}
export function toMarkdown(nodes, { start = 0, end = nodes.length } = {}) {
  let count = 0;
  const lines = [],
    stack = [];
  const states = visibility(nodes),
    populated = populatedHeadings(nodes, states);
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
    if (
      index < start ||
      !source.trim() ||
      (n.kind === "heading" && !populated.has(n.id))
    )
      continue;
    if (
      n.raw ||
      (authored &&
        (headings.length || (n.kind !== "heading" && hasBlockMarkdown(source))))
    ) {
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

export function selectionScope(nodes, ids) {
  const selected = new Set(ids),
    result = new Set();
  nodes.forEach((node, index) => {
    if (selected.has(node.id))
      for (let i = index; i < scopeEnd(nodes, index); i++)
        result.add(nodes[i].id);
  });
  return result;
}
export function foldedNodes(nodes) {
  const hidden = new Set(),
    stack = [];
  for (const node of nodes) {
    if (node.kind === "heading")
      while (stack.length && stack.at(-1).level >= node.level) stack.pop();
    if (stack.some((n) => n.collapsed)) hidden.add(node.id);
    if (node.kind === "heading") stack.push(node);
  }
  return hidden;
}
export function contextLevel(nodes, id) {
  let level = 0;
  for (const node of nodes) {
    if (node.kind === "heading") level = node.level;
    if (node.id === id) return level;
  }
  return level;
}

export function hasBlockMarkdown(text) {
  return marked
    .lexer(text)
    .some((token) => !["paragraph", "space", "text"].includes(token.type));
}
const htmlText = (text) =>
  text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
// Convert authored blocks to actual editor rows. Never deduplicate conflicting titles.
export function integrateMarkdown(nodes, id) {
  const index = nodes.findIndex((n) => n.id === id),
    source = nodes[index];
  if (!source || source.raw) return null;
  const text = plain(source.html);
  if (!hasBlockMarkdown(text)) return null;
  const tokens = marked.lexer(text),
    replacements = [];
  for (const token of tokens) {
    if (token.type === "space") continue;
    const heading = token.type === "heading";
    const node = makeNode(
      heading ? "heading" : "item",
      heading ? token.depth : 1,
      htmlText(heading ? token.text : token.raw.replace(/\n+$/, "")),
    );
    if (!heading) node.raw = true;
    if (source.excluded) node.excluded = true;
    replacements.push(node);
  }
  if (!replacements.length) return null;
  replacements[0].id = source.id;
  if (source.collapsed && replacements[0].kind === "heading")
    replacements[0].collapsed = true;
  const result = nodes.map((node) => ({ ...node }));
  const finalHeading = replacements.findLast((node) => node.kind === "heading");
  if (source.kind === "heading" && finalHeading) {
    const delta = finalHeading.level - source.level;
    for (let i = index + 1; i < scopeEnd(nodes, index); i++)
      if (
        result[i].kind === "heading" &&
        !markdownHeadings(plain(result[i].html)).length
      )
        result[i].level = Math.max(1, Math.min(6, result[i].level + delta));
  }
  result.splice(index, 1, ...replacements);
  return result;
}
