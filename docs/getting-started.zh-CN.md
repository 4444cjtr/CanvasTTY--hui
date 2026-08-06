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
3. 在 Home 打开 **Browser**，创建或恢复内置浏览器卡片。启用 **设置 → 浏览器 → 智能体访问** 后，由 CanvasTTY 启动的智能体会话可以使用已打开的标签页。
4. 在同一画布上移动实时终端和浏览器，或调整它们的大小。
5. 缩小画布后借助语义摘要导航；放大后继续使用 xterm 或原生浏览器页面。
6. 回到 Home，查看真实会话、已连接的浏览器智能体以及适配器提供的服务商配额窗口。

在服务商支持的情况下，**YOLO** 配置会关闭其安全确认提示。CanvasTTY 会弹出明确的危险确认；只在你愿意让智能体改动的目录中使用该配置。

## 终端输入与控制

- 点击任意实时终端卡片即可选中它。选中后，卡片立即获得 xterm 键盘焦点，因此无需再次点击文本区域，输入就会发送到对应 PTY。
- 点击空白画布会清除选中状态、键盘焦点和可见边框。
- **设置 → 控制 → 悬停时聚焦** 可以在指针停留后选中终端，并在指针离开后取消选中。进入和离开使用相同延迟：慢速 `500ms`、正常 `250ms`、快速 `80ms`。默认关闭。
- 终端滚动与画布缩放的滚轮方向可以独立设置。默认情况下，滚轮向下会让实时终端向下滚动，画布缩放则保持 CanvasTTY 原有方向。
- `Shift+Enter` 会发送带修饰符的 Enter，在兼容的智能体 prompt 中插入换行而不提交；普通 `Enter` 保持原有 PTY 行为。
- 选中终端文字后，使用 `Ctrl+C`/`Ctrl+Shift+C` 或 `Cmd+C` 复制；使用 `Ctrl+Shift+V`、`Cmd+V` 或 `Shift+Insert` 粘贴。没有选中文字时，普通 `Ctrl+C` 仍是 PTY 中断。

## 浏览器控制与活动

- 浏览器与终端卡片遵循相同的点击选中和悬停聚焦设置。点击空白画布会清除活动应用。
- 使用可信标签栏与导航栏访问 HTTP(S) 页面。隐藏卡片会保留标签页；确认后使用 **全部关闭** 才会移除它们。
- **设置 → 浏览器** 控制智能体访问和标签页恢复，并显示最近下载和命令活动。
- **清除浏览器数据** 会删除标签页、网站数据、cache、auth cache、暂存上传和当前下载列表，但会刻意保留持久化脱敏审计日志。
- 审计日志位于 Electron `userData/browser/audit`，达到 100 MB 时轮转，并在 store 初始化或轮转时清理超过 30 天的轮转文件。手动处理或删除前请阅读[浏览器与审计日志指南](browser.zh-CN.md)。

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

设置由主进程中的 `SettingsStore` 校验并持久化。实时终端状态和有上限的滚动缓冲区归 `TerminalManager` 管理；渲染进程并不是 PTY 历史记录的可信来源。浏览器网站数据留在持久化 Chromium partition 中，安全的标签恢复状态位于 `userData/browser-state.json`，脱敏 hash-chain 审计位于 `userData/browser/audit`。服务商凭据只留在已安装的 CLI 和可信的主进程适配器里，绝不通过 IPC 传出。

确切的边界见[架构](ARCHITECTURE.zh-CN.md)文档，交互与视觉规则见 [UI 契约](UI_CONTRACT.zh-CN.md)。

## 故障排查

### `node-pty` 编译失败

安装操作系统所需的编译器、Python 和平台头文件，然后重新运行 `npm install`。不要用假终端替代原生 PTY：真实的本地进程是本产品的核心约束。

### 服务商能启动，但限额不可用

能用的 CLI 会话和可读取的订阅限额 API 是两项独立的能力。重新登录 CLI，然后查看 CanvasTTY 给出的具体原因。有些账户类型本身不提供订阅配额窗口；此时界面必须显示为不可用，而不是 `0%`。

### 终端已打开，却没有标记为“工作中”

这是预期行为。新打开的 PTY 初始状态是 `idle`。只有结构化的服务商生命周期信号才能把状态设为 `working` 或 `needs_approval`；PTY 存在和终端文本本身都不构成活动遥测。

下一步：阅读[浏览器与审计日志](browser.zh-CN.md)、[编写小组件](widget-authoring.zh-CN.md)，或查看[指标与遥测](metrics-and-telemetry.zh-CN.md)。
