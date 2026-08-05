# 快速开始

[English](getting-started.md) · [Русский](getting-started.ru.md) · [简体中文](getting-started.zh-CN.md) · [文档首页](README.zh-CN.md)

## 环境要求

- Node.js 与 npm。
- 当前平台支持的 `node-pty` 原生编译工具链。
- 能够运行 Electron 的图形桌面会话。
- 按需安装 `codex`、`claude` 或 `kimi` CLI，并确保它们在 `PATH` 中。

CanvasTTY 不负责安装或登录智能体 CLI。要使用会话与订阅限额，请先完成对应服务商自身的登录流程。

## 安装与运行

```bash
npm install
npm run dev
```

`npm install` 还会准备 Electron，并重新构建原生 `node-pty` 模块。开发命令启动的是真实 Electron 应用，而不是仅用于浏览器的模拟界面。

## 第一个会话

1. 在 Home 点击 **Terminal**，立即在上次使用的项目目录中启动 shell。
2. 点击 **Codex**、**Claude** 或 **Kimi**，为固定的服务商选择项目目录与启动模式。
3. 在画布上移动实时终端，或从任意边缘和角落调整大小。
4. 缩小后使用语义摘要进行导航；放大后回到 xterm 交互。
5. 返回 Home，查看真实会话以及适配器确实能够读取的服务商配额窗口。

在服务商支持时，**YOLO** 模式会关闭其安全确认。CanvasTTY 会显示明确的危险提示；只应在允许智能体修改的目录中使用该模式。

## 常用命令

| 命令 | 用途 |
|:--|:--|
| `npm run dev` | 启动 Electron 开发构建 |
| `npm test` | 运行 Node 测试套件 |
| `npm run typecheck` | 检查 main/preload 与 renderer 的类型 |
| `npm run build` | 类型检查并创建 production bundle |
| `npm run preview` | 启动已构建应用，验证 production 路径 |

交付改动前，请运行测试、typecheck 与 build，然后在真实 Electron 窗口中检查受影响的流程。

## 本地状态保存位置

设置由主进程的 `SettingsStore` 验证并持久化。实时终端状态与有界 scrollback 属于 `TerminalManager`；渲染进程不是 PTY 历史的事实来源。服务商凭据留在已安装 CLI 与可信主进程适配器中，绝不通过 IPC 返回。

精确边界见[架构](ARCHITECTURE.md)，交互与视觉规则见 [UI 契约](UI_CONTRACT.md)。

## 故障排查

### `node-pty` 构建失败

安装操作系统所需的编译器、Python 与平台 headers，然后重新运行 `npm install`。不要用假终端替换原生 PTY：真实本地进程是产品的核心约束。

### 服务商可以启动，但限额不可用

可用的 CLI 会话与可读取的订阅限额 API 是两种独立能力。重新登录 CLI，并查看 CanvasTTY 返回的明确原因。部分账户类型不提供订阅窗口；界面必须显示不可用，而不是 `0%`。

### 终端已打开，却没有显示“工作中”

这是预期行为。新 PTY 从 `idle` 开始。只有结构化的服务商生命周期信号可以设置 `working` 或 `needs_approval`；PTY 存在和终端文本都不属于活动遥测。

下一步：[编写小组件](widget-authoring.zh-CN.md)或阅读[指标与遥测](metrics-and-telemetry.zh-CN.md)。
