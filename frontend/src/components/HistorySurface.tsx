export function HistorySurface() {
  return (
    <section id="comparePanel" role="tabpanel" hidden={true}>
      <div className="comparison-head">
        <strong id="leftTitle"></strong>
        <strong id="rightTitle"></strong>
      </div>
      <div id="diffScroll">
        <div id="diffRows"></div>
      </div>
    </section>
  );
}
