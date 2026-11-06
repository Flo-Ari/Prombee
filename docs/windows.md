# Windows 桌面版

下载 GitHub Actions 中 `Prombee-Windows-x64` 构件，解压后双击 `Prombee.exe`。
程序为单文件便携版，不需要安装 Python，不需要在终端运行脚本。

- 支持 Windows 10 / 11 x64。
- 使用 Microsoft Edge WebView2 Runtime。多数 Windows 电脑已预装；缺失时可从 [Microsoft 官方页面](https://developer.microsoft.com/microsoft-edge/webview2/) 安装。
- 工作区自动保存在 `%LOCALAPPDATA%\Prombee\workspace.json`，升级程序不会覆盖已有文字。
- 界面与浏览器迭代版共用 `web/`，没有独立的 Windows 编辑器逻辑。

## 开发者构建

安装 Python 3.12 x64 后，在项目目录运行一次：

```powershell
powershell -ExecutionPolicy Bypass -File scripts/build-windows.ps1
```

结果为 `dist/windows/Prombee.exe`。

`.github/workflows/windows.yml` 在 Windows runner 上原生构建，之后直接启动打包后的程序，检查界面载入、中文和 emoji 剪贴板往返、关闭窗口前保存，并上传 exe 与测试报告。构建或测试未通过时，不发布可下载 exe 构件。

实现遵循 [pywebview Windows 引擎说明](https://pywebview.flowrl.com/guide/web_engine.html) 和 [PyInstaller 打包说明](https://pywebview.flowrl.com/guide/freezing.html)。Windows Python 桥需要动态函数，因此只在 Windows 桌面本地服务的 CSP 中启用 `unsafe-eval`；普通浏览器预览和 Linux 桌面保持原有策略。
