const $ = (id) => document.getElementById(id);
const el = (tag, text, cls) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (cls) node.className = cls;
  return node;
};
export function createLibraryUI({
  beforeAction,
  onOpen,
  onEmpty,
  getSetId,
  notify,
  showEditor,
  onLocation = () => {},
}) {
  let registry = { sets: [], projects: [], trash: [] },
    mode = "createSet",
    location = "",
    folder = "",
    projectFilter = "";
  async function request(url, payload) {
    const response = await fetch(
      url,
      payload
        ? {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          }
        : undefined,
    );
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || "操作失败");
    return value;
  }
  const report = (error) => {
    $("libraryStatus").textContent = error.message;
    notify(error.message);
  };
  const run = (fn) => async () => {
    try {
      await fn();
    } catch (error) {
      report(error);
    }
  };
  let busy = false;
  async function act(payload, open = false) {
    if (busy) return;
    busy = true;
    document.body.inert = true;
    try {
      await beforeAction();
      $("libraryStatus").textContent = "正在处理…";
      const oldId = getSetId();
      registry = await request("/api/library", payload);
      paint();
      if (open || (oldId && !registry.sets.some((s) => s.id === oldId))) {
        if (registry.active) {
          await onOpen(
            await request(
              "/api/state?setId=" + encodeURIComponent(registry.active),
            ),
          );
          if (open) showEditor();
        } else onEmpty();
      }
      paint();
      $("libraryStatus").textContent = "已完成";
    } finally {
      busy = false;
      document.body.inert = false;
    }
  }
  function setMode(next) {
    mode = next;
    location = "";
    $("folderPicker").hidden = true;
    const names = {
      createSet: "新建词集",
      createProject: "新建项目",
      openSet: "打开 TXT 词集",
      openProject: "打开项目文件夹",
    };
    $("libraryFormTitle").textContent = names[mode];
    $("libraryNameLabel").hidden = mode.startsWith("open");
    $("libraryName").value = "";
    $("libraryName").placeholder =
      mode === "createProject" ? "项目名称" : "词集名称";
    $("chosenLocation").textContent =
      mode === "openSet" ? "选择设备上的 TXT 文件" : "尚未选择保存位置";
    $("chooseLocation").textContent = mode.startsWith("open")
      ? "浏览设备"
      : "选择保存位置";
    $("libraryCreate").hidden = mode === "openSet";
    $("libraryCreate").textContent =
      mode === "createSet"
        ? "创建词集"
        : mode === "createProject"
          ? "创建项目"
          : "打开项目";
    $("libraryCreate").disabled = true;
    document
      .querySelectorAll("[data-library-mode]")
      .forEach((button) =>
        button.classList.toggle("active", button.dataset.libraryMode === mode),
      );
  }
  async function browse(path) {
    const data = await request(
      "/api/fs" + (path ? "?path=" + encodeURIComponent(path) : ""),
    );
    folder = data.path;
    $("folderPicker").hidden = false;
    $("folderAddress").value = data.path;
    $("folderUp").disabled = data.parent === data.path;
    $("folderUp").onclick = run(() => browse(data.parent));
    $("folderUse").hidden = mode === "openSet";
    $("folderUse").textContent =
      mode === "openProject" ? "选择此项目文件夹" : "保存到此文件夹";
    $("folderShortcuts").replaceChildren();
    for (const shortcut of data.shortcuts) {
      const button = el("button", shortcut.name);
      button.onclick = run(() => browse(shortcut.path));
      $("folderShortcuts").append(button);
    }
    $("folderEntries").replaceChildren();
    for (const entry of data.entries) {
      if (entry.kind === "text" && mode !== "openSet") continue;
      const button = el(
        "button",
        (entry.kind === "folder" ? "▸ " : "TXT  ") + entry.name,
        "folder-entry",
      );
      button.title = entry.path;
      button.onclick = run(async () => {
        if (entry.kind === "folder") await browse(entry.path);
        else {
          await act({ action: "openSet", path: entry.path }, true);
          $("folderPicker").hidden = true;
        }
      });
      $("folderEntries").append(button);
    }
    if (!$("folderEntries").children.length)
      $("folderEntries").append(el("p", "此文件夹暂无可选内容", "muted"));
  }
  function paint() {
    const selected = getSetId();
    $("recentSets").replaceChildren();
    const recent = [...registry.sets].sort(
      (a, b) => b.lastOpened - a.lastOpened,
    );
    for (const set of recent
      .slice(0, 12)
      .concat(recent.slice(12).filter((s) => s.id === selected))) {
      const option = el("option", set.name);
      option.value = set.id;
      option.title = set.path;
      $("recentSets").append(option);
    }
    $("recentSets").value = selected || "";
    onLocation(registry.sets.find((set) => set.id === selected));
    $("recentSets").disabled = !registry.sets.length;
    $("projectsList").replaceChildren();
    const all = el("button", "全部词集");
    all.classList.toggle("active", !projectFilter);
    all.onclick = () => {
      projectFilter = "";
      paint();
    };
    $("projectsList").append(all);
    for (const project of registry.projects) {
      const button = el("button", "▸ " + project.name);
      button.title = project.path;
      button.classList.toggle("active", projectFilter === project.id);
      button.onclick = () => {
        projectFilter = project.id;
        paint();
      };
      $("projectsList").append(button);
    }
    $("setsList").replaceChildren();
    for (const set of recent.filter(
      (s) => !projectFilter || s.projectId === projectFilter,
    )) {
      const row = el("div", undefined, "set-row"),
        info = el("div", undefined, "set-info");
      const name = el("input");
      name.value = set.name;
      name.setAttribute("aria-label", "词集名称：" + set.name);
      const path = el("small", set.path);
      info.append(name, path);
      const open = el("button", set.id === selected ? "当前词集" : "打开");
      open.onclick = run(() =>
        act({ action: "activateSet", id: set.id }, true),
      );
      const rename = el("button", "重命名");
      rename.onclick = run(() =>
        act({ action: "renameSet", id: set.id, name: name.value }),
      );
      const remove = el("button", "删除");
      remove.title = "移入词集回收站，可恢复";
      remove.onclick = run(() => act({ action: "deleteSet", id: set.id }));
      const actions = el("div", undefined, "set-actions");
      actions.append(open, rename, remove);
      if (registry.projects.length) {
        const project = el("select");
        project.setAttribute("aria-label", "加入项目：" + set.name);
        for (const p of registry.projects) {
          const option = el("option", p.name);
          option.value = p.id;
          project.append(option);
        }
        if (set.projectId) project.value = set.projectId;
        const move = el("button", "加入项目");
        move.title = "将此 TXT 文件移动到项目文件夹";
        move.onclick = run(() =>
          act({ action: "moveSet", id: set.id, projectId: project.value }),
        );
        actions.append(project, move);
      }
      row.append(info, actions);
      $("setsList").append(row);
    }
    if (!$("setsList").children.length)
      $("setsList").append(
        el("p", "暂无词集，可新建或打开 TXT 文件。", "muted"),
      );
    $("trashList").replaceChildren();
    for (const set of registry.trash) {
      const row = el("div", undefined, "trash-row");
      const restore = el("button", "恢复");
      restore.onclick = run(() =>
        act({ action: "restoreSet", id: set.id }, true),
      );
      row.append(el("span", set.name), restore);
      $("trashList").append(row);
    }
    if (!registry.trash.length)
      $("trashList").append(el("p", "回收站为空", "muted"));
  }
  for (const button of document.querySelectorAll("[data-library-mode]"))
    button.onclick = () => setMode(button.dataset.libraryMode);
  $("chooseLocation").onclick = run(() =>
    browse(
      location || registry.projects.find((p) => p.id === projectFilter)?.path,
    ),
  );
  $("folderGo").onclick = run(() => browse($("folderAddress").value));
  $("folderAddress").onkeydown = (event) => {
    if (event.key === "Enter") {
      $("folderGo").click();
      event.preventDefault();
    }
  };
  $("folderCancel").onclick = () => {
    $("folderPicker").hidden = true;
  };
  $("folderUse").onclick = () => {
    location = folder;
    $("chosenLocation").textContent = folder;
    $("libraryCreate").disabled = false;
    $("folderPicker").hidden = true;
  };
  $("libraryCreate").onclick = run(async () => {
    await act(
      { action: mode, name: $("libraryName").value, folder: location },
      mode === "createSet",
    );
    location = "";
    $("libraryCreate").disabled = true;
    $("chosenLocation").textContent = "尚未选择保存位置";
  });
  $("recentSets").onchange = run(() =>
    act({ action: "activateSet", id: $("recentSets").value }, true),
  );
  setMode(mode);
  return {
    refresh: run(async () => {
      const value = await request("/api/library");
      if (!Array.isArray(value.sets)) return;
      registry = value;
      paint();
    }),
    begin() {
      setMode("createSet");
    },
    repaint: paint,
  };
}
