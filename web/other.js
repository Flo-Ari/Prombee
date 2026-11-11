export function mountOtherSettings({ request = fetch } = {}) {
  const $ = (id) => document.getElementById(id);
  let preferences = { enabled: false, target: null },
    entries = [];
  async function api(payload) {
    const response = await request(
      "/api/other",
      payload
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        : undefined,
    );
    const value = await response.json();
    if (!response.ok) throw Error(value.error || "其他设置读取失败");
    return value;
  }
  function paint(value) {
    preferences = {
      enabled: value.enabled === true,
      target: value.target || null,
    };
    $("copyJumpEnabled").checked = preferences.enabled;
    const select = $("copyJumpTarget");
    select.replaceChildren();
    entries = [];
    const option = (parent, text, value) => {
      const o = document.createElement("option");
      o.textContent = text;
      o.value = value;
      parent.append(o);
    };
    option(select, "请选择应用或页面", "");
    for (const [key, label] of [
      ["windows", "已打开窗口（含浏览器当前页面）"],
      ["applications", "已安装应用"],
    ]) {
      if (!value[key]?.length) continue;
      const group = document.createElement("optgroup");
      group.label = label;
      for (const target of value[key]) {
        entries.push(target);
        option(group, target.name, target.id);
      }
      select.append(group);
    }
    option(select, "网页地址", "url");
    const target = preferences.target;
    if (target?.kind === "url") {
      select.value = "url";
      $("copyJumpUrl").value = target.url;
    } else if (target) {
      if (!entries.some((t) => t.id === target.id)) {
        entries.push(target);
        option(select, target.name + "（当前未打开）", target.id);
      }
      select.value = target.id;
    }
    $("copyJumpUrlRow").hidden = select.value !== "url";
  }
  async function show() {
    $("otherStatus").textContent = "正在读取设备上的应用与窗口…";
    try {
      await ready;
      paint(await api());
      $("otherStatus").textContent = "";
    } catch (error) {
      $("otherStatus").textContent = error.message;
    }
  }
  $("copyJumpTarget").onchange = () => {
    $("copyJumpUrlRow").hidden = $("copyJumpTarget").value !== "url";
  };
  $("refreshJumpTargets").onclick = show;
  $("saveOtherSettings").onclick = async () => {
    await ready;
    const value = $("copyJumpTarget").value;
    const target =
      value === "url"
        ? { kind: "url", url: $("copyJumpUrl").value }
        : entries.find((t) => t.id === value) || null;
    $("saveOtherSettings").disabled = true;
    try {
      preferences = await api({
        action: "save",
        enabled: $("copyJumpEnabled").checked,
        target,
      });
      $("otherStatus").textContent = "已保存";
    } catch (error) {
      $("otherStatus").textContent = error.message;
    } finally {
      $("saveOtherSettings").disabled = false;
    }
  };
  // Only device preferences are loaded on startup; window enumeration waits for this page.
  const ready = request("/api/other?preferences=1")
    .then((r) => r.json())
    .then((value) => {
      preferences = {
        enabled: value.enabled === true,
        target: value.target || null,
      };
    })
    .catch(() => {});
  return {
    show,
    ready,
    async afterCopy() {
      await ready;
      if (preferences.enabled) await api({ action: "jump" });
    },
  };
}
