export function OtherSurface() {
  return (
    <section
      id="otherPanel"
      className="settings-card"
      role="tabpanel"
      aria-label="其他设置"
      hidden={true}
    >
      <h2>{"其他"}</h2>
      <section className="other-section agent-settings">
        <h3>{"目标智能体"}</h3>
        <select id="targetAgent" aria-label="目标智能体">
          <option value="codex">{"Codex"}</option>
          <option value="claude-code">{"Claude Code"}</option>
          <option value="hermes">{"Hermes"}</option>
          <option value="deepseek-harness">{"DeepSeek Harness"}</option>
          <option value="grok-bot">{"Grok Bot"}</option>
          <option value="muse">{"Muse"}</option>
          <option value="gemini-cli">{"Gemini CLI"}</option>
          <option value="opencode">{"OpenCode"}</option>
        </select>
        <div className="skill-folder">
          <button id="chooseSkillFolder">{"技能目录"}</button>
          <span id="skillFolderPath"></span>
        </div>
      </section>
      <section className="other-section">
        <h3>{"条目内容"}</h3>
        <label
          className="setting-switch"
          title="自动把正文中的 Markdown 标题与列表整合为条目层级；关闭后按原始文字保留"
        >
          <input id="recognizeMarkdown" type="checkbox" defaultChecked={true} />
          {"识别md"}
        </label>
        <label
          className="setting-switch"
          title="输入中英文引号、括号或反引号时自动补齐另一半，光标置于中间"
        >
          <input id="pairDelimiters" type="checkbox" defaultChecked={true} />
          {"成对输入"}
        </label>
        <label
          className="setting-switch"
          title="新建一轮时，把上一轮无正文的标题及子层级移到父层级末尾；原有内容不删除"
        >
          <input id="autoSort" type="checkbox" defaultChecked={true} />
          {"自动排序"}
        </label>
      </section>
      <section className="other-section">
        <h3>{"复制提示词"}</h3>
        <label
          className="setting-switch"
          title="复制提示词成功后，切换到选择的已打开窗口、应用或网页；剪切条目不触发"
        >
          <input id="copyJumpEnabled" type="checkbox" />
          {"应用跳转"}
        </label>
        <div className="copy-jump-target">
          <label htmlFor="copyJumpTarget">{"跳转目标"}</label>
          <select id="copyJumpTarget" aria-label="跳转目标"></select>
          <button id="refreshJumpTargets">{"刷新"}</button>
        </div>
        <label id="copyJumpUrlRow" hidden={true}>
          {"网页地址\n            "}
          <input
            id="copyJumpUrl"
            type="url"
            placeholder="https://"
            aria-label="网页地址"
          />
        </label>
        <p className="muted">
          {
            "\n            窗口列表包含系统可识别的已打开窗口，浏览器页面以窗口当前标签为准。\n          "
          }
        </p>
      </section>
      <button
        id="clearUserData"
        title="重置设置、分组与最近记录；保留磁盘上的 TXT 词集和附件"
      >
        {"\n          清除用户数据\n        "}
      </button>
      <p id="otherStatus" role="status" aria-live="polite"></p>
    </section>
  );
}
