<p align="center">
  <img src="docs/assets/canvastty-cover.png" alt="CanvasTTY — 面向本地终端与 AI 智能体的空间桌面" width="100%">
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.ru.md">Русский</a> ·
  <a href="README.zh-CN.md"><strong>简体中文</strong></a>
</p>

<table>
  <tr>
    <td>
      <strong>终端是空间，而不只是标签页。</strong><br>
      CanvasTTY 是一个 Electron 空间桌面，用于真实的本地 PTY 与 AI 智能体 CLI 会话。它把固定的 Home 区域、无限画布上的实时终端，以及不伪造数据的服务商限额放在同一界面中。
    </td>
  </tr>
</table>

## 技术栈

| 桌面端 | 界面 | 终端 | 服务商 |
|:--|:--|:--|:--|
| **Electron**<br>electron-vite | **React**<br>TypeScript | **xterm.js**<br>node-pty | **Codex**<br>Claude · Kimi |

## 一张画布，真实会话

在项目目录中启动 shell 或智能体，移动并调整实时终端窗口，缩小后通过语义摘要导航，再回到 Home 查看会话、限额、媒体与启动入口。CanvasTTY 在可信的主进程中维护 PTY 状态，只向渲染进程暴露经过类型约束和白名单许可的能力。

## 安装

从 [GitHub Releases](https://github.com/howdeploy/CanvasTTY/releases) 下载 `0.8.x` 公共预览版：Linux 提供 AppImage/deb，Windows 提供安装程序/便携版，macOS 提供 dmg/zip。软件包尚未进行代码签名或 notarization；请先阅读[安装与本地数据安全](docs/installing-and-security.zh-CN.md)。

也可以从源码运行：

```bash
npm install
npm run dev
```

## 文档

| 从这里开始 | 扩展 CanvasTTY |
|:--|:--|
| [文档中心](docs/README.zh-CN.md) | [编写小组件](docs/widget-authoring.zh-CN.md) |
| [快速开始](docs/getting-started.zh-CN.md) | [指标与遥测](docs/metrics-and-telemetry.zh-CN.md) |
| [安装、发布与本地数据](docs/installing-and-security.zh-CN.md) | [安全策略](SECURITY.md) |
| [架构](docs/ARCHITECTURE.md) | [UI 契约](docs/UI_CONTRACT.md) |

> CanvasTTY 目前仍是 Electron MVP。自定义小组件属于源码级扩展，尚无运行时插件注册机制。

## 快速检查

```bash
npm test
npm run typecheck
npm run build
```
