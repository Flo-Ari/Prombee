import "./brand.js";
import { mountMascot } from "./mascot.js";
const platform = new URLSearchParams(location.search).get("desktop");
const native = platform === "windows" || platform === "gtk";
export function logoTarget() {
  const image = document.querySelector(".brand img"),
    r = image.getBoundingClientRect(),
    lockup = image.classList.contains("brand-lockup");
  return {
    x: r.x + r.width * (lockup ? 26.5 / 190 : 0.5),
    y: r.y + r.height * (lockup ? (7 + (51 * 53) / 128) / 64 : 53 / 128),
    dark: document.body.classList.contains("dark"),
  };
}
window.prombeeLogoTarget = logoTarget;
function post(action, data = {}) {
  const msg = { action, ...data };
  if (window.pywebview?.api?.mascot) return window.pywebview.api.mascot(msg);
  if (window.webkit?.messageHandlers?.mascot)
    return window.webkit.messageHandlers.mascot.postMessage(
      JSON.stringify(msg),
    );
  demoAction(action, data);
}
window.addEventListener("prombee-minimize", () =>
  post("collapse", { logo: logoTarget() }),
);
const chrome = document.querySelector(".window-chrome");
chrome.querySelector("#minimizeWindow").onclick = () =>
  post("collapse", { logo: logoTarget() });
chrome.querySelector("#maximizeWindow").onclick = () =>
  native
    ? post("maximize")
    : document.fullscreenElement
      ? document.exitFullscreen?.()
      : document.documentElement.requestFullscreen?.();
chrome.querySelector("#closeWindow").onclick = () =>
  native ? post("close") : document.exitFullscreen?.();
function windowState(maximized) {
  const button = chrome.querySelector("#maximizeWindow");
  button.dataset.maximized = String(maximized);
  button.title = maximized ? "还原" : "最大化";
  button.setAttribute("aria-label", maximized ? "还原窗口" : "最大化窗口");
  button.innerHTML = maximized
    ? '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 8V4h12v12h-4M4 8h12v12H4z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>'
    : '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="4" y="4" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
}
window.addEventListener("prombee-window-state", (event) =>
  windowState(!!event.detail?.maximized),
);
document.addEventListener("fullscreenchange", () =>
  windowState(!!document.fullscreenElement),
);
windowState(false);
if (native) post("windowState");
window.addEventListener("pywebviewready", () => {
  if (native) post("windowState");
});
const dragRegion = chrome.querySelector(".window-header");
const interactive = (target) =>
  !!target.closest("button,select,input,a,label,[role=tab]");
// Only blank header space starts a native drag; controls keep ordinary mouse behavior.
for (const control of dragRegion.querySelectorAll(
  "button,select,input,a,label",
)) {
  control.addEventListener("mousedown", (event) => event.stopPropagation());
}
chrome.addEventListener("mousedown", (event) => {
  if (event.button !== 0 || interactive(event.target)) return;
  if (native) post("windowDrag");
});
chrome.addEventListener("dblclick", (event) => {
  if (event.button === 0 && !interactive(event.target))
    chrome.querySelector("#maximizeWindow").click();
});

let demo,
  mascot,
  demoCenter,
  orbEnabled = true;
window.addEventListener("prombee-floating-enabled", (event) => {
  orbEnabled = event.detail;
  if (!orbEnabled && demo) demoAction("hide");
});
function demoAction(action, data) {
  if (action === "collapse") {
    if (!orbEnabled) return;
    if (!demo) {
      demo = document.createElement("section");
      demo.id = "mascotDemo";
      demo.innerHTML =
        '<canvas id="mascotCanvas" role="button" tabindex="0" aria-label="蜜蜂悬浮球，点击打开，右键选择动画"></canvas><div id="mascotMenu" role="menu" hidden></div><span class="demo-hint">悬浮球预览 · 点击蜜蜂展开 · 右键选择待机动画 · 拖动蜜蜂</span>';
      document.body.append(demo);
      mascot = mountMascot(
        demo.querySelector("canvas"),
        demo.querySelector("#mascotMenu"),
        demoAction,
      );
    }
    demo.hidden = false;
    demoCenter ||= { x: innerWidth / 2, y: innerHeight / 2 };
    mascot.receive("anchor", demoCenter);
    mascot.receive("show");
  }
  if (action === "open") {
    demo.hidden = true;
    mascot.receive("pause");
  }
  if (action === "drag") {
    demoCenter = {
      x: Math.max(100, Math.min(innerWidth - 100, demoCenter.x + data.dx)),
      y: Math.max(90, Math.min(innerHeight - 90, demoCenter.y + data.dy)),
    };
    mascot.receive("anchor", demoCenter);
  }
  if (action === "hide") {
    demo.hidden = true;
    mascot.receive("pause");
  }
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && demo && !demo.hidden) {
    demo.hidden = true;
    mascot.receive("pause");
  }
});
