import { bindHoldDrag } from "./reorder.js";
const $ = (id) => document.getElementById(id);
const el = (tag, text, cls) => {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
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
  let registry = { sets: [], groups: [] },
    groupFilter = "ungrouped",
    mode = "createSet",
    location = "",
    folder = "",
    busy = false;
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
  const run = (fn) => async () => {
    try {
      await fn();
    } catch (error) {
      $("libraryStatus").textContent = error.message;
      notify(error.message);
    }
  };
  async function act(payload, open = false) {
    if (busy) return;
    busy = true;
    document.body.inert = true;
    try {
      await beforeAction();
      const oldId = getSetId();
      registry = await request("/api/library", payload);
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
      $("libraryStatus").textContent = "";
    } finally {
      busy = false;
      document.body.inert = false;
    }
  }
  function editName(parent, value, commit, cancel = () => paint()) {
    const input = el("input");
    input.value = value;
    input.setAttribute("aria-label", "名称");
    parent.replaceChildren(input);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (input.value.trim()) run(() => commit(input.value.trim()))();
      else cancel();
    };
    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        finish();
      }
      if (e.key === "Escape") {
        done = true;
        cancel();
      }
    };
    input.onblur = finish;
    input.focus();
    input.select();
  }
  function popup(anchor, items) {
    document.querySelector(".library-popover")?.remove();
    const box = el("div", undefined, "library-popover");
    for (const [label, callback] of items) {
      const b = el("button", label);
      b.onclick = () => {
        box.remove();
        run(callback)();
      };
      box.append(b);
    }
    document.body.append(box);
    const r = anchor.getBoundingClientRect();
    box.style.left = Math.max(8, Math.min(r.left, innerWidth - 180)) + "px";
    box.style.top =
      Math.min(r.bottom + 4, innerHeight - box.offsetHeight - 8) + "px";
  }
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".library-popover,.group-menu,.assign-group"))
      document.querySelector(".library-popover")?.remove();
  });
  async function browse(path) {
    const data = await request(
      "/api/fs" + (path ? "?path=" + encodeURIComponent(path) : ""),
    );
    folder = data.path;
    $("folderPicker").hidden = false;
    $("folderAddress").value = folder;
    $("folderUp").disabled = data.parent === folder;
    $("folderUp").onclick = run(() => browse(data.parent));
    $("folderUse").hidden = mode === "openSet";
    $("folderShortcuts").replaceChildren();
    for (const s of data.shortcuts) {
      const b = el("button", s.name);
      b.onclick = run(() => browse(s.path));
      $("folderShortcuts").append(b);
    }
    $("folderEntries").replaceChildren();
    for (const entry of data.entries) {
      if (entry.kind === "text" && mode !== "openSet") continue;
      const b = el(
        "button",
        (entry.kind === "folder" ? "▸ " : "TXT  ") + entry.name,
        "folder-entry",
      );
      b.title = entry.path;
      b.onclick = run(async () => {
        if (entry.kind === "folder") await browse(entry.path);
        else {
          await act(
            { action: "openSet", path: entry.path, groupId: groupFilter },
            true,
          );
          $("folderPicker").hidden = true;
        }
      });
      $("folderEntries").append(b);
    }
  }
  function paint() {
    const selected = getSetId(),
      recent = [...registry.sets].sort((a, b) => b.lastOpened - a.lastOpened);
    if (!registry.groups?.some((g) => g.id === groupFilter))
      groupFilter = "ungrouped";
    $("recentSets").replaceChildren();
    for (const s of recent.filter((s, i) => i < 12 || s.id === selected)) {
      const o = el("option", s.name);
      o.value = s.id;
      o.title = s.path;
      $("recentSets").append(o);
    }
    $("recentSets").value = selected || "";
    $("recentSets").disabled = !recent.length;
    onLocation(recent.find((s) => s.id === selected));
    $("groupsList").replaceChildren();
    const groups = [...(registry.groups || [])].sort(
      (a, b) => Number(!!b.pinned) - Number(!!a.pinned),
    );
    for (const g of groups) {
      const row = el("div", undefined, "group-row");
      row.dataset.id = g.id;
      const name = el("button", (g.pinned ? "⌖ " : "") + g.name, "group-name");
      name.classList.toggle("active", groupFilter === g.id);
      name.onclick = () => {
        groupFilter = g.id;
        paint();
      };
      const menu = el("button", "⋯", "group-menu");
      menu.setAttribute("aria-label", "编辑分组：" + g.name);
      menu.onclick = () =>
        popup(menu, [
          [
            g.pinned ? "取消置顶" : "置顶",
            () => act({ action: "pinGroup", id: g.id }),
          ],
          ...(g.id === "ungrouped"
            ? []
            : [
                [
                  "重命名",
                  () =>
                    editName(row, g.name, (name) =>
                      act({ action: "renameGroup", id: g.id, name }),
                    ),
                ],
                ["删除", () => act({ action: "deleteGroup", id: g.id })],
              ]),
        ]);
      row.append(name, menu);
      $("groupsList").append(row);
      let moved = false;
      bindHoldDrag(row, {
        holdSelector: ".group-name",
        start: () => {
          row.classList.add("dragging");
          moved = false;
        },
        move: (_, y) => {
          const other = [...$("groupsList").children].find(
            (n) =>
              n !== row &&
              y >= n.getBoundingClientRect().top &&
              y <= n.getBoundingClientRect().bottom,
          );
          if (!other) return;
          const target = groups.find((g) => g.id === other.dataset.id);
          if (!!target?.pinned !== !!g.pinned) return;
          const below =
            y >
            other.getBoundingClientRect().top +
              other.getBoundingClientRect().height / 2;
          $("groupsList").insertBefore(row, below ? other.nextSibling : other);
          moved = true;
        },
        end: (cancel) => {
          row.classList.remove("dragging");
          if (cancel) {
            paint();
            return;
          }
          if (moved)
            run(() =>
              act({
                action: "reorderGroups",
                ids: [...$("groupsList").children].map((n) => n.dataset.id),
              }),
            )();
        },
      });
    }
    $("setsList").replaceChildren();
    for (const s of recent.filter(
      (s) => (s.groupId || "ungrouped") === groupFilter,
    )) {
      const row = el("div", undefined, "set-row"),
        info = el("div", undefined, "set-info"),
        name = el("button", s.name, "set-name");
      name.title = "打开词集";
      name.onclick = run(() => act({ action: "activateSet", id: s.id }, true));
      info.append(name, el("small", s.path));
      const actions = el("div", undefined, "set-actions"),
        group = el("button", "分组", "assign-group");
      group.onclick = () =>
        popup(
          group,
          groups.map((g) => [
            g.name,
            () => act({ action: "assignGroup", id: s.id, groupId: g.id }),
          ]),
        );
      const rename = el("button", "重命名");
      rename.onclick = () =>
        editName(info, s.name, (name) =>
          act({ action: "renameSet", id: s.id, name }),
        );
      const remove = el("button", "删除");
      remove.title = "从词集管理移除，保留 TXT 文件";
      remove.onclick = run(() => act({ action: "deleteSet", id: s.id }));
      actions.append(group, rename, remove);
      row.append(info, actions);
      $("setsList").append(row);
    }
    if (!$("setsList").children.length)
      $("setsList").append(el("p", "此分组暂无词集", "muted"));
  }
  $("newGroup").onclick = () => {
    const row = el("div", undefined, "group-row");
    $("groupsList").append(row);
    editName(row, "新分组", (name) => act({ action: "createGroup", name }));
  };
  $("chooseLocation").onclick = run(() => {
    mode = "createSet";
    return browse(location);
  });
  $("openFile").onclick = run(() => {
    mode = "openSet";
    return browse(location);
  });
  $("folderGo").onclick = run(() => browse($("folderAddress").value));
  $("folderAddress").onkeydown = (e) => {
    if (e.key === "Enter") {
      $("folderGo").click();
      e.preventDefault();
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
      {
        action: "createSet",
        name: $("libraryName").value,
        folder: location,
        groupId: groupFilter,
      },
      true,
    );
    location = "";
    $("libraryCreate").disabled = true;
    $("chosenLocation").textContent = "尚未选择保存位置";
  });
  $("recentSets").onchange = run(() =>
    act({ action: "activateSet", id: $("recentSets").value }, true),
  );
  return {
    refresh: run(async () => {
      const value = await request("/api/library");
      if (!Array.isArray(value.sets)) return;
      registry = value;
      paint();
    }),
    begin() {
      mode = "createSet";
      $("folderPicker").hidden = true;
    },
    repaint: paint,
  };
}
