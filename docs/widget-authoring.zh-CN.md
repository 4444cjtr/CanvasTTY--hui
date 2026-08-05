# 编写小组件

[English](widget-authoring.md) · [Русский](widget-authoring.ru.md) · [简体中文](widget-authoring.zh-CN.md) · [文档首页](README.zh-CN.md)

CanvasTTY 小组件目前是源码级扩展，而不是运行时插件。本指南说明如何在不削弱 Electron 隔离、不虚构遥测、不偏离视觉体系的前提下添加小组件。

## 选择最小的扩展形态

| 形态 | 适用场景 | 常见归属 |
|:--|:--|:--|
| 被动 Home 小组件 | 时钟、启动入口、派生标签，或不消费滚轮输入的 renderer-local 展示 | `features/home/` 加纯 selector |
| 由 main 提供数据的 Home 小组件 | 服务商用量、机器状态，或需要文件系统、网络、凭据、子进程的数据 | shared contract → main service → IPC/preload → 纯 selector → Home 组件 |
| 画布实体 | 拥有世界坐标、可选尺寸与焦点行为的可移动空间对象 | 由 `WorkspaceCanvas` 组合的独立 feature 组件 |

如果类型化的 renderer 状态已经包含数据，就不要额外创建 main 服务。也不要因为写起来更短，就让 React 直接执行特权读取。

## 进程边界实现顺序

对于由 main 提供数据的小组件，请按以下顺序实现：

1. 在 [`src/shared/contracts.ts`](../src/shared/contracts.ts) 中添加经过清洗的请求/snapshot 类型和 IPC 名称。
2. 在 [`src/main/services/`](../src/main/services/) 中添加职责单一的适配器或服务，由它管理凭据、子进程、超时、验证、缓存与清理。
3. 在 [`src/main/ipc/registerIpc.ts`](../src/main/ipc/registerIpc.ts) 中注册一个白名单 handler。
4. 从 [`src/preload/index.ts`](../src/preload/index.ts) 仅暴露类型化能力。不得暴露 Node 原语、原始 IPC、token、cookie 或服务商原始响应。
5. 在所属 feature 附近使用纯 selector，把 snapshot 转换为视图数据。
6. 用职责单一的组件渲染状态，并从 Home 或 `WorkspaceCanvas` 组合它。
7. 先测试规范化、错误/stale 行为与 selector，再检查真实 Electron 流程。

`App.tsx` 是编排边界。Feature 可以拥有自身独占能力，但不应调用无关 feature 的 API。

## 视觉语言

新小组件应当自然融入 CanvasTTY：

- 从安静的空间桌面出发，而不是堆满控件的仪表盘。
- 使用大型平面卡片、柔和圆角、克制阴影与充足留白。
- 石墨色用于终端等操作表面；鼠尾草绿、粉、蓝、淡黄用于安静的画布强调色。
- 标签保持简短，层级在第一眼和缩放过程中都清晰。
- 优先保留一个明确主操作。避免装饰性状态点、仅 hover 才出现的核心操作、嵌套边框，以及围绕显而易见控件的解释性小字。
- 只有当表面确实滚动或消费滚轮时才接管 wheel。被动 Home 小组件应保留画布缩放。
- 使用 [`assets/icons/lucide`](../src/renderer/src/assets/icons/lucide/) 中已经 vendored 的官方 Lucide SVG，以及 [`assets/providers`](../src/renderer/src/assets/providers/README.md) 中记录的服务商标识。不要在 TSX 中重绘图标。
- 明确建模 `loading`、`available`、`stale`、`unavailable` 与 `error`。缺失数据不能变成空进度条、零值或假成功。
- 同时验证正常比例与缩小后的语义可读性。相同实体必须保持一致的字体与字重。

Home 的职责固定：媒体控件留在 `HomeMediaWidget`；Settings 只负责语言、配色、画布图案和窗口吸附。修改前请阅读 [UI 契约](UI_CONTRACT.md)。

## 给其他 AI coding agent 的任务模板

复制下面内容，并替换方括号中的字段：

```text
为 CanvasTTY 添加名为 [名称] 的小组件，用于展示 [用户价值]。

修改前先阅读 docs/ARCHITECTURE.md 与 docs/UI_CONTRACT.md，并找到最接近的
现有 feature 模式。CanvasTTY 是启用 context isolation 的 Electron MVP：
特权工作留在 main，跨进程数据声明在 src/shared/contracts.ts，IPC 必须进入
白名单，preload 只暴露类型化且经过清洗的能力。

数据来源：[结构化来源]。禁止解析 terminal/TUI 文本，禁止虚构数值。明确渲染
loading、available、stale、unavailable 和 error。不要暴露凭据、服务商原始响应、
prompt 或无界历史。

视觉方向：安静的空间桌面；大型平面卡片；柔和圆角；克制阴影；石墨色操作表面，
搭配鼠尾草绿/粉/蓝/黄；短标签；画布缩放时仍可读。复用 vendored Lucide/provider
资源。不要添加装饰性状态点、仅 hover 的核心操作、嵌套边框或 TSX 自定义 SVG。
保持 wheel 所有权规则。

范围：[HOME PASSIVE / HOME MAIN-BACKED / CANVAS ENTITY]。为规范化与状态选择
添加聚焦测试。运行 npm test、npm run typecheck、npm run build，并在真实 Electron
窗口中检查流程。不要添加软件包。
```

## 源码布局示例

这只是命名示例，不是运行时插件 ABI：

```text
src/shared/contracts.ts
src/main/services/SessionUsageService.ts
src/main/ipc/registerIpc.ts
src/preload/index.ts
src/renderer/src/features/session-usage/
├── SessionUsageWidget.tsx
├── sessionUsageModel.ts
└── sessionUsage.css
tests/session-usage.test.mjs
```

优先复用已有 style tokens。如果小组件属于 Home，应放入已批准的逻辑布局，不要悄悄改变 Home 尺寸，也不要移动其他 feature 的控件。

## 完成标准

- 显示值能够追溯到明确命名的结构化来源。
- 特权访问留在 main；renderer 只接收经过清洗的类型化数据。
- 缺失、过期与失败读取彼此可区分。
- 小组件职责明确，不重复 Settings 或媒体控件。
- Wheel、focus、drag 与 canvas zoom 不冲突。
- 在目标缩放级别中可读，并复用现有 assets。
- 规范化与 selector 行为有聚焦测试。
- `npm test`、`npm run typecheck`、`npm run build` 通过。
- 已在真实 Electron 流程中检查。

完整的数据模型示例见[指标与遥测](metrics-and-telemetry.zh-CN.md)。
