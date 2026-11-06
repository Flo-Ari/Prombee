# Prombee · 提示蜂

轻量级桌面提示词编辑器，让项目每一轮迭代的要求都有条理、可复用、可对比。

## 使用场景

用于与 AI 智能体协作进行项目迭代：提交本轮任务后，在等待智能体处理时继续整理下一轮提示词，而不是拿起手机消磨时间。随手记录发现的问题、补充约束，再复制给智能体，保持工作思路连贯。

## 具体功能

- **按轮次编写**：自动命名为“第 N 轮”，新建时沿用模板的 Markdown 标题层级。
- **层级编辑**：H1–H6 标题、自动有序列表、字体、字号、颜色、粗体和斜体；支持撤销、重做及整篇删除空项。
- **直接写 Markdown**：内容中已有的 Markdown 优先保留；标题等级仅影响当前层级及其子层级，到同级或上级时恢复。重复或冲突的内容均保留，不自动合并、覆盖或删除。
- **模板**：像编辑提示词一样编辑模板，也可从历史轮次复制标题层级。
- **历史对比与预览**：选择两轮左右对比；预览即将复制的内容，并可切换原始 Markdown。
- **常用提示词**：集中保存可复用内容，逐项复制当前条目及其子层级，或用“全部复制”复制整页，均包含 Markdown 层级。
- **选择复制范围**：用眼睛按钮控制条目是否参与复制，关闭标题时连同下级一起排除。
- **本地保存**：自动保存轮次、模板和常用提示词；提供蓝白与黑纸白字主题。

以纯文字复制和分享，与记事本兼容。字体、字号和颜色只影响编辑显示，复制时保留 Markdown 标题、列表及强调标记。

## 安装方法

在 [下载页面](https://github.com/Flo-Ari/Prombee/actions) 选择最新成功的 **Windows desktop** 或 **Debian package**，下载对应文件并解压。下载 GitHub Actions 附件需要登录 GitHub。

### Windows 10 / 11

下载 **Prombee-Windows-x64**，解压后双击 `Prombee.exe`，无需安装 Python 或 Node.js。如果提示缺少运行组件，请安装 [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/)。

### Ubuntu 24.04

下载 **Prombee-Debian**，解压后安装 `.deb`：

```bash
sudo apt install ./prombee_0.5.0_all.deb
```

安装后，从应用菜单打开“Prombee · 提示蜂”。

### Fedora 44 x86_64

使用对应的单文件程序 `Prombee`，赋予运行权限后双击打开。Linux 不同发行版请选用对应版本。

### 提示词保存位置

轮次、模板和常用提示词统一保存在本机 `workspace.json`，备份此文件即可保留内容。

| 使用方式 | 默认保存位置 |
| --- | --- |
| Windows | `%LOCALAPPDATA%\Prombee\workspace.json` |
| Ubuntu 安装版 | `~/.local/share/prombee/workspace.json` |
| Linux 单文件版 | 程序旁的 `Prombee-data/workspace.json` |

更新程序前建议备份工作区。关闭眼睛只排除复制，不删除原文。

## 许可证

[Apache License 2.0](LICENSE)。随附第三方组件保留各自许可证。
