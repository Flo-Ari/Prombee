// app-bar: the shared window header and fixed page sidebar are styled in bars.css.
export function mountBars() {
  const main = document.querySelector("main"),
    toolbars = [...document.querySelectorAll(".toolbar")];
  const workspace = document.createElement("div");
  workspace.className = "workspace";
  const rail = document.createElement("aside");
  rail.className = "tool-rail app-bar";
  rail.setAttribute("aria-label", "页面工具栏");
  main.parentNode.insertBefore(workspace, toolbars[0] || main);
  rail.append(...toolbars);
  workspace.append(rail, main);
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
    show() {
      rail.hidden = toolbars.every((bar) => bar.hidden);
      workspace.classList.toggle("without-rail", rail.hidden);
      for (const bar of toolbars)
        bar.setAttribute("aria-orientation", "vertical");
    },
  };
}
