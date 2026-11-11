# 预览版更新

点击主题按钮左侧的齿轮，选择“更新”。页面显示当前版本；“检查更新”从项目公开 Releases 获取版本信息。1.0 以前使用预览渠道，正式版只接收正式发布。

检查到新版本后，点击“更新并重启”。更新前保存词集，下载并校验 SHA-256；网络错误、校验失败、保存失败或授权取消时保留当前程序。Fedora 和 Debian 使用系统图形授权执行包管理器，Windows 与 Linux 单文件版在原进程退出后替换程序并重启。词集路径和保存位置保持不变。单文件必须放在当前用户可写目录。

0.9.3 及更早版本没有更新页，需要先安装一次带此功能的版本；之后可以在软件内更新。浏览器与开发源码预览提供版本检查，程序替换仅在桌面安装版、单文件版中启用。

## 发布约定

四个已通过测试的包与校验清单必须属于同一提交。将 Linux 单文件、Windows、RPM、DEB 放入 dist 后，执行 `scripts/publish_release.py --commit COMMIT --notes-file NOTES`。脚本先创建草稿、上传全部包和清单，再发布为预览版。不要在发布后单独覆盖安装包；更改任何包时应发布新版本，避免校验清单失配。常规构建工作流只上传 Actions 产物，不会覆盖 Releases。

资料：[GitHub Releases API](https://docs.github.com/en/rest/releases/releases)、[polkit 图形授权](https://polkit.pages.freedesktop.org/polkit/pkexec.1.html)。
