// Existing markup and identifiers are preserved for desktop integration.
export function PreviewToolbar() {
  return (
    <div
      id="previewToolbar"
      className="toolbar app-bar"
      role="toolbar"
      aria-label="预览设置"
      hidden={true}
    >
      <input id="previewMode" type="hidden" defaultValue="rendered" />
      <button id="previewRendered" aria-pressed="true">
        {"Markdown 预览"}
      </button>
      <button id="previewRaw" aria-pressed="false">
        {"原始 Markdown"}
      </button>
    </div>
  );
}
