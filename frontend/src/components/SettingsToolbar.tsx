// Existing markup and identifiers are preserved for desktop integration.
export function SettingsToolbar() {
  return (
    <div
      id="settingsToolbar"
      className="toolbar app-bar"
      role="tablist"
      aria-label="设置分类"
      hidden={true}
    >
      <button id="shortcutsTab" role="tab" aria-controls="shortcutsPanel">
        {"\n        快捷键\n      "}
      </button>
      <button id="floatingButton" role="tab" aria-controls="floatingPanel">
        {"\n        悬浮球\n      "}
      </button>
      <button id="updatesTab" role="tab" aria-controls="updatesPanel">
        {"\n        更新\n      "}
        <span className="update-dot" aria-hidden="true"></span>
      </button>
      <button id="otherTab" role="tab" aria-controls="otherPanel">
        {"其他"}
      </button>
    </div>
  );
}
