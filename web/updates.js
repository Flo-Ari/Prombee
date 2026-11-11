export function mountUpdates({ beforeInstall, request = fetch }) {
  const $ = (id) => document.getElementById(id);
  let timer,
    automatic = false,
    working = false,
    closing = false;
  const busy = ["checking", "downloading", "installing", "restart"];
  async function api(action) {
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
    automatic = false;
    working = false;
    clearTimeout(timer);
    $("updateStatus").textContent = message;
    $("checkUpdate").disabled = false;
    $("installUpdate").disabled = false;
  }
  async function paint(value) {
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
    if (value.status === "error") {
      automatic = false;
      working = false;
    }
    if (
      automatic &&
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
      (automatic && value.status === "installed")
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
      automatic = false;
      await paint(await api("check"));
    } catch (e) {
      error(e.message);
    }
  };
  $("installUpdate").onclick = async () => {
    try {
      automatic = true;
      await beforeInstall();
      const value = await api();
      if (["ready", "installed"].includes(value.status)) await paint(value);
      else await paint(await api("download"));
    } catch (e) {
      error(e.message);
    }
  };
  return { show };
}
