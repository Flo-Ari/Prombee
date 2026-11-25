# Prombee 架构

前端使用 React、Vite、TypeScript；后端使用 FastAPI、Uvicorn。Linux 桌面使用 GTK / WebKitGTK，Windows 使用 WebView2。正式版通过本地 FastAPI 服务提供预编译界面与 API，用户无需安装 Node.js。

## 目录

| 目录 | 职责 |
| --- | --- |
| `frontend/src/components/` | React 窗口、工具栏、显示区与条目结构 |
| `frontend/src/editor/` | 编辑控制器、Markdown、选区、快捷键、附件和动画 |
| `frontend/src/types/` | 词集、条目、附件与桌面桥接类型 |
| `frontend/public/` | CSS、图像、SVG 与第三方许可 |
| `frontend/tests/` | 前端交互与结构兼容测试 |
| `frontend/tools/` | 前端测试与联合开发预览入口 |
| `frontend/dist/` | Vite 编译界面，不提交 Git |
| `backend/prombee/api/` | FastAPI 路由、请求校验、安全响应和附件流 |
| `backend/prombee/services/` | 词集、轮次、附件、偏好、语音、技能与更新用例 |
| `backend/prombee/adapters/linux/` | GTK 窗口、悬浮球、剪贴板和原生文件夹选择 |
| `backend/prombee/adapters/windows/` | WebView2 宿主、悬浮球、剪贴板、运行库和原生文件夹选择 |
| `backend/prombee/adapters/` 其余文件 | 共用存储、锁、数据位置策略、HTTP 宿主和开发文件选择接口 |
| `backend/prombee/resources/` | 随程序分发的默认词集数据 |
| `backend/prombee/__main__.py` | 选择当前系统的桌面适配器并启动 |
| `backend/prombee/preview.py` | 浏览器开发预览的 API 入口 |
| `backend/prombee/paths.py` | 源码与冻结应用共用的资源定位 |
| `backend/requirements/` | 运行、开发及不同平台打包依赖 |
| `build_tools/linux/` | Linux 单文件、RPM、DEB 构建工具、规格与钩子 |
| `build_tools/windows/` | Windows 构建工具和规格 |
| `build_tools/packaging/` | 系统安装包配置、启动器、图标与许可 |
| `build_tools/` 其余文件 | 共用发布与包版本验证工具 |
| `tests/` | 后端、原生窗口与跨层集成测试 |
| `.cache/prombee/` | 本机构建环境、可复用缓存、验证记录和开发进程文件，不提交 Git |
| `dist/` | 构建完成的桌面程序和安装包，不提交 Git |

根目录只保留说明、许可及项目级目录。`Prombee.txt` 与 `data/` 是原有用户数据，保留原位并排除 Git；不会因整理或更新删除。

## 分层边界

HTTP 路由通过 `ApplicationServices` 调用业务用例；原生选择通过 `PathPicker` 注入，悬浮球变化通过回调通知宿主。系统差异由 Linux / Windows 适配器承接，共用存储与文件锁集中复用。安装配置仅参与构建，不混入业务层。

React 创建页面与条目结构。正文使用不受控 `contenteditable`，控制器管理输入法、Range、撤销、粘贴和光标；React 不在每次输入时覆盖正文。结构调整后恢复光标、选区和滚动位置。Markdown 与 HTML 仍经净化处理。

## 本地开发与验证

需要 Node.js 22.12+、Python 3.10+；Linux 桌面另需 GTK / WebKitGTK。

```sh
python3 -m venv --system-site-packages .venv
.venv/bin/python -m pip install -r backend/requirements/development.txt
npm --prefix frontend ci
npm --prefix frontend run build
npm --prefix frontend run dev
```

Windows 的 Python 路径为 `.venv\Scripts\python.exe`，也可通过 `PROMBEE_PYTHON` 指定。联合预览在 127.0.0.1:5173 提供 Vite、在 127.0.0.1:8765 提供 API；退出时一起关闭。修改前端后在保存完成时自动刷新，修改 Python 后重启预览。

`python backend/prombee/preview.py --data-dir <目录>` 可隔离开发数据；默认使用项目内原有 `data/`。开发 API 文档位于 `/api/docs`，正式版不开放文档界面。

```sh
npm --prefix frontend test
npm --prefix frontend run build
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
```

有桌面显示的 Linux 环境可执行 `.venv/bin/python tests/native_webkit.py`。测试数据和截图仅写入 `.cache/prombee/native-ui`，不操作实际提示词。自动化测试不代表已经覆盖每个系统环境。

## 构建与运行

- Linux：`build_tools/linux/build.sh`。
- RPM：先编译前端，再运行 `python build_tools/linux/build_rpm.py`。
- DEB：先编译前端，再运行 `python build_tools/linux/build_deb.py`。
- Windows：`build_tools/windows/build.ps1`；完整离线 WebView2 准备与安装测试见 Windows 工作流。

PyInstaller 显式收集对应平台宿主，资源通过 `paths.py` 定位。源码包安装只分发后端与 `frontend/dist`，不会带入 Node.js、前端开发依赖或测试。

`.cache/prombee` 是可再生成的开发状态；运行中的预览可能使用其 Python 环境，应先停止预览再删除。它与用户选择的数据目录、附件及产品更新缓存没有关联。

## 启动检查与更新缓存

正式桌面 API 生命周期启动时只触发一次后台检查；开发预览不自动联网下载。网络失败后恢复联网可重试，成功检查后同一进程不因切换页面重复检查。手动检查仍可随时执行。

新包只写入用户实际数据目录的 `updates/`。下载及 SHA-256 校验完成后原子记录版本、文件名与摘要，重启后在后台验证并复用；检测到更高版本时清理旧安装包，仅保留当前候选。离线时可继续使用已验证缓存；损坏或不完整文件不能安装。

下载与安装权限分离：后台仅检查、下载、校验和缓存，不调用包管理器、提权或重启。用户点击“更新并重启”后先保存提示词，再进入安装授权。设置与更新标签的红点一直保留到安装成功；新进程检测当前版本已覆盖缓存版本后清理缓存。关闭应用取消后台下载并清理未完成文件。
