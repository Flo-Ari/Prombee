import { makeNode, plain, populatedHeadings } from "./core.js";
// Stable sibling partition: keep whole heading subtrees and their relative order.
export function nextRoundNodes(template, previous, autoSort = true) {
  function tree(nodes) {
    const root = { children: [], key: "" },
      stack = [{ level: 0, branch: root }],
      counts = new Map();
    for (const n of nodes)
      if (n.kind === "heading") {
        while (stack.at(-1).level >= n.level) stack.pop();
        const parent = stack.at(-1).branch,
          name = JSON.stringify([parent.key, n.level, plain(n.html)]),
          index = (counts.get(name) || 0) + 1;
        counts.set(name, index);
        const branch = { node: n, key: name + ":" + index, children: [] };
        parent.children.push(branch);
        stack.push({ level: n.level, branch });
      }
    return root;
  }
  const previousTree = tree(previous),
    empties = new Set(),
    states = new Map(previous.map((n) => [n.id, { excluded: false }])),
    populated = populatedHeadings(previous, states);
  function collect(branch) {
    for (const child of branch.children) {
      if (!populated.has(child.node.id)) empties.add(child.key);
      collect(child);
    }
  }
  collect(previousTree);
  const result = [];
  function append(branch) {
    const children = autoSort
      ? [
          ...branch.children.filter((c) => !empties.has(c.key)),
          ...branch.children.filter((c) => empties.has(c.key)),
        ]
      : branch.children;
    for (const child of children) {
      const heading = makeNode("heading", child.node.level, child.node.html);
      if (empties.has(child.key)) heading.collapsed = true;
      result.push(heading, makeNode());
      append(child);
    }
  }
  append(tree(template));
  return result;
}
