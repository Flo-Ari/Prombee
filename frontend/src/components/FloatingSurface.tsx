export function FloatingSurface() {
  return (
    <section
      id="floatingPanel"
      className="settings-card"
      role="tabpanel"
      aria-label="悬浮球设置"
      hidden={true}
    >
      <h2>{"悬浮球"}</h2>
      <label className="setting-switch">
        <input
          id="floatingEnabled"
          type="checkbox"
          role="switch"
          defaultChecked={true}
        />
        {"启用悬浮球"}
      </label>
      <p id="floatingStatus" role="status"></p>
    </section>
  );
}
