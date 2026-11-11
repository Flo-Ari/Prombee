// app-bar: shared header/tool-bar presentation lives in bars.css.
export function mountBars({ request = fetch } = {}) {
  const main = document.querySelector("main");
  const toolbars = [...document.querySelectorAll(".toolbar")];
  const workspace = document.createElement("div");
  workspace.className = "workspace";
  workspace.dataset.dock = "left";
  const rail = document.createElement("aside");
  rail.className = "tool-rail app-bar";
  rail.setAttribute("aria-label", "页面工具栏");
  const grip = document.createElement("button");
  grip.className = "bar-grip";
  grip.type = "button";
  grip.setAttribute("aria-label", "移动工具栏");
  grip.title = "拖动到顶部或左侧，双击或按 Enter 切换";
  grip.innerHTML =
    '<svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true"><circle cx="6" cy="4" r="1.2"/><circle cx="12" cy="4" r="1.2"/><circle cx="6" cy="9" r="1.2"/><circle cx="12" cy="9" r="1.2"/><circle cx="6" cy="14" r="1.2"/><circle cx="12" cy="14" r="1.2"/></svg>';
  main.parentNode.insertBefore(workspace, toolbars[0] || main);
  rail.append(grip, ...toolbars);
  workspace.append(rail, main);
  for (const bar of toolbars) bar.classList.add("app-bar");
  document.querySelector("header").classList.add("app-bar");
  const targets = ["left", "top"].map((position) => {
    const target = document.createElement("div");
    target.className = "dock-target";
    target.dataset.position = position;
    target.textContent = position === "left" ? "左侧栏" : "顶部栏";
    workspace.append(target);
    return target;
  });
  let page = "editor",
    positions = {},
    drag = null,
    tail = Promise.resolve();
  async function api(payload) {
    const response = await request(
      "/api/layout",
      payload
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        : undefined,
    );
    const value = await response.json();
    if (!response.ok) throw Error(value.error || "工具栏位置保存失败");
    return value;
  }
  function paint() {
    workspace.dataset.dock = positions[page] || "left";
    rail.hidden = toolbars.every((bar) => bar.hidden);
    for (const bar of toolbars)
      bar.setAttribute(
        "aria-orientation",
        workspace.dataset.dock === "left" ? "vertical" : "horizontal",
      );
  }
  const ready = api()
    .then((value) => {
      positions = { ...value.positions, ...positions };
      paint();
    })
    .catch(() => {});
  function dock(position) {
    if (!["top", "left"].includes(position)) return;
    positions[page] = position;
    const savedPage = page;
    paint();
    tail = tail
      .then(() => ready)
      .then(() => api({ page: savedPage, position }))
      .then(() => {
        grip.classList.remove("save-failed");
        grip.title = "拖动到顶部或左侧，双击或按 Enter 切换";
      })
      .catch((error) => {
        grip.classList.add("save-failed");
        grip.title = error.message;
      });
  }
  const toggle = () => dock(workspace.dataset.dock === "left" ? "top" : "left");
  grip.ondblclick = toggle;
  grip.onclick = (event) => {
    if (event.detail === 0) toggle();
  };
  grip.onpointerdown = (event) => {
    if (event.button !== 0) return;
    drag = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      started: false,
      target: null,
    };
    grip.setPointerCapture?.(event.pointerId);
  };
  grip.onpointermove = (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    if (
      !drag.started &&
      Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6
    )
      return;
    drag.started = true;
    const bounds = workspace.getBoundingClientRect();
    const x = event.clientX - bounds.left,
      y = event.clientY - bounds.top;
    drag.target =
      x >= 0 && y >= 0 && x <= bounds.width && y <= bounds.height
        ? x < 170
          ? "left"
          : y < 100
            ? "top"
            : null
        : null;
    workspace.dataset.dragging = "true";
    for (const target of targets)
      target.classList.toggle(
        "dock-active",
        target.dataset.position === drag.target,
      );
  };
  function end(commit) {
    if (!drag) return;
    const finished = drag;
    drag = null;
    if (grip.hasPointerCapture?.(finished.id))
      grip.releasePointerCapture(finished.id);
    delete workspace.dataset.dragging;
    for (const target of targets) target.classList.remove("dock-active");
    if (commit && finished.started && finished.target) dock(finished.target);
  }
  grip.onpointerup = () => end(true);
  grip.onpointercancel = () => end(false);
  window.addEventListener("blur", () => end(false));
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") end(false);
  });
  paint();
  return {
    ready,
    settled: () => tail,
    dock,
    show(value) {
      end(false);
      page = value;
      paint();
    },
  };
}
