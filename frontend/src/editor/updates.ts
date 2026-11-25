import { byId as $ } from "./dom";
export function mountUpdates({ beforeInstall, request = fetch }) {
  let timer,
    installRequested = false,
    working = false,
    closing = false,
    started = false,
    disposed = false,
    updateHint = "";
  const busy = ["checking", "downloading", "installing", "restart"];
  function refreshHints() {
    for (const [id, label] of [
      ["settingsTab", "设置"],
      ["updatesTab", "更新"],
    ]) {
      const button = document.getElementById(id);
      if (!button) continue;
      button.classList.toggle("has-update", !!updateHint);
      button.dataset.updateHint = updateHint;
      button.title = [button.title.split("\n")[0] || label, updateHint]
        .filter(Boolean)
        .join("\n");
      if (updateHint) button.setAttribute("aria-description", updateHint);
      else button.removeAttribute("aria-description");
    }
  }
  async function api(action?: string) {
    const response = await request(
      "/api/update",
      action
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action }),
          }
        : undefined,
    );
    const value = await response.json();
    if (!response.ok) throw Error(value.error || "更新失败");
    return value;
  }
  function error(message) {
    installRequested = false;
    working = false;
    clearTimeout(timer);
    $("updateStatus").textContent = message;
    $("checkUpdate").disabled = false;
    $("installUpdate").disabled = false;
  }
  async function paint(value) {
    if (disposed) return;
    const available =
      value.updateAvailable ??
      (!!value.latest &&
        !["current", "installed", "restart"].includes(value.status));
    updateHint = available
      ? `可更新至 ${value.latest || "新版本"}，${value.cached || value.status === "ready" ? "已缓存，点击更新并重启以安装" : value.status === "downloading" ? "正在后台下载缓存，安装需手动确认" : "等待下载缓存，安装需手动确认"}`
      : "";
    refreshHints();
    $("currentVersion").textContent = value.current || "—";
    $("latestVersion").textContent = value.latest
      ? "最新版本 " + value.latest
      : "";
    $("updateStatus").textContent =
      value.message ||
      (value.canInstall
        ? "点击检查更新"
        : "浏览器和开发预览可检查版本，请在桌面版中安装更新");
    $("updateProgress").hidden = value.status !== "downloading";
    $("updateProgress").value = value.progress || 0;
    $("checkUpdate").disabled = busy.includes(value.status) || working;
    $("installUpdate").hidden =
      !value.canInstall ||
      !["available", "ready", "installed"].includes(value.status);
    $("installUpdate").disabled = working;
    $("installUpdate").textContent =
      value.status === "installed" ? "重启应用" : "更新并重启";
    if (["current", "error"].includes(value.status)) {
      installRequested = false;
      working = false;
    }
    if (
      installRequested &&
      ["ready", "installed"].includes(value.status) &&
      !working
    ) {
      working = true;
      try {
        await beforeInstall();
        const next = await api(
          value.status === "ready" ? "install" : "restart",
        );
        working = false;
        return paint(next);
      } catch (e) {
        error(e.message);
        return;
      }
    }
    if (value.status === "restart" && !closing) {
      closing = true;
      window.dispatchEvent(new window.Event("prombee-close"));
      return;
    }
    clearTimeout(timer);
    if (
      busy.includes(value.status) ||
      (installRequested && value.status === "installed")
    )
      timer = setTimeout(() => show(), 700);
  }
  async function show() {
    try {
      await paint(await api());
    } catch (e) {
      error(e.message);
    }
  }
  $("checkUpdate").onclick = async () => {
    try {
      installRequested = false;
      await paint(await api("check"));
    } catch (e) {
      error(e.message);
    }
  };
  $("installUpdate").onclick = async () => {
    try {
      installRequested = true;
      await beforeInstall();
      const value = await api();
      if (["ready", "installed"].includes(value.status)) await paint(value);
      else await paint(await api("download"));
    } catch (e) {
      error(e.message);
    }
  };
  async function online() {
    if (disposed) return;
    try {
      await paint(await api("startup"));
    } catch (e) {
      error(e.message);
    }
  }
  function start() {
    if (started) return;
    started = true;
    window.addEventListener("online", online);
    void show();
  }
  function stop() {
    disposed = true;
    clearTimeout(timer);
    window.removeEventListener("online", online);
  }
  return { show, start, stop, refreshHints };
}
