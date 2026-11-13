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
    location = "",
    busy = false,
    picking = false;
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
    } catch (error) {
      // Restore the editable card after a failed rename without removing the set.
      paint();
      throw error;
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
      name.title = "点击重命名词集";
      name.onclick = () =>
        editName(line, s.name, (name) =>
          act({ action: "renameSet", id: s.id, name }),
        );
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
      const jump = el("button", "跳转");
      jump.title = "打开这个词集并返回编写";
      jump.onclick = run(() => act({ action: "activateSet", id: s.id }, true));
      const saveAs = el("button", "另存为");
      saveAs.title = "在所选位置保存一份独立的 TXT 副本";
      saveAs.onclick = run(async () => {
        await beforeAction();
        const value = await request("/api/picker", {
          kind: "save",
          initial: s.path.replace(/[^/\\]+$/, ""),
        });
        if (value.path)
          await act({ action: "saveAsSet", id: s.id, path: value.path });
      });
      const remove = el("button", "删除");
      remove.title = "从词集管理移除，保留 TXT 文件";
      remove.onclick = run(() => act({ action: "deleteSet", id: s.id }));
      actions.append(group, jump, saveAs, remove);
      const line = el("div", undefined, "set-name-line");
      line.append(name, actions);
      info.prepend(line);
      row.append(info);
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
  async function pick(kind) {
    if (picking) return;
    picking = true;
    $("chooseLocation").disabled = $("openFile").disabled = true;
    try {
      const result = await request("/api/picker", { kind, initial: location });
      if (!result.path) return;
      if (kind === "folder") {
        location = result.path;
        $("chosenLocation").textContent = location;
        $("libraryCreate").disabled = false;
      } else
        await act(
          { action: "openSet", path: result.path, groupId: groupFilter },
          true,
        );
    } finally {
      picking = false;
      $("chooseLocation").disabled = $("openFile").disabled = false;
    }
  }
  $("chooseLocation").onclick = run(() => pick("folder"));
  $("openFile").onclick = run(() => pick("file"));
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
    begin() {},
    repaint: paint,
  };
}
