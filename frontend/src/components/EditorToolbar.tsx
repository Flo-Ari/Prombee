// Existing markup and identifiers are preserved for desktop integration.
export function EditorToolbar() {
  return (
    <div
      id="editorToolbar"
      className="toolbar app-bar"
      role="toolbar"
      aria-label="文字格式"
    >
      <button
        id="voiceInput"
        aria-pressed="false"
        aria-label="语音输入"
        title="语音输入"
      >
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <rect x="9" y="2" width="6" height="12" rx="3"></rect>
          <path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"></path>
        </svg>
      </button>
      <button id="multiSelect">{"多选"}</button>
      <button id="deleteEmpty" aria-pressed="true" title="复制时排除空项">
        {"\n        排除空项\n      "}
      </button>
      <button id="undo" title="撤销 Ctrl+Z" aria-label="撤销">
        {"↶"}
      </button>
      <button id="redo" title="重做 Ctrl+Shift+Z" aria-label="重做">
        {"↷"}
      </button>
      <span className="separator"></span>
      <select id="font" aria-label="字体">
        <option value="Noto Sans CJK SC">{"思源黑体"}</option>
        <option value="Noto Serif CJK SC">{"思源宋体"}</option>
        <option value="Noto Sans Mono CJK SC">{"思源等宽"}</option>
        <option value="sans-serif">{"无衬线"}</option>
        <option value="serif">{"衬线"}</option>
        <option value="monospace">{"等宽"}</option>
      </select>
      <input
        id="size"
        type="number"
        min="9"
        max="96"
        defaultValue="14"
        aria-label="字号"
      />
      <button id="bold" title="粗体 Ctrl+B">
        <b>{"B"}</b>
      </button>
      <button id="italic" title="斜体 Ctrl+I">
        <i>{"I"}</i>
      </button>
      <label className="color-control" title="文字颜色">
        <span>{"A"}</span>
        <input
          id="color"
          type="color"
          defaultValue="#2563eb"
          aria-label="文字颜色"
        />
      </label>
      <button id="clear">{"清除格式"}</button>
      <span className="separator"></span>
      <select id="headingLevel" aria-label="条目等级">
        <option value="0">{"正文"}</option>
        <option value="1">{"一级标题"}</option>
        <option value="2">{"二级标题"}</option>
        <option value="3">{"三级标题"}</option>
        <option value="4">{"四级标题"}</option>
        <option value="5">{"五级标题"}</option>
        <option value="6">{"六级标题"}</option>
      </select>
      <select id="listType" aria-label="序号类型" defaultValue="all-unordered">
        <optgroup label="局部">
          <option value="unordered">{"局部无序"}</option>
          <option value="ordered">{"局部有序"}</option>
          <option value="none">{"局部取消"}</option>
        </optgroup>
        <optgroup label="全部">
          <option value="all-ordered">{"全部有序"}</option>
          <option value="all-unordered">{"全部无序"}</option>
          <option value="all-none">{"全部取消"}</option>
        </optgroup>
      </select>
      <div id="batchControls" hidden={true}>
        <span id="selectedCount"></span>
        <button id="batchExclude">{"排除"}</button>
        <button id="batchDelete">{"删除"}</button>
      </div>
      <textarea
        id="speechResult"
        aria-label="听写结果"
        hidden={true}
        readOnly={true}
      ></textarea>
      <button id="copyAll" hidden={true}>
        {"全部复制"}
      </button>
      <div className="spacer"></div>
      <div id="hierarchyControls" hidden={true}>
        <label>
          {"历史层级\n          "}
          <select id="hierarchyRound" aria-label="历史层级轮次"></select>
        </label>
        <button id="copyHierarchy">{"更新层级"}</button>
      </div>
    </div>
  );
}
