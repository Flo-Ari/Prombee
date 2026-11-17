// Existing markup and identifiers are preserved for desktop integration.
export function HistoryToolbar() {
  return (
    <div
      id="compareToolbar"
      className="toolbar app-bar"
      role="toolbar"
      aria-label="历史设置"
      hidden={true}
    >
      <label>
        {"左侧轮次\n        "}
        <select id="compareLeft"></select>
      </label>
      <label>
        {"右侧轮次\n        "}
        <select id="compareRight"></select>
      </label>
      <span className="toolbar-note">{"红色为删除 · 绿色为新增"}</span>
    </div>
  );
}
