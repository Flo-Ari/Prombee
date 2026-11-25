# 卸载提示蜂

卸载前先保存内容并退出提示蜂。以下方式只移除程序，保留 TXT 词集、附件、用户设置及用户选择的数据文件夹。

## Windows 安装版

打开 Windows“设置 → 应用 → 已安装的应用”，找到 Prombee 并卸载；也可运行安装文件夹中的 `unins000.exe`。新版安装包会增加开始菜单中的“Uninstall Prombee”入口。

## Windows 便携版

将 `Prombee-版本号-Windows-Uninstall.cmd` 放到 Prombee EXE 所在文件夹，双击运行并确认。卸载工具识别新旧便携版文件名；若同目录存在安装版的卸载程序，则打开系统卸载流程。

该工具不会删除目录、安装包或用户数据。程序仍在运行而无法删除时，退出程序后重试。卸载结束后可以手动删除卸载工具本身。

## Red Hat 系 RPM 安装版

新版安装后，可在应用菜单打开“卸载提示蜂”，或运行 `prombee-uninstall`。也可使用系统包管理器：

```bash
sudo dnf remove prombee
```

## Debian / Ubuntu 安装版

新版安装后，可在应用菜单打开“卸载提示蜂”，或运行 `prombee-uninstall`。也可运行：

```bash
sudo apt remove prombee
```

## Linux 便携版及旧版安装包

将 `Prombee-版本号-Linux-Uninstall.sh` 放到便携程序所在文件夹，在该文件夹的终端中运行：

```bash
sh ./Prombee-版本号-Linux-Uninstall.sh
```

工具优先查找旁边的新旧便携程序，列出将移除的程序，输入 `y` 后才删除。如果旁边没有便携程序，则检测系统已安装的 RPM 或 DEB 包，确认后调用相应的包管理器。此时系统可能要求管理员授权。

同时安装了便携版和系统包时，可指定 `--portable`、`--rpm` 或 `--deb`，例如：

```bash
sh ./Prombee-版本号-Linux-Uninstall.sh --rpm
```

在 GitHub 下载页面选择 `Linux-Uninstall.sh` 或 `Windows-Uninstall.cmd`。同一工具可卸载使用上述文件名或包名的旧版本，无需先升级。
