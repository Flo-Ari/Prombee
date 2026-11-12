// Public style names intentionally match the names used in the product discussion.
export const BUTTON_STYLES = {
  state: "状态类样式",
  standard: "一般按钮样式",
  logo: "LOGO按钮样式",
  copy: "复制按钮样式",
  frameless: "无框按钮样式",
};
export function mountButtonStyles(root = document) {
  const stateIds = new Set([
    "deleteEmpty",
    "bold",
    "italic",
    "multiSelect",
    "voiceInput",
  ]);
  function enhance(element) {
    if (element.matches("button")) {
      if (
        element.matches(
          ".fold,[data-edge],.drag-handle,.dropdown-trigger,.dropdown-option,#theme,#listType",
        ) ||
        element.closest("[contenteditable],.markdown-preview,#diffRows")
      )
        return;
      const kind =
        element.closest(".window-controls") ||
        ["undo", "redo"].includes(element.id)
          ? "frameless"
          : element.id === "editorTab"
            ? "logo"
            : element.id === "copy"
              ? "copy"
              : stateIds.has(element.id) || element.hasAttribute("aria-pressed")
                ? "state"
                : "standard";
      element.classList.add(BUTTON_STYLES[kind], "button-" + kind);
      if (kind === "state" && element.matches(".eye"))
        element.classList.add("compact-state");
    } else if (element.matches(".setting-switch")) {
      element.classList.add(BUTTON_STYLES.state, "button-state");
    } else if (element.matches(".color-control")) {
      element.classList.add(BUTTON_STYLES.standard, "button-standard");
    }
  }
  const selector = "button,.setting-switch,.color-control";
  const scan = (node) => {
    if (node.nodeType !== 1 && node.nodeType !== 9) return;
    if (node.matches?.(selector)) enhance(node);
    for (const element of node.querySelectorAll(selector)) enhance(element);
  };
  scan(root);
  const observer = new window.MutationObserver((mutations) => {
    for (const mutation of mutations)
      for (const node of mutation.addedNodes) scan(node);
  });
  observer.observe(root, { childList: true, subtree: true });
  return () => observer.disconnect();
}
