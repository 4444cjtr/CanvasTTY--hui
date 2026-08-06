# 更新日志

[English](CHANGELOG.md) · [Русский](CHANGELOG.ru.md) · [简体中文](CHANGELOG.zh-CN.md)

## 1.0.1

- 新增终端 `Shift+Enter` 换行，不提交当前 prompt。
- 修复终端选择与键盘焦点：选中实时卡片后，输入立即进入 xterm；点击空白画布会清除选择和高亮边框。
- 新增可选的悬停聚焦，进入和离开均可选择慢速（`500ms`）、正常（`250ms`）或快速（`80ms`）延迟。程序触发的 hover focus 不再把 focus-report sequence 发送给智能体 TUI，也不会把历史位置跳回开头。
- 新增终端滚动与画布缩放相互独立的滚轮方向设置。默认滚轮向下会让终端向下滚动，画布缩放保留原有方向。
- PTY 输出以 16ms 为窗口合并后发送给渲染进程；反复复制 scrollback 字符串改为有界分块缓冲区，从而消除大量输出时的闪烁并减少历史重置。
- 设置、插件注册表和媒体目录授权的写入队列现在可在临时文件系统错误后恢复，服务商客户端元数据也与打包应用版本保持一致。
- 新增完整的简体中文 runtime 插件文档，同步英语、俄语和中文终端控制说明，并记录插件、媒体目录与浏览器的本地数据。
- 新增 MIT 许可证，以及 Security、Changelog、Architecture 和 UI Contract 的本地化版本。

## 1.0.0

- 新增轻量本地启动页，在设置、插件、媒体和 IPC 服务初始化之前显示；bootstrap 失败时会显示可见错误页，并以原生对话框作为 fallback，不再留下空白窗口。
- 新增 Electron 单实例锁：再次启动会恢复并聚焦现有窗口。
- 将终端指针坐标从画布的 CSS 变换矩形映射回 xterm layout 坐标，使文字选择、vim/tmux mouse reporting 和滚轮滚动在任意画布缩放下都能工作。
- 重做终端剪贴板快捷键：有选择时用 `Ctrl+C`、`Ctrl+Shift+C` 或 `Cmd+C` 复制；用 `Ctrl+Shift+V`、`Cmd+V` 或 `Shift+Insert` 通过 `Terminal.paste` 粘贴。快捷键按物理按键匹配，可在非拉丁键盘布局下工作。
- 新增打包应用 smoke harness（`CANVASTTY_SMOKE_TEST=1` 在首次绘制后输出 `CANVASTTY_SMOKE_READY`），并在 Linux release pipeline 中通过带 FUSE2 的 `xvfb-run` 执行。

## 0.9.99 — 公开预览版

- 新增带权限模型的 runtime 插件 registry，可安装已构建好的静态 GitHub 仓库。
- 新增 manifest v1 contribution：sandbox HOME 小组件、可移动画布应用和 CanvasTTY 管理的独立窗口。
- 新增插件预览/权限审查、启用/禁用/卸载、隔离存储、受 CSP 约束的资源和共享 host SDK。
- 新增持久化的用户音乐目录授权、可 seek 的本地音频流，以及受限的播放列表读写 API。
- 新增 sandbox 内置浏览器核心框架，包含标签页、导航、持久化隔离 profile 和画布卡片几何；目前有意不从 HOME 暴露。
- 将固定 HOME 布局替换为可持久化的 `16 × 12` 宽松网格和可视化拖拽/缩放编辑器，同时保留批准的默认布局。
- 新增任意边缘窗口/HOME 小组件缩放、仅编辑时显示的 HOME 边界、越界 draft 摆放、保存校验和编辑模式隔离。
- 新增 runtime 插件架构/开发文档以及完整的 Studio Kit 示例包。

## 0.9.2 — 公开预览版

- 服务商 CLI 查找支持跨平台：Linux 和 Windows 都会解析用户 CLI 目录，因此 AppImage 与 Windows 构建可以找到已有的 `codex`、`claude` 和 `kimi`。

## 0.9.1 — 公开预览版

- 修复图形化 AppImage 启动时的 CLI 查找：使用现有用户 CLI 目录补充桌面会话 `PATH`，包括 `~/.kimi-code/bin`。
- PTY 退出与延迟的终端输入/尺寸事件发生竞态时，不再以 `EBADFD` 崩溃 Electron 主进程。

## 0.9.0 — 公开预览版

- 修复 renderer 在 `loadURL` 完成前绘制时主窗口无法出现的问题；`ready-to-show` listener 现在会提前注册。
- 新增 RTS 风格的边缘平移，默认关闭；指针位于交互界面上时暂停。
- Settings 新增边缘平移开关/速度和滚轮缩放灵敏度。
- Settings 重组为 General、Appearance 和 Controls。
- 新增 Off、Single click 和 Double click 终端聚焦/缩放模式；自动点击聚焦默认关闭。
- 新增可重映射快捷键：`Home` 聚焦 Home 区域，`F2` 行内重命名终端窗口，并提供可隐藏的实时快捷键提示。
- 切换配色、图案、设置和自定义窗口标题时保留 PTY 状态与 scrollback。
- 改进终端剪贴板快捷键、边缘缩放、语义缩放交互和多语言文档。

## 0.8.2 — 公开预览版

- Release job 只发布面向用户的安装包，不包含解包后的构建目录。
- Windows NSIS 与 portable 可执行文件使用不同的 artifact 名称。

## 0.8.1 — 公开预览版

- 仓库和文档安全检查兼容 LF/CRLF checkout 与 Windows drive path。
- 应用行为与 `0.8.0` preview candidate 相同。

## 0.8.0 — 公开预览版

- 面向真实本地 PTY 与 AI 智能体 CLI 会话的空间画布。
- 固定 Home 区域，包含 launcher、sessions、clock、media 和基于真实来源的服务商限额。
- 可移动、可调整尺寸、带 snapping 和 semantic zoom navigation 的终端卡片。
- Electron 进程隔离、类型化白名单 IPC 和仅本地设置。
- 英语、俄语与简体中文仓库入口和文档。
- 通过 GitHub Actions 可复现地打包 Linux、Windows 和 macOS。
- 仓库秘密审计和严格的包内容 allowlist。

已知预览限制：runtime widget 插件尚未实现；Windows 与 macOS 仍需要更广泛的真实设备验证；发布包尚未代码签名或 notarized。
