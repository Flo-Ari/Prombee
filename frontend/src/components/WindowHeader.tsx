// Existing markup and identifiers are preserved for desktop integration.
export function WindowHeader() {
  return (
    <header className="window-chrome app-bar">
      <div className="window-header">
        <button
          id="editorTab"
          className="brand"
          role="tab"
          aria-controls="editorPanel"
          aria-label="编写"
          title="编写"
        >
          <img className="brand-lockup" src="brand-lockup.svg" alt="" />
          <span className="logo-glitch" aria-hidden="true"></span>
          <span className="visually-hidden" data-app-name="">
            {"提示蜂"}
          </span>
        </button>
        <button id="copy" aria-label="复制提示词" title="复制提示词">
          <span className="copy-circle" aria-hidden="true"></span>
          <svg
            className="copy-icon copy-arr-1"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M8 8h12v13H8zM4 16H2V2h13v3"></path>
          </svg>
          <svg
            className="copy-icon copy-arr-2"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path d="M8 8h12v13H8zM4 16H2V2h13v3"></path>
          </svg>
          <svg className="copy-check" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m5 12 4 4L20 5"></path>
          </svg>
        </button>
        <button id="template" role="tab" aria-controls="editorPanel">
          {"\n          模板\n        "}
        </button>
        <button id="newDoc" aria-label="新建" title="新建">
          {"＋"}
        </button>
        <select id="documents" aria-label="切换文档"></select>
        <button id="deleteRound" aria-label="删除" title="删除">
          {"−"}
        </button>
        <span className="separator header-separator" aria-hidden="true"></span>
        <button id="libraryTab" role="tab" aria-controls="libraryPanel">
          {"\n          文件\n        "}
        </button>
        <select id="recentSets" aria-label="最近使用的提示词集"></select>
        <span className="separator header-separator" aria-hidden="true"></span>
        <button id="compare" role="tab" aria-controls="comparePanel">
          {"\n          历史\n        "}
        </button>
        <button id="preview" role="tab" aria-controls="previewPanel">
          {"\n          预览\n        "}
        </button>
        <button id="commonTab" role="tab" aria-controls="editorPanel">
          {"\n          常用\n        "}
        </button>
        <div className="spacer drag-space" aria-hidden="true"></div>
      </div>
      <div className="window-controls">
        <button
          id="settingsTab"
          aria-label="设置"
          title="设置"
          role="tab"
          aria-controls="settingsToolbar"
        >
          <svg
            viewBox="0 0 24 24"
            width="18"
            height="18"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            aria-hidden="true"
          >
            <path d="m9 3-1 3-3 1-2 5 2 5 3 1 1 3h6l1-3 3-1 2-5-2-5-3-1-1-3Z"></path>
            <circle cx="12" cy="12" r="3.5"></circle>
          </svg>
          <span className="update-dot" aria-hidden="true"></span>
        </button>
        <button
          id="theme"
          className="theme-switch"
          role="switch"
          aria-checked="true"
          aria-label="主题"
          title="主题"
        >
          <span className="theme-toggle">
            <span className="theme-led"></span>
          </span>
        </button>
        <button
          id="minimizeWindow"
          data-shortcut-action="collapse"
          data-shortcut-name="最小化"
          title="最小化"
          aria-label="最小化"
        >
          {"\n          −\n        "}
        </button>
        <button
          id="maximizeWindow"
          title="最大化 / 还原"
          aria-label="最大化或还原"
        >
          {"\n          □\n        "}
        </button>
        <button id="closeWindow" title="关闭" aria-label="关闭">
          {"×"}
        </button>
      </div>
    </header>
  );
}
