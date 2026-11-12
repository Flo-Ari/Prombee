export function mountOtherSettings({
  request = fetch,
  onMarkdownChange = () => {},
  onAgentChange = () => {},
} = {}) {
  const $ = (id) => document.getElementById(id);
  let preferences = {
      enabled: false,
      target: null,
      recognizeMarkdown: true,
      pairDelimiters: true,
      autoSort: true,
      targetAgent: "codex",
      agentSkillFolders: {},
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
      autoSort: value.autoSort !== false,
      targetAgent: value.targetAgent || "codex",
      agentSkillFolders: value.agentSkillFolders || {},
    };
  }
  function paint(value) {
    preferences = values(value);
    $("copyJumpEnabled").checked = preferences.enabled;
    $("recognizeMarkdown").checked = preferences.recognizeMarkdown;
    $("pairDelimiters").checked = preferences.pairDelimiters;
    $("autoSort").checked = preferences.autoSort;
    $("targetAgent").value = preferences.targetAgent;
    $("skillFolderPath").textContent =
      preferences.agentSkillFolders[preferences.targetAgent] || "";
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
      $("autoSort").checked = preferences.autoSort;
      $("targetAgent").value = preferences.targetAgent;
      $("skillFolderPath").textContent =
        preferences.agentSkillFolders[preferences.targetAgent] || "";
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
  for (const [id, action] of [
    ["recognizeMarkdown", "markdown"],
    ["pairDelimiters", "pairs"],
    ["autoSort", "autoSort"],
  ]) {
    $(id).onchange = () => {
      const value = $(id).checked;
      preferences[id] = value;
      if (id === "recognizeMarkdown") onMarkdownChange(value);
      tail = tail
        .then(() => ready)
        .then(async () => {
          preferences = values(await api({ action, [id]: value }));
          $("otherStatus").textContent = "已保存";
        })
        .catch((error) => {
          $("otherStatus").textContent = error.message;
        });
      return tail;
    };
  }
  $("targetAgent").onchange = () => {
    const targetAgent = $("targetAgent").value;
    preferences.targetAgent = targetAgent;
    $("skillFolderPath").textContent =
      preferences.agentSkillFolders[targetAgent] || "";
    onAgentChange();
    tail = tail
      .then(() => ready)
      .then(async () => {
        preferences = values(await api({ action: "agent", targetAgent }));
        $("otherStatus").textContent = "已保存";
      })
      .catch((error) => {
        $("otherStatus").textContent = error.message;
      });
    return tail;
  };
  $("chooseSkillFolder").onclick = async () => {
    const targetAgent = preferences.targetAgent;
    $("chooseSkillFolder").disabled = true;
    try {
      const response = await request("/api/picker", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "folder",
          initial: preferences.agentSkillFolders[targetAgent] || "",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || "无法选择目录");
      if (!result.path) return;
      tail = tail
        .then(() =>
          api({ action: "skillFolder", targetAgent, folder: result.path }),
        )
        .then((value) => {
          preferences = values(value);
          $("skillFolderPath").textContent =
            preferences.agentSkillFolders[preferences.targetAgent] || "";
          onAgentChange();
        });
      await tail;
      $("otherStatus").textContent = "已保存";
    } catch (error) {
      $("otherStatus").textContent = error.message;
    } finally {
      $("chooseSkillFolder").disabled = false;
    }
  };
  $("refreshJumpTargets").onclick = show;
  return {
    show,
    ready,
    settled: () => tail,
    recognizeMarkdown: () => preferences.recognizeMarkdown,
    pairDelimiters: () => preferences.pairDelimiters,
    autoSort: () => preferences.autoSort,
    targetAgent: () => preferences.targetAgent,
    async afterCopy() {
      await ready;
      if (urlTimer) await save();
      await tail;
      if (preferences.enabled) await api({ action: "jump" });
    },
  };
}
