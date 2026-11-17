export function UpdatesSurface() {
  return (
    <section
      id="updatesPanel"
      className="settings-card"
      role="tabpanel"
      aria-label="版本更新"
      hidden={true}
    >
      <h2>{"版本更新"}</h2>
      <p>
        {"\n          当前版本 "}
        <strong id="currentVersion">{"—"}</strong>
        <span className="muted">{"预览版"}</span>
      </p>
      <p id="latestVersion"></p>
      <p id="updateStatus" role="status" aria-live="polite"></p>
      <progress
        id="updateProgress"
        max="100"
        defaultValue="0"
        hidden={true}
      ></progress>
      <div className="update-actions">
        <button id="checkUpdate">{"检查更新"}</button>
        <button id="installUpdate" className="primary" hidden={true}>
          {"更新并重启"}
        </button>
      </div>
    </section>
  );
}
