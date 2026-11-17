export function PreviewSurface() {
  return (
    <section id="previewPanel" role="tabpanel" hidden={true}>
      <div id="previewPaper">
        <article id="previewContent" className="markdown-preview"></article>
        <pre id="rawMarkdown" hidden={true}></pre>
      </div>
    </section>
  );
}
