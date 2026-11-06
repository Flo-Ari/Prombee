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
export function toMarkdown(nodes) {
  let count = 0;
  const lines = [];
  const states = visibility(nodes);
  for (const n of nodes) {
    if (states.get(n.id).excluded) continue;
    const text = inlineMarkdown(n.html);
    if (n.kind === "heading") {
      count = 0;
      if (plain(n.html).trim()) {
        if (lines.length) lines.push("");
        lines.push("#".repeat(n.level) + " " + text);
      }
    } else if (plain(n.html).trim()) {
      count++;
      const parts = text.split("\n");
      lines.push(
        `${count}. ${parts[0]}`,
        ...parts.slice(1).map((x) => "   " + x),
      );
    }
  }
  return lines.length ? lines.join("\n") + "\n" : "";
}
export function makeNode(kind = "item", level = 1, html = "") {
  return { id: uid(), kind, level, html };
}
