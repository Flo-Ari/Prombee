# 开发与构建

目录职责见 [架构说明](ARCHITECTURE.md)。前端源码、依赖、配置、测试和生成界面均在 `frontend/`，Python 后端在 `backend/prombee/`，构建发布入口在 `build_tools/`。

## 浏览器迭代

在项目根目录执行：

```sh
python3 -m venv --system-site-packages .venv
.venv/bin/python -m pip install -r requirements-dev.txt
npm --prefix frontend ci
npm --prefix frontend run build
npm --prefix frontend run dev
```

打开 http://127.0.0.1:5173/ 。Vite 实时处理前端修改，API 在 127.0.0.1:8765；修改后端后重启预览。默认开发数据为软件文件夹内的 `data/`，可使用 `dev.py --data-dir` 指定隔离位置。现有用户数据不得加入 Git。

## 检查

```sh
npm --prefix frontend test
npm --prefix frontend run build
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
```

## 打包

- Linux 单文件：`build_tools/build.sh`
- Red Hat 系 RPM：先构建前端，再执行 `python3 build_tools/build_rpm.py`
- Debian：先构建前端，再执行 `python3 build_tools/build_deb.py`
- Windows：`build_tools/build-windows.ps1`，还需准备经签名验证的离线 WebView2 组件，完整流程见 Windows 工作流。

构建前端会生成 `frontend/dist/`；它与 `frontend/node_modules/` 均不提交 Git。正式桌面程序使用本地 FastAPI 服务提供已编译界面，无需启动 Vite 或安装 Node.js。
