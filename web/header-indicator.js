// The indicator lives outside the horizontally scrollable tab strip, so it cannot be clipped.
export function mountHeaderIndicator(
  header = document.querySelector("header"),
) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("header-tab-pointer");
  svg.setAttribute("viewBox", "0 0 36 12");
  svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", "M0 0H36C28 0 25 3 22 7Q18 12 14 7C11 3 8 0 0 0Z");
  svg.append(path);
  document.body.append(svg);
  let pending = false;
  const update = () => {
    pending = false;
    const tab = header.querySelector("[role=tab][aria-selected=true]");
    if (!tab) {
      svg.style.opacity = "0";
      return;
    }
    const r = tab.getBoundingClientRect(),
      h = header.getBoundingClientRect();
    svg.style.left = r.left + r.width / 2 - 18 + "px";
    svg.style.top = r.bottom - 1 + "px";
    svg.style.opacity =
      r.width > 0 && r.left >= h.left && r.right <= h.right ? "1" : "0";
  };
  const schedule = () => {
    if (!pending) {
      pending = true;
      queueMicrotask(update);
    }
  };
  new window.MutationObserver(schedule).observe(header, {
    attributes: true,
    subtree: true,
    attributeFilter: ["aria-selected"],
  });
  header.addEventListener("scroll", schedule, true);
  window.addEventListener("resize", schedule);
  if (typeof ResizeObserver !== "undefined")
    new ResizeObserver(schedule).observe(header);
  update();
  return { update };
}
