// 显示区: one device preference shared by every reading/editing surface.
export function mountDisplayWidth({ request = fetch } = {}) {
  let width = 1120,
    saving = Promise.resolve();
  const root = document.documentElement;
  const apply = () => root.style.setProperty("--display-width", width + "px");
  const ready = request("/api/display")
    .then((r) => r.json())
    .then((v) => {
      width = Number(v.width) || 1120;
      apply();
    })
    .catch(() => {});
  const surfaces = [
    "#paper",
    "#previewPaper",
    "#comparePanel",
    "#shortcutsPanel",
    "#floatingPanel",
    "#updatesPanel",
    "#otherPanel",
    "#libraryDisplay",
  ];
  for (const selector of surfaces) {
    const surface = document.querySelector(selector);
    if (!surface) continue;
    surface.classList.add("display-area");
    for (const side of ["left", "right"]) {
      const grip = document.createElement("div");
      grip.className = "display-resizer " + side;
      grip.role = "separator";
      grip.tabIndex = 0;
      grip.setAttribute("aria-label", "调整显示区宽度");
      grip.setAttribute("aria-orientation", "vertical");
      const save = () => {
        const value = width;
        saving = saving
          .catch(() => {})
          .then(() =>
            request("/api/display", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ width: value }),
            }),
          );
      };
      grip.onpointerdown = (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const start = e.clientX,
          initial = width;
        grip.setPointerCapture(e.pointerId);
        document.body.classList.add("resizing-display");
        grip.onpointermove = (event) => {
          width = Math.round(
            Math.max(
              420,
              Math.min(
                2400,
                initial + (event.clientX - start) * (side === "right" ? 2 : -2),
              ),
            ),
          );
          apply();
        };
        const finish = () => {
          grip.onpointermove = null;
          document.body.classList.remove("resizing-display");
          save();
        };
        grip.onpointerup = finish;
        grip.onpointercancel = finish;
      };
      grip.onkeydown = (e) => {
        if (!["ArrowLeft", "ArrowRight"].includes(e.key)) return;
        e.preventDefault();
        width = Math.max(
          420,
          Math.min(
            2400,
            width +
              (e.key === "ArrowRight" ? 20 : -20) * (side === "right" ? 1 : -1),
          ),
        );
        apply();
        save();
      };
      surface.append(grip);
    }
  }
  return {
    ready,
    reset() {
      width = 1120;
      apply();
    },
  };
}
