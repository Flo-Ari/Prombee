export function LibrarySurface() {
  return (
    <section id="libraryPanel" role="tabpanel" hidden={true}>
      <aside id="libraryGroups" className="library-card app-bar">
        <h2 className="groups-heading">
          {"\n            分组"}
          <button id="newGroup" aria-label="新建分组" title="新建分组">
            {"\n              ＋\n            "}
          </button>
        </h2>
        <div id="groupsList"></div>
      </aside>
      <div id="libraryDisplay">
        <div id="libraryForm" className="library-card">
          <h2 id="libraryFormTitle">{"新建词集"}</h2>
          <span id="libraryStatus" role="status"></span>
          <div className="library-create-row">
            <label id="libraryNameLabel">
              <input
                id="libraryName"
                className="普通输入样式 input-standard"
                placeholder="词集名称"
                aria-label="词集名称"
                maxLength={100}
              />
            </label>
            <button id="chooseLocation" title="选择新词集保存的位置">
              {"\n                选择保存位置"}
            </button>
            <button id="openFile" title="打开设备上的 TXT 词集">
              {"\n                打开文件"}
            </button>
            <button id="libraryCreate" className="primary" disabled={true}>
              {"\n                创建词集\n              "}
            </button>
          </div>
          <span id="chosenLocation">{"尚未选择保存位置"}</span>
        </div>
        <div className="library-card set-list-card">
          <h2>{"提示词集"}</h2>
          <div id="setsList"></div>
        </div>
      </div>
    </section>
  );
}
