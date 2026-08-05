# 安装、发布与本地数据

[English](installing-and-security.md) · [Русский](installing-and-security.ru.md) · [简体中文](installing-and-security.zh-CN.md) · [文档首页](README.zh-CN.md)

## 面向用户的软件包

每个 `v*` tag 都会在 GitHub 托管的对应系统 runner 上启动三平台原生构建：

| 平台 | 产物 | 说明 |
|:--|:--|:--|
| Linux | AppImage、deb | AppImage 无需安装；deb 集成到 Debian 系桌面 |
| Windows | NSIS 安装程序、便携版 executable | 安装程序允许选择目录，并创建开始菜单/桌面快捷方式 |
| macOS | dmg、zip | 两者都包含图形化 `.app` bundle |

只从本仓库的 [GitHub Releases](https://github.com/howdeploy/CanvasTTY/releases) 页面下载。`0.8.x` 是公共预览版，目前没有商业代码签名证书或 Apple notarization。因此 Windows SmartScreen 与 macOS Gatekeeper 可能提示未知开发者。确认警告前，请核对 release tag 与产物名称。

## 分发包包含什么

`electron-builder.yml` 使用明确 allowlist：`out/` 下的 production bundle、`package.json` 和必需的 production dependencies。源码文档、`.env`、本地 agent/planning 目录、日志、设置、凭据与发布工作目录不会复制到应用包中。

`node-pty` 会在对应 GitHub runner 上重新构建，因此 Linux、Windows 与 macOS 包都使用本系统的原生模块。不能把一个操作系统的包改名后当成另一个系统的构建。

## 仅保存在本地的用户数据

| 数据 | 位置与生命周期 |
|:--|:--|
| CanvasTTY 设置 | Electron 的每用户 `userData` 目录（典型 Linux 为 `~/.config/canvastty`，Windows 为 `%APPDATA%\canvastty`，macOS 为 `~/Library/Application Support/canvastty`） |
| 服务商凭据 | 已安装 Codex、Claude 或 Kimi CLI 自己的本地凭据存储；CanvasTTY 不复制它 |
| PTY scrollback | 当前应用会话中有界的 main 进程内存；不保存到仓库 |
| Home 媒体 | 用户原始本地文件；设置只保留本地路径 |
| 日志 | 仅本地 stdout/stderr；CanvasTTY 没有远程日志收集器或项目自营遥测 endpoint |

准确 `userData` 路径可能随系统配置变化。CanvasTTY 向 Electron 请求正确的用户目录，绝不把源码 checkout 用作 runtime storage。

## 凭据边界

只有当有可靠数据源的配额请求需要凭据时，可信 main 进程才会读取它们。凭据只发送到对应服务商 endpoint，不记录日志，不由 CanvasTTY 持久化，也不通过 typed preload bridge。Kimi loopback token 只留在进程内存中，其子进程 stderr 被丢弃。

经过清洗的百分比、窗口 metadata、timestamp 与明确 unavailable 原因可以通过 IPC。原始服务商响应、bearer header、cookie 与 credential file 不可以。

## 仓库防护

```bash
npm run audit:secrets
npm test
```

审计会检查高可信 provider/cloud token 格式、private-key 块、硬编码 secret 赋值、敏感文件名与个人绝对 home 路径。`.gitignore` 排除本地 agent 上下文、planning 数据、env、凭据、日志、设置、dependencies 和生成的软件包。CI 在 build 前运行审计，每个 release job 在打包前再次运行。

没有扫描器是完美的。不要“临时”提交真实 secret。如果 secret 进入 Git 历史，应先撤销，再清理历史后发布。

## 本地构建软件包

```bash
npm install
npm run package
```

`npm run package` 为当前操作系统创建未打包目录。平台 scripts 创建安装包：

```bash
npm run package:linux
npm run package:win
npm run package:mac
```

每个 script 都应在对应操作系统上运行。由于 `node-pty` 是原生模块，cross-compilation 不能作为兼容性证明。

## 发布检查清单

1. 确认 `package.json` 与 tag 使用同一个 semantic version。
2. 运行 secret audit、测试、typecheck、production build 和当前系统 package build。
3. 检查真实打包应用与包内容 allowlist。
4. 推送 `vX.Y.Z`，等待三个 GitHub Actions package job 全部完成。
5. 在真实 Linux、Windows 与 macOS 设备验证前，把自动创建的 release 保持为 prerelease。

安全问题报告方式见[安全策略](../SECURITY.md)。
