// Persistent controls: only opacity changes; scrolling never rebuilds their nodes.
export function edgeState(top, height, viewport, tolerance = 2) {
  const maximum = Math.max(0, height - viewport);
  return {
    up: maximum > tolerance && top > tolerance,
    down: maximum > tolerance && top < maximum - tolerance,
  };
}
export function mountEdgeNavigation(root, resolveScroller) {
  const view = root.ownerDocument.defaultView;
  const buttons = [...root.querySelectorAll("[data-edge]")];
  let frame = null,
    disposed = false;
  const update = () => {
    frame = null;
    if (disposed) return;
    const scroller = resolveScroller();
    const state = scroller
      ? edgeState(
          scroller.scrollTop,
          scroller.scrollHeight,
          scroller.clientHeight,
        )
      : {};
    const layout =
      state.up && state.down
        ? "both"
        : state.up
          ? "up"
          : state.down
            ? "down"
            : "none";
    if (root.dataset.layout !== layout) root.dataset.layout = layout;
    for (const button of buttons) {
      const shown = !!state[button.dataset.edge];
      if (button.dataset.visible === String(shown)) continue;
      button.dataset.visible = String(shown);
      button.setAttribute("aria-hidden", String(!shown));
      button.tabIndex = shown ? 0 : -1;
      button.inert = !shown;
    }
  };
  const schedule = () => {
    if (frame !== null || disposed) return;
    frame = view.setTimeout(update, 16);
  };
  const click = (event) => {
    const button = event.target.closest("[data-edge]");
    const scroller = resolveScroller();
    if (!button || !scroller || button.dataset.visible !== "true") return;
    scroller.scrollTo({
      top: button.dataset.edge === "up" ? 0 : scroller.scrollHeight,
      behavior: view.matchMedia?.("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  };
  root.addEventListener("click", click);
  root.ownerDocument.addEventListener("scroll", schedule, true);
  view.addEventListener("resize", schedule);
  root.ownerDocument.addEventListener("visibilitychange", schedule);
  const changes = new view.MutationObserver(schedule);
  changes.observe(root.ownerDocument.querySelector("main"), {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
  });
  const pages = new view.MutationObserver(schedule);
  pages.observe(root.ownerDocument.body, {
    attributes: true,
    attributeFilter: ["data-page"],
  });
  const resize = view.ResizeObserver ? new view.ResizeObserver(schedule) : null;
  for (const node of root.ownerDocument.querySelectorAll(
    "main, main > section, #paper, #diffScroll",
  ))
    resize?.observe(node);
  root.ownerDocument.fonts?.ready.then(schedule);
  update();
  return {
    update,
    dispose() {
      disposed = true;
      if (frame !== null) view.clearTimeout(frame);
      changes.disconnect();
      pages.disconnect();
      resize?.disconnect();
      root.removeEventListener("click", click);
      root.ownerDocument.removeEventListener("scroll", schedule, true);
      root.ownerDocument.removeEventListener("visibilitychange", schedule);
      view.removeEventListener("resize", schedule);
    },
  };
}
