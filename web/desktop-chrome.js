import { productName } from "./brand.js";
import { mountMascot } from "./mascot.js";
const platform = new URLSearchParams(location.search).get("desktop");
const native = platform === "windows" || platform === "gtk";
export function logoTarget() {
  const r = document.querySelector(".brand img").getBoundingClientRect();
  return {
    x: r.x + r.width * 0.5,
    y: r.y + (r.height * 53) / 128,
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
if (platform !== "gtk") {
  const chrome = document.createElement("div");
  chrome.className = "window-chrome";
  chrome.innerHTML =
    '<div class="window-drag pywebview-drag-region"></div><button id="minimizeWindow" title="最小化" aria-label="最小化">−</button><button id="maximizeWindow" title="最大化 / 还原" aria-label="最大化或还原">□</button><button id="closeWindow" title="关闭" aria-label="关闭">×</button>';
  chrome.querySelector(".window-drag").textContent = productName;
  document.body.prepend(chrome);
  chrome.querySelector("#minimizeWindow").onclick = () =>
    post("collapse", { logo: logoTarget() });
  chrome.querySelector("#maximizeWindow").onclick = () =>
    native ? post("maximize") : document.documentElement.requestFullscreen?.();
  chrome.querySelector("#closeWindow").onclick = () =>
    native ? post("close") : document.exitFullscreen?.();
}
let demo, mascot, demoCenter;
function demoAction(action, data) {
  if (action === "collapse") {
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
    mascot.receive("morph", {
      direction: "close",
      dark: document.body.classList.contains("dark"),
      from: { x: demoCenter.x + 26, y: demoCenter.y - 8 },
      to: data.logo,
      editor: { x: 0, y: 0, width: innerWidth, height: innerHeight },
    });
  }
  if (action === "open")
    mascot.receive("morph", {
      direction: "open",
      dark: document.body.classList.contains("dark"),
      from: { x: demoCenter.x + 26, y: demoCenter.y - 8 },
      to: logoTarget(),
      editor: { x: 0, y: 0, width: innerWidth, height: innerHeight },
    });
  if (action === "morphDone") {
    if (data.direction === "open") {
      demo.hidden = true;
      mascot.receive("pause");
    } else mascot.receive("show");
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
