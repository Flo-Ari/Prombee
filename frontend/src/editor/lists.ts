import type { Collection, Entry } from "../types/workspace";
import { scopeEnd } from "./core";
const types = new Set(["ordered", "unordered", "none"]);

/** A collection's global choice survives local commands and newly inserted entries. */
export function defaultListType(collection: Collection): Entry["listType"] {
  // Legacy body markers do not represent a saved global selection.
  if (!types.has(collection.defaultListType))
    collection.defaultListType = "unordered";
  for (const node of collection.nodes)
    if (node.kind === "item" && !node.listType)
      node.listType = collection.defaultListType;
  return collection.defaultListType;
}

export function applyListType(
  collection: Collection,
  value: string,
  activeId?: string,
): boolean {
  const all = value.startsWith("all-"),
    type = (all ? value.slice(4) : value) as Entry["listType"];
  const index = collection.nodes.findIndex((n) => n.id === activeId);
  if (!types.has(type) || (!all && index < 0)) return false;
  defaultListType(collection);
  if (all) collection.defaultListType = type;
  const end = all
    ? collection.nodes.length
    : collection.nodes[index].kind === "heading"
      ? scopeEnd(collection.nodes, index)
      : index + 1;
  for (let i = all ? 0 : index; i < end; i++)
    if (collection.nodes[i].kind === "item")
      collection.nodes[i].listType = type;
  return true;
}
