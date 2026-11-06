# 开发与打包

桌面版和浏览器预览共用 `web/` 界面。`main` 和版本功能分支均包含所有操作系统的源码，不按操作系统拆分分支；Windows 与 Debian 由不同工作流构建。

## 浏览器预览

运行 `python3 dev.py`，访问 http://127.0.0.1:8765/ 。修改 `web/` 后自动刷新，修改 Python 服务后重新启动。浏览器版首次将 `data/workspace.json` 迁移为 `data/当前词集.txt`，原文件保留。`data/library.json` 只保存项目路径、最近词集与回收站索引；每个 TXT 自含词集内容，均不提交到仓库。

## 检查

- `npm ci --ignore-scripts && npm test`
- `python3 -m unittest discover -s tests -v`
- `python3 desktop.py --smoke-test --data-dir work/smoke`

## 打包

- Fedora 单文件：`scripts/build.sh`
- Ubuntu 安装包：`python3 scripts/build_deb.py`
- Windows：`scripts/build-windows.ps1`

GitHub Actions 在 Windows 和 Ubuntu 上分别打包并启动真实桌面程序验证。用户数据不随程序打包。应用源码采用 Apache-2.0，第三方组件保留原许可证。
