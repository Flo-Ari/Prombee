export const SHORTCUTS = [
  ["insert", "添加条目／标题", "Ctrl+N"],
  ["newRound", "新建一轮", "Ctrl+Shift+N"],
  ["library", "词集与项目", "Ctrl+Alt+O"],
  ["deleteRound", "删除本轮", ""],
  ["collapse", "最小化为悬浮球", "Ctrl+M"],
  ["previous", "上一条目／标题", "ArrowUp"],
  ["next", "下一条目／标题", "ArrowDown"],
  ["save", "保存", "Ctrl+S"],
  ["copy", "复制提示词", "Ctrl+Shift+C"],
  ["copyAll", "复制全部常用提示词", "Ctrl+Alt+C"],
  ["undo", "撤销", "Ctrl+Z"],
  ["redo", "重做", "Ctrl+Shift+Z"],
  ["redoAlt", "重做（备用）", "Ctrl+Y"],
  ["bold", "粗体", "Ctrl+B"],
  ["italic", "斜体", "Ctrl+I"],
  ["multi", "多选／全选", "Ctrl+Shift+M"],
  ["exclude", "切换当前条目的复制参与状态", "Ctrl+Shift+E"],
  ["delete", "删除当前条目／标题及下级", "Ctrl+Shift+Backspace"],
  ["deleteEmpty", "删除本轮空项", "Ctrl+Alt+K"],
  ["fold", "折叠／展开当前标题", "Ctrl+Shift+L"],
  ["preview", "预览", "Ctrl+Alt+P"],
  ["compare", "历史对比", "Ctrl+Alt+D"],
  ["editor", "编写", "Ctrl+Alt+E"],
  ["template", "模板", "Ctrl+Alt+T"],
  ["common", "常用提示词", "Ctrl+Alt+U"],
  ["settings", "快捷键设置", "Ctrl+Alt+H"],
  ["theme", "切换深浅主题", "Ctrl+Shift+J"],
  ["voice", "开始／停止语音输入", "Ctrl+Alt+V"],
];
export const DEFAULT_SHORTCUTS = Object.fromEntries(
  SHORTCUTS.map(([id, , key]) => [id, key]),
);
export function keyCombo(event) {
  if (
    event.isComposing ||
    [
      "Control",
      "Meta",
      "Alt",
      "Shift",
      "Process",
      "Unidentified",
      "Dead",
      "AltGraph",
    ].includes(event.key) ||
    event.getModifierState?.("AltGraph")
  )
    return "";
  const key =
    event.key === " "
      ? "Space"
      : event.key.length === 1
        ? event.key.toUpperCase()
        : event.key;
  return [
    event.ctrlKey || event.metaKey ? "Ctrl" : "",
    event.altKey ? "Alt" : "",
    event.shiftKey ? "Shift" : "",
    key,
  ]
    .filter(Boolean)
    .join("+");
}
export function validateBindings(bindings) {
  const used = new Map();
  for (const [id, label] of SHORTCUTS) {
    const value = bindings[id];
    if (typeof value !== "string") return "快捷键格式无效";
    if (!value) continue;
    if (
      !/^(Ctrl\+)?(Alt\+)?(Shift\+)?([A-Z0-9]|F([1-9]|1[0-2])|Arrow(Up|Down)|Backspace|Delete|Enter|Space|Home|End|PageUp|PageDown|Escape)$/.test(
        value,
      )
    )
      return "请使用有效的组合键";
    if (
      !/Ctrl\+|Alt\+/.test(value) &&
      !/^F\d+$/.test(value) &&
      !["ArrowUp", "ArrowDown"].includes(value)
    )
      return "请使用 Ctrl 或 Alt 组合键";
    if (
      ["Ctrl+Alt+Backspace", "Ctrl+Alt+Delete", "Alt+F4", "Alt+Tab"].includes(
        value,
      ) ||
      /^Ctrl\+Alt\+F\d+$/.test(value)
    )
      return "该组合键由系统保留";
    if (used.has(value)) return `与“${used.get(value)}”冲突`;
    used.set(value, label);
  }
  return "";
}
export const displayCombo = (value) =>
  value
    .replace("ArrowUp", "↑")
    .replace("ArrowDown", "↓")
    .replace("Backspace", "⌫");
export function mountShortcuts(root, { onChange, request = fetch } = {}) {
  let bindings = { ...DEFAULT_SHORTCUTS },
    draft = { ...bindings },
    edited = false;
  const rows = root.querySelector(".shortcut-rows"),
    status = root.querySelector("[role=status]");
  const inputs = new Map();
  function refresh() {
    for (const [id, input] of inputs) {
      input.value = displayCombo(draft[id]);
      input.dataset.binding = draft[id];
    }
  }
  function updateDraft() {
    edited = true;
    const error = validateBindings(draft);
    status.textContent = error || "尚未保存";
    root.querySelector("#saveShortcuts").disabled = !!error;
  }
  for (const [id, label] of SHORTCUTS) {
    const row = document.createElement("label");
    row.className = "shortcut-row";
    const name = document.createElement("span");
    name.textContent = label;
    const input = document.createElement("input");
    input.className = "shortcut-key";
    input.readOnly = true;
    input.placeholder = "未设置";
    input.dataset.action = id;
    input.setAttribute("aria-label", label + "快捷键");
    input.onkeydown = (event) => {
      if (event.key === "Tab") return;
      event.preventDefault();
      event.stopPropagation();
      if (event.isComposing) return;
      if (event.key === "Escape") {
        input.blur();
        return;
      }
      const combo = keyCombo(event);
      if (!combo) return;
      draft[id] = ["Backspace", "Delete"].includes(combo) ? "" : combo;
      refresh();
      updateDraft();
    };
    row.append(name, input);
    rows.append(row);
    inputs.set(id, input);
  }
  root.querySelector("#resetShortcuts").onclick = () => {
    draft = { ...DEFAULT_SHORTCUTS };
    refresh();
    updateDraft();
  };
  root.querySelector("#saveShortcuts").onclick = async () => {
    const error = validateBindings(draft);
    if (error) {
      status.textContent = error;
      return;
    }
    const snapshot = { ...draft };
    try {
      const response = await request("/api/shortcuts", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bindings: snapshot }),
      });
      if (!response.ok) throw new Error("快捷键保存失败");
      const saved = await response.json();
      if (validateBindings(saved.bindings || {}))
        throw new Error("快捷键保存失败");
      bindings = { ...saved.bindings };
      onChange?.({ ...bindings });
      status.textContent =
        JSON.stringify(draft) === JSON.stringify(snapshot)
          ? "已保存"
          : "尚未保存";
    } catch (error) {
      status.textContent = error.message;
    }
  };
  refresh();
  onChange?.({ ...bindings });
  const ready = (async () => {
    try {
      const response = await request("/api/shortcuts");
      if (!response.ok) throw new Error();
      const value = await response.json();
      const saved = { ...DEFAULT_SHORTCUTS, ...value.bindings };
      if (validateBindings(saved)) throw new Error();
      bindings = saved;
      if (!edited) {
        draft = { ...saved };
        refresh();
      }
      onChange?.({ ...bindings });
    } catch {
      status.textContent = "快捷键设置未能载入，当前使用默认值";
    }
  })();
  return {
    ready,
    get bindings() {
      return { ...bindings };
    },
  };
}
