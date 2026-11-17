import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import "./editor/diagnostics";
export function MascotSurface() {
  return (
    <>
      <canvas
        id="mascotCanvas"
        aria-label="悬浮球，点击打开编辑器，右键打开菜单"
        role="button"
        tabIndex={0}
      />
      <div id="mascotMenu" role="menu" hidden />
    </>
  );
}
const container = document.getElementById("root");
if (!container) throw new Error("Missing mascot root");
flushSync(() => createRoot(container).render(<MascotSurface />));
await import("./editor/mascot");
