# 快速开始

[English](getting-started.md) · [Русский](getting-started.ru.md) · [简体中文](getting-started.zh-CN.md) · [文档首页](README.zh-CN.md)

## 环境要求

- Node.js 与 npm。
- 当前平台上 `node-pty` 支持的原生编译工具链。
- 能运行 Electron 的图形桌面环境。
- 可选：安装 `codex`、`claude` 或 `kimi` 等智能体 CLI 并加入 `PATH`，只装你打算使用的启动器对应的即可。

CanvasTTY 不会替你安装或登录智能体 CLI。想让某个服务商的会话或订阅限额可用，请先完成该服务商自己的登录流程。

## 安装与运行

```bash
npm install
npm run dev
```

`npm install` 还会准备 Electron 并重新编译原生的 `node-pty` 模块。开发命令启动的是真正的 Electron 应用，不是只能在浏览器里跑的模拟界面。

## 第一个会话

1. 在 Home 页点击 **Terminal**，立即在上次使用的项目目录里打开一个 shell。
2. 点击 **Codex**、**Claude** 或 **Kimi**，为对应的固定服务商选择项目目录和启动配置。
3. 在画布上拖动实时终端，或从任意边缘、角落调整大小。
4. 缩小画布后借助语义摘要在画布上导航定位；放大画布后回到 xterm 继续交互。
5. 回到 Home 页，查看真实会话，以及适配器暴露出来的服务商配额窗口。

在服务商支持的情况下，**YOLO** 配置会关闭其安全确认提示。CanvasTTY 会弹出明确的危险确认；只在你愿意让智能体改动的目录中使用该配置。

## 常用命令

| 命令 | 用途 |
|:--|:--|
| `npm run dev` | 启动 Electron 开发构建 |
| `npm test` | 运行 Node 测试套件 |
| `npm run typecheck` | 对 main/preload 和渲染进程项目做类型检查 |
| `npm run build` | 类型检查并生成生产环境构建产物 |
| `npm run preview` | 启动构建好的应用，验证生产环境路径 |

提交改动之前，请先跑测试、typecheck 和 build，然后在真实的 Electron 窗口里检查受影响的流程。

## 本地状态的存储位置

设置由主进程中的 `SettingsStore` 校验并持久化。实时终端状态和有上限的滚动缓冲区归 `TerminalManager` 管理；渲染进程并不是 PTY 历史记录的可信来源。服务商凭据只留在已安装的 CLI 和可信的主进程适配器里，绝不通过 IPC 传出。

确切的边界见[架构](ARCHITECTURE.md)文档，交互与视觉规则见 [UI 契约](UI_CONTRACT.md)。

## 故障排查

### `node-pty` 编译失败

安装操作系统所需的编译器、Python 和平台头文件，然后重新运行 `npm install`。不要用假终端替代原生 PTY：真实的本地进程是本产品的核心约束。

### 服务商能启动，但限额不可用

能用的 CLI 会话和可读取的订阅限额 API 是两项独立的能力。重新登录 CLI，然后查看 CanvasTTY 给出的具体原因。有些账户类型本身不提供订阅配额窗口；此时界面必须显示为不可用，而不是 `0%`。

### 终端已打开，却没有标记为“工作中”

这是预期行为。新打开的 PTY 初始状态是 `idle`。只有结构化的服务商生命周期信号才能把状态设为 `working` 或 `needs_approval`；PTY 存在和终端文本本身都不构成活动遥测。

下一步：[编写小组件](widget-authoring.zh-CN.md)，或阅读[指标与遥测](metrics-and-telemetry.zh-CN.md)。
