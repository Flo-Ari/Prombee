export function mountOtherSettings({
  request = fetch,
  onMarkdownChange = () => {},
} = {}) {
  const $ = (id) => document.getElementById(id);
  let preferences = {
      enabled: false,
      target: null,
      recognizeMarkdown: true,
      pairDelimiters: true,
    },
    entries = [],
    tail = Promise.resolve(),
    urlTimer;
  async function api(payload) {
    const r = await request(
      "/api/other",
      payload
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        : undefined,
    );
    const value = await r.json();
    if (!r.ok) throw Error(value.error || "设置保存失败");
    return value;
  }
  function values(value) {
    return {
      enabled: value.enabled === true,
      target: value.target || null,
      recognizeMarkdown: value.recognizeMarkdown !== false,
      pairDelimiters: value.pairDelimiters !== false,
    };
  }
  function paint(value) {
    preferences = values(value);
    $("copyJumpEnabled").checked = preferences.enabled;
    $("recognizeMarkdown").checked = preferences.recognizeMarkdown;
    $("pairDelimiters").checked = preferences.pairDelimiters;
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
  const ready = request("/api/other?preferences=1")
    .then((r) => r.json())
    .then((value) => {
      preferences = values(value);
      $("copyJumpEnabled").checked = preferences.enabled;
      $("recognizeMarkdown").checked = preferences.recognizeMarkdown;
      $("pairDelimiters").checked = preferences.pairDelimiters;
    })
    .catch(() => {});
  function save() {
    clearTimeout(urlTimer);
    urlTimer = null;
    const recognizeMarkdown = $("recognizeMarkdown").checked,
      value = $("copyJumpTarget").value;
    let target =
      value === "url"
        ? { kind: "url", url: $("copyJumpUrl").value.trim() }
        : entries.find((t) => t.id === value) || null;
    if (target?.kind === "url") {
      try {
        const u = new URL(target.url);
        if (!["http:", "https:"].includes(u.protocol)) target = null;
      } catch {
        target = null;
      }
    }
    const requested = $("copyJumpEnabled").checked;
    // A newly enabled destination becomes active once a complete destination is selected.
    const payload = {
      action: "save",
      enabled: requested && !!target,
      target,
      recognizeMarkdown,
    };
    preferences.recognizeMarkdown = recognizeMarkdown;
    tail = tail
      .then(() => ready)
      .then(async () => {
        preferences = values(await api(payload));
        $("otherStatus").textContent =
          requested && !target ? "请选择跳转目标" : "已保存";
      })
      .catch((error) => {
        $("otherStatus").textContent = error.message;
      });
    return tail;
  }
  async function show() {
    $("otherStatus").textContent = "正在读取设备上的应用与窗口…";
    try {
      await ready;
      await tail;
      paint(await api());
      $("otherStatus").textContent = "";
    } catch (error) {
      $("otherStatus").textContent = error.message;
    }
  }
  $("copyJumpEnabled").onchange = save;
  $("copyJumpTarget").onchange = () => {
    $("copyJumpUrlRow").hidden = $("copyJumpTarget").value !== "url";
    return save();
  };
  $("copyJumpUrl").oninput = () => {
    clearTimeout(urlTimer);
    urlTimer = setTimeout(save, 300);
  };
  $("copyJumpUrl").onchange = save;
  $("recognizeMarkdown").onchange = () => {
    preferences.recognizeMarkdown = $("recognizeMarkdown").checked;
    onMarkdownChange(preferences.recognizeMarkdown);
    const recognizeMarkdown = preferences.recognizeMarkdown;
    tail = tail
      .then(() => ready)
      .then(async () => {
        preferences = values(
          await api({ action: "markdown", recognizeMarkdown }),
        );
        $("otherStatus").textContent = "已保存";
      })
      .catch((error) => {
        $("otherStatus").textContent = error.message;
      });
    return tail;
  };
  $("pairDelimiters").onchange = () => {
    const pairDelimiters = $("pairDelimiters").checked;
    preferences.pairDelimiters = pairDelimiters;
    tail = tail
      .then(() => ready)
      .then(async () => {
        preferences = values(await api({ action: "pairs", pairDelimiters }));
        $("otherStatus").textContent = "已保存";
      })
      .catch((error) => {
        $("otherStatus").textContent = error.message;
      });
    return tail;
  };
  $("refreshJumpTargets").onclick = show;
  return {
    show,
    ready,
    settled: () => tail,
    recognizeMarkdown: () => preferences.recognizeMarkdown,
    pairDelimiters: () => preferences.pairDelimiters,
    async afterCopy() {
      await ready;
      if (urlTimer) await save();
      await tail;
      if (preferences.enabled) await api({ action: "jump" });
    },
  };
}
