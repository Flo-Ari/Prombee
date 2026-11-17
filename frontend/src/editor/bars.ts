// app-bar: the shared window header and fixed page sidebar are styled in bars.css.
export function mountBars() {
  const main = document.querySelector("main"),
    toolbars = [...document.querySelectorAll<HTMLElement>(".toolbar")];
  // The React shell already owns layout; keep compatibility with isolated mounts.
  const workspace =
    document.querySelector<HTMLElement>(".workspace") ||
    document.createElement("div");
  const rail =
    document.querySelector<HTMLElement>(".tool-rail") ||
    document.createElement("aside");
  if (!workspace.isConnected) {
    workspace.className = "workspace";
    rail.className = "tool-rail app-bar";
    rail.setAttribute("aria-label", "页面工具栏");
    main.parentNode.insertBefore(workspace, toolbars[0] || main);
    rail.append(...toolbars);
    workspace.append(rail, main);
  }
  for (const bar of toolbars) bar.classList.add("app-bar");
  document.querySelector("header").classList.add("app-bar");
  const header = document.querySelector("header");
  const measure = () =>
    document.documentElement.style.setProperty(
      "--app-header-height",
      header.getBoundingClientRect().height + "px",
    );
  if (typeof ResizeObserver !== "undefined")
    new ResizeObserver(measure).observe(header);
  measure();
  return {
    show(_page?: string) {
      rail.hidden = toolbars.every((bar) => bar.hidden);
      workspace.classList.toggle("without-rail", rail.hidden);
      for (const bar of toolbars)
        bar.setAttribute("aria-orientation", "vertical");
    },
  };
}
