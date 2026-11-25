/** Session metadata travels with each TXT set, independently of WebView ports. */
export function editorSession(previous, page: string, views: Map<string, any>) {
  const pages = ["editor", "template", "common"];
  return {
    page: pages.includes(page)
      ? page
      : pages.includes(previous?.page)
        ? previous.page
        : "editor",
    views: Object.fromEntries(views),
  };
}
export function restoreSession(session) {
  const page = ["editor", "template", "common"].includes(session?.page)
    ? session.page
    : "editor";
  const views = new Map<string, any>();
  if (session?.views && typeof session.views === "object")
    for (const [key, value] of Object.entries(session.views)) {
      const view = value as any;
      if (
        !view ||
        !Number.isFinite(view.top) ||
        view.top < 0 ||
        (typeof view.active !== "string" && view.active !== null)
      )
        continue;
      const validPath = (path) =>
        Array.isArray(path) &&
        path.every((index) => Number.isInteger(index) && index >= 0);
      const caret = view.caret;
      const validCaret =
        caret &&
        validPath(caret.start) &&
        validPath(caret.end) &&
        Number.isInteger(caret.startOffset) &&
        caret.startOffset >= 0 &&
        Number.isInteger(caret.endOffset) &&
        caret.endOffset >= 0;
      const restored = {
        ...view,
        selected: Array.isArray(view.selected) ? view.selected : [],
      };
      if (!validCaret) delete restored.caret;
      views.set(key, restored);
    }
  return { page, views };
}
