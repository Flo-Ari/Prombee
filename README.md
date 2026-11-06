# Prombee · 提示蜂

按层级编写、筛选和复制提示词的桌面编辑器。蓝白与黑纸白字主题；桌面版和浏览器开发预览共用 `web/` 界面。

## 编辑与分享

- 每行右侧依次为添加标题、复制可见性、删除。标题支持 H1–H6，正文自动编号。
- 关闭眼睛后，该条目不参与复制；标题关闭时下级也不参与复制，下一个同级或更高级标题不受影响。
- 删除标题连同下级删除；删除条目只移除本条。Ctrl+Z 可撤销。
- 「删除空项」清理当前整份提示词的空标题和空条目，不修改其他轮次。
- 新建按现有最大轮次自动命名为「第N轮」，并复制模板的标题名称和等级，各标题下保留空条目。
- 「模板、编写、历史对比、预览」以页签切换，无弹窗。模板页的「历史层级」可选择历史轮次，复制标题层级，不带入正文；替换后可撤销。首次升级从当前轮次初始化模板，不修改既有轮次。
- 文档选择器右侧的「历史对比」可分别选择左右轮次，并排对齐查看 Markdown 差异；「预览」可切换渲染效果或原始 Markdown，与「复制提示词」输出一致。
- 字体、9–96 pt 字号、颜色、粗体、斜体、清除格式。内容按实际字号撑开。
- 与记事本兼容的纯文本分享：复制 Markdown 标题、列表、粗体和斜体标记；字体、字号和颜色只影响编辑外观，不输出 HTML。不处理 Word、富文本文档或二进制格式。

Enter 下一条，Shift+Enter 本条换行；Ctrl+N 新一轮，Ctrl+S 保存，Ctrl+B / Ctrl+I 粗体 / 斜体，Ctrl+Shift+C 复制整篇，Ctrl+Z / Ctrl+Shift+Z 撤销 / 重做。

## Windows

从 Actions 的 **Windows desktop** 工作流下载 **Prombee-Windows-x64** 构件，解压后打开 `Prombee.exe`。需要 Windows 10/11 和 Microsoft Edge WebView2 Runtime。详见 [Windows 说明](docs/windows.md)。

PR / main 更新会在 Windows runner 构建 EXE，验证真实原生窗口、Unicode 剪贴板和关闭前保存。请以实际工作流成功状态为准。

## Ubuntu / .deb

在 Ubuntu 24.04 桌面安装：

```bash
sudo apt install ./prombee_0.4.0_all.deb
```

随后从应用菜单打开「Prombee · 提示蜂」。依赖由 apt 安装；包不内嵌 Fedora 构建的 ELF。构建工作流安装真正的 .deb 并运行桌面启动检查。

当前 Fedora 44 x86_64 开发机也可直接运行 `dist/Prombee` 单文件；它不替代发行版原生 .deb。

## 浏览器迭代

```bash
python3 dev.py
```

访问 http://127.0.0.1:8765/ 。修改 `web/` 后，预览在保存完成时自动刷新。开发前端不需要 Node/npm；修改 Python 服务后需重启。

| 文件 | 用途 |
| --- | --- |
| web/app.js | 编辑、轮次、删除与可见性 |
| web/core.js | 层级范围、纯文本复制、自动编号 |
| web/review.js | Markdown 预览与历史差异 |
| web/vendor/ | marked / DOMPurify、许可证和锁定版本 |
| web/logo.svg | AI 蜜蜂矢量 LOGO |
| desktop.py / desktop_windows.py | Linux / Windows 原生窗口 |
| src/prombee/ | UTF-8 保存、进程锁、冲突保护 |
| scripts/build_deb.py | .deb 打包 |
| scripts/build.sh | Fedora 单文件打包 |
| scripts/build-windows.ps1 | Windows 单文件 EXE 打包 |
| .github/workflows/ | Windows 与 .deb 并行构建、原生启动验证 |

前端验证后重新构建相应桌面版本即可同步界面。

## 数据与验证

开发预览保存在项目 `data/workspace.json`；Windows 使用 `%LOCALAPPDATA%/Prombee`；.deb 使用 `${XDG_DATA_HOME:-$HOME/.local/share}/prombee`。更新程序不覆盖工作区。

仓库只包含通用模板，不包含个人工作区、历史提示词和开发样本。`data/`、`work/`、`dist/` 均不入库。关闭眼睛不会删除正文。多窗口版本冲突时暂停写入，提示先复制文字再刷新。

```bash
python3 -m unittest discover -s tests -v
python3 scripts/build_deb.py
python3 desktop.py --smoke-test --data-dir work/smoke
```

预览使用 [marked](https://marked.js.org/) 和 DOMPurify，渲染资源与许可证均已随源码打包，不依赖在线 CDN。
