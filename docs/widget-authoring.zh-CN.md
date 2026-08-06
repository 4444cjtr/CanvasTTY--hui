# 编写小组件

[English](widget-authoring.md) · [Русский](widget-authoring.ru.md) · [简体中文](widget-authoring.zh-CN.md) · [文档首页](README.zh-CN.md)

本指南介绍随 CanvasTTY 一起编译的可信源码级小组件。对于运行时安装的第三方包，请使用带权限模型的[运行时插件 API](plugins.zh-CN.md)。当功能需要新的可信主进程适配器或改变核心产品职责时，仍应采用源码级方式。

## 选择最小的扩展形态

| 形态 | 适用场景 | 常见归属 |
|:--|:--|:--|
| 被动 Home 小组件 | 时钟、启动入口、派生标签，或其他只在渲染进程本地展示、不消费滚轮输入的内容 | `features/home/` 加纯 selector |
| 由主进程提供数据的 Home 小组件 | 服务商用量、机器状态，或其他需要文件系统、网络、凭据、子进程才能获取的数据 | shared contract → 主进程服务 → IPC/preload → 纯 selector → Home 组件 |
| 画布实体 | 拥有世界坐标、可选尺寸与焦点行为的可移动空间对象 | 由 `WorkspaceCanvas` 组合的独立 feature 组件 |

如果类型化的渲染进程状态里已经有了数据，就不要再为它添加主进程服务；也不要因为图方便，就直接在 React 里获取特权数据。

## 进程边界上的实现顺序

对于由主进程提供数据的小组件，请按以下顺序实现：

1. 在 [`src/shared/contracts.ts`](../src/shared/contracts.ts) 中添加经过脱敏的请求/snapshot 类型和 IPC 名称。
2. 在 [`src/main/services/`](../src/main/services/) 下添加职责单一的适配器或服务，由它管理凭据、子进程、超时、校验、缓存与清理。
3. 在 [`src/main/ipc/registerIpc.ts`](../src/main/ipc/registerIpc.ts) 中注册一个加入白名单的 handler。
4. 从 [`src/preload/index.ts`](../src/preload/index.ts) 只暴露类型化能力。绝不暴露 Node 原语、原始 IPC、token、cookie 或服务商的响应。
5. 在所属 feature 附近用纯 selector 把 snapshot 转换为视图数据。
6. 用职责单一的组件渲染状态，并在 Home 或 `WorkspaceCanvas` 中组合它。
7. 先测试规范化、错误/stale 行为和 selector，再检查真实 Electron 流程。

`App.tsx` 是编排边界。feature 可以拥有自己独占的能力，但不得调用无关 feature 的 API。

## 视觉语言

新小组件应当看起来生来就属于 CanvasTTY：

- 以安静的空间桌面为基调，而不是堆满控件的仪表盘。
- 使用大而扁平的卡片、柔和的圆角、克制的阴影和充裕的留白。
- 石墨色用于终端等操作界面；鼠尾草绿、粉、蓝、淡黄作为画布上安静的点缀色。
- 标签保持简短，层级一目了然，缩放过程中也清晰可读。
- 优先保留一个明确的主操作。避免装饰性的状态圆点、只有悬停才出现的核心操作、嵌套边框，以及给不言自明的控件配上解释性小字。
- 只有当某个界面真的需要滚动或消费滚轮输入时，才把滚轮事件交给它。被动 Home 小组件应保留画布缩放。
- 使用 [`assets/icons/lucide`](../src/renderer/src/assets/icons/lucide/) 中仓库内置的官方 Lucide SVG，以及 [`assets/providers`](../src/renderer/src/assets/providers/README.md) 中有文档记录的服务商标识。不要在 TSX 中重绘图标。
- 明确建模 `loading`、`available`、`stale`、`unavailable` 和 `error` 状态。数据缺失不能显示成空进度条、零值或假成功。
- 在正常比例和缩小状态下都要验证语义可读性。相同实体必须保持一致的字体和字重。

Home 的职责划分是固定的：媒体控件留在 `HomeMediaWidget`。用户配置由 Settings 中的 General、Appearance、Controls 和 Plugins 管理；feature 的运行时行为仍由所属组件或服务负责。改动这些职责前，请先阅读 [UI 契约](UI_CONTRACT.zh-CN.md)。

## 给其他 AI 编程智能体的任务简报

复制下面这段内容，替换方括号中的字段：

```text
为 CanvasTTY 添加名为 [名称] 的小组件，用于展示 [用户价值]。

修改前先阅读 docs/ARCHITECTURE.md 与 docs/UI_CONTRACT.md，并找到最接近的
现有 feature 模式。CanvasTTY 是启用 context isolation 的 Electron MVP：
特权工作留在 main，跨进程数据声明在 src/shared/contracts.ts，IPC 必须进入
白名单，preload 只暴露类型化且经过脱敏的能力。

数据来源：[结构化来源]。禁止解析 terminal/TUI 文本，禁止虚构数值。明确渲染
loading、available、stale、unavailable 和 error。不要暴露凭据、服务商原始响应、
prompt 或无上限的历史记录。

视觉方向：安静的空间桌面；大型平面卡片；柔和圆角；克制阴影；石墨色操作表面，
搭配鼠尾草绿/粉/蓝/黄；短标签；画布缩放时仍可读。复用 vendored Lucide/provider
资源。不要添加装饰性状态点、仅 hover 的核心操作、嵌套边框或 TSX 自定义 SVG。
保持滚轮所有权规则。

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

优先复用现有的共享 style token，再考虑添加 feature 级 CSS。如果小组件属于 Home，把它放进已批准的逻辑布局里，不要悄悄改变 Home 的尺寸，也不要挪动其他 feature 的控件。

## 完成标准

- 界面上显示的值可以追溯到明确命名的结构化数据来源。
- 特权访问留在主进程；渲染进程数据经过脱敏且类型化。
- 数据缺失、过期和读取失败三种情况可以明确区分。
- 小组件职责归属明确，不重复 Settings 或媒体控件的功能。
- 滚轮、焦点、拖拽和画布缩放行为互不冲突。
- 小组件在目标缩放级别下可读，并复用现有 assets 资源。
- 规范化和 selector 行为有聚焦测试。
- `npm test`、`npm run typecheck`、`npm run build` 全部通过。
- 已在真实 Electron 流程中检查过。

完整的数据模型示例见[指标与遥测](metrics-and-telemetry.zh-CN.md)。
