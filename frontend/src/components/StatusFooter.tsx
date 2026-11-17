// Existing markup and identifiers are preserved for desktop integration.
export function StatusFooter() {
  return (
    <footer>
      <span id="status" role="status"></span>
      <span className="keys">{"Enter 下一条 · Shift+Enter 换行"}</span>
      <span className="spacer"></span>
      <span id="stats"></span>
      <nav id="edgeNavigation" aria-label="页面跳转">
        <button
          type="button"
          data-edge="up"
          data-visible="false"
          aria-label="到顶部"
          title="到顶部"
          aria-hidden="true"
          tabIndex={-1}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 5h12M7 13l5-5 5 5M12 8v12"></path>
          </svg>
        </button>
        <button
          type="button"
          data-edge="down"
          data-visible="false"
          aria-label="到底部"
          title="到底部"
          aria-hidden="true"
          tabIndex={-1}
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M6 19h12M7 11l5 5 5-5M12 4v12"></path>
          </svg>
        </button>
      </nav>
    </footer>
  );
}
