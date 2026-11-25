export function ShortcutsSurface() {
  return (
    <section
      id="shortcutsPanel"
      role="tabpanel"
      hidden={true}
      aria-label="快捷键设置"
    >
      <div className="shortcut-heading">
        <h2>{"快捷键"}</h2>
        <div>
          <button id="resetShortcuts">{"恢复默认"}</button>
          <button id="saveShortcuts" className="primary">
            {"保存快捷键"}
          </button>
        </div>
      </div>
      <p className="shortcut-hint">
        {
          "\n          点击右侧输入框后按下组合键，Backspace 清除，Esc 取消。\n        "
        }
      </p>
      <p id="insertShortcutHint" className="shortcut-hint">
        {
          "\n          添加：Ctrl+Q → 1–6 立即创建；↑↓ 选择，Enter 添加正文，Esc 取消。\n        "
        }
      </p>
      <div id="shortcutStatus" role="status"></div>
      <div className="shortcut-groups"></div>
    </section>
  );
}
