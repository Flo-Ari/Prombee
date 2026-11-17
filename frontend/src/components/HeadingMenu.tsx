// Existing markup and identifiers are preserved for desktop integration.
export function HeadingMenu() {
  return (
    <div
      id="headingMenu"
      className="menu"
      role="menu"
      aria-label="添加条目"
      hidden={true}
    >
      <button id="menuAddItem" role="menuitem">
        {"＋ "}
        <span>{"添加正文"}</span>
      </button>
      <button data-level="1" role="menuitem">
        {"\n        H1 "}
        <span>{"一级标题"}</span>
        <small>{"#"}</small>
      </button>
      <button data-level="2" role="menuitem">
        {"\n        H2 "}
        <span>{"二级标题"}</span>
        <small>{"##"}</small>
      </button>
      <button data-level="3" role="menuitem">
        {"\n        H3 "}
        <span>{"三级标题"}</span>
        <small>{"###"}</small>
      </button>
      <button data-level="4" role="menuitem">
        {"\n        H4 "}
        <span>{"四级标题"}</span>
        <small>{"####"}</small>
      </button>
      <button data-level="5" role="menuitem">
        {"\n        H5 "}
        <span>{"五级标题"}</span>
        <small>{"#####"}</small>
      </button>
      <button data-level="6" role="menuitem">
        {"\n        H6 "}
        <span>{"六级标题"}</span>
        <small>{"######"}</small>
      </button>
    </div>
  );
}
