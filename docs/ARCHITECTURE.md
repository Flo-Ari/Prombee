# Prombee 架构

前端使用 React、Vite、TypeScript；后端使用 FastAPI、Uvicorn。桌面仍使用 Fedora / Debian 的 GTK / WebKitGTK 和 Windows 的 WebView2。安装后的软件只运行 Python 与预先编译的界面，不需要 Node.js 或开发服务器。

## 目录与职责

| 目录 | 职责 |
| --- | --- |
| `frontend/src/components/` | React 窗口、工具栏、各显示区和条目组件 |
| `frontend/src/editor/` | TypeScript 编辑控制器、Markdown 规则、选区、快捷键、附件与动画逻辑 |
| `frontend/src/types/` | 词集、条目、附件、桌面桥接类型 |
| `frontend/public/` | 原有 CSS、图像、SVG 与浏览器静态资源，保留命名样式 |
| `backend/prombee/api/` | FastAPI 路由、HTTP 校验、安全响应、附件流与静态界面 |
| `backend/prombee/services/` | 词集、轮次、附件命名、偏好、语音、技能、更新和应用用例 |
| `backend/prombee/adapters/` | 原子写入、跨进程锁、原生选择器、GTK / Windows 窗口与剪贴板、内嵌 HTTP 宿主 |
| `backend/prombee/server.py` | 桌面与开发预览共用的稳定启动入口 |
| `frontend/dist/` | 未提交至 Git 的 Vite 编译产物，桌面及安装包实际使用的界面，不在这里修改功能 |
| `frontend/tests/` | 编辑行为回归、React 结构兼容检查 |
| `tests/` | 后端 API、安全、存储及桌面集成检查 |
| `build_tools/` | 各平台构建、打包、发布工具与规格文件 |
| `frontend/tools/` | 前端测试和开发预览启动入口 |

HTTP 路由通过 `ApplicationServices` 调用业务用例。原生文件选择通过 `PathPicker` 协议注入，悬浮球状态变化通过回调通知桌面，业务用例不依赖 HTTP Request 或 GUI 对象。文件锁和原子写入集中在适配层。已有的数据编解码和业务规则保留，以免格式和细节在重构中漂移。

## 编辑与 React 的边界

React 创建窗口结构、各页面与条目。`EditorEntries` 通过 portal 保持条目直接位于 `#paper` 下，同时保留显示区拖动边框。正文采用不受控 `contenteditable`：控制器管理正文 DOM、输入法、Range、撤销、粘贴与光标，React 不在每次输入时覆盖这些节点。显式的结构变更同步提交后，再恢复原有光标和滚动状态。

页面结构只挂载一次，原生桌面通信所依赖的 ID、类名、事件及 DOM 层级保留。现有内容渲染仍经原有 HTML 清理和 Markdown 净化。悬浮球的 React 组件创建画布和菜单，原有 Canvas 动画及图像分片算法保持不变。

开发环境使用 Vite 编译与代理；界面在后台保存完成后自动重载，避免热替换正文节点打断输入法和选区。没有在正文上启用 React Fast Refresh。

## 本地开发

需要 Node.js 22.12 或以上及 Python 3.10 或以上；Linux 桌面另需原有 GTK / WebKitGTK 系统库。

```sh
python3 -m venv --system-site-packages .venv
.venv/bin/python -m pip install -r requirements-dev.txt
npm --prefix frontend ci
npm --prefix frontend run build
npm --prefix frontend run dev
```

Windows 对应 Python 路径为 `.venv\Scripts\python.exe`。可用 `PROMBEE_PYTHON` 指定 Python。`npm --prefix frontend run dev` 同时启动 API（127.0.0.1:8765）和 Vite（127.0.0.1:5173）；浏览器打开后者。Ctrl+C 同时退出二者。已有 API 启动时可用 `npm --prefix frontend run dev:ui` 单独启动 Vite。

`dev.py --data-dir <目录>` 可用独立目录运行预览；默认 `data/`。桌面数据使用用户选择的位置或软件文件夹内的 `Prombee-data`，TXT 格式保持兼容。开发 API 文档在 `http://127.0.0.1:8765/api/docs`，正式安装包不开放文档界面。

```sh
npm --prefix frontend run typecheck
npm --prefix frontend test
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
npm --prefix frontend run build
```

测试使用临时数据目录，不读写用户实际词集。Linux 单文件构建使用 `build_tools/build.sh`；Windows、Fedora、Debian 工作流先构建 React 界面，再按各平台原有方式打包并做原生窗口检查。

## 兼容范围与验证

- 保留 TXT 词集版本、分组注册表、修订与指纹冲突保护、用户偏好、存储路径和临时附件生命周期。
- 保留 `/api/*` 现有路径、响应字段、POST / PUT、同源限制、附件 Range 读取、桌面文件选择和回调行为。
- 保留原有 UI 样式与图像；React 结构测试以 固定的兼容性快照核对所有控件 ID、类型、标题、下拉选项及原生集成选择器。
- 原有编辑行为测试迁移后继续执行；折叠测试在结构重绘后重新获取当前按钮，避免操作已脱离 DOM 的旧引用。
- 使用真实 WebKit 桌面检查光标、撤销、选区行数、附件、临时文件另存为、显示区宽度、模板、常用、历史、预览与主题；Windows 工作流检查 WebView2、剪贴板、前台恢复与悬浮球收放。

自动化检查不能证明所有环境下的绝对无差异。若发现回归，应增加覆盖该交互的检查后修复，避免通过改变现有预期掩盖差异。

## 构建产物与发布

`frontend/dist/`、`dist/`、`work/` 均为本地产物，不提交到 Git。`frontend/public` 保存可分发资源，`frontend/src/editor/vendor` 保存实际使用的解析器；不重复分发已打包的解析器源码。兼容快照和原生行为测试是长期回归基准。

Windows 工作流构建便携 EXE 和 Inno Setup 安装程序，测试真实鼠标拖动、启动时悬浮球隐藏、安装与卸载、软件文件夹数据保存。卸载保留用户数据。`stage-release.yml` 是参数化的长期发布流程，只接受同一提交且成功完成的三平台构建；所有包与校验文件齐全后才发布草稿。

在有桌面显示的 GTK 开发环境中运行 `.venv/bin/python tests/native_webkit.py` 可执行长期的原生 UI 回归。其数据与截图只写入 `work/native-ui`；使用状态条件等待异步结果，不依赖固定的复制完成时间。

## 运行方式

开发模式由 Vite 实时编译前端、FastAPI 提供 API；正式桌面版使用 FastAPI 本地服务同时提供 `frontend/dist` 的静态界面和 API。静态界面是 HTML、CSS、JavaScript、图像等文件集合，并非单个网页文件。React 在桌面内嵌浏览器中运行，API 与业务仍然实时处理。构建只提前处理前端源码，避免在用户电脑上安装 Node.js、开发依赖和现场编译；该方式与常见前后端产品的生产部署一致。
