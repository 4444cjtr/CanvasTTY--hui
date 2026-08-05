# 指标与遥测

[English](metrics-and-telemetry.md) · [Русский](metrics-and-telemetry.ru.md) · [简体中文](metrics-and-telemetry.zh-CN.md) · [文档首页](README.zh-CN.md)

CanvasTTY 先把遥测视为真实性问题，再把它视为可视化问题。如果数据源无法证明数值，再漂亮的进度条也是错误的。

## 不要混淆不同测量

| 测量 | 含义 | 示例来源 |
|:--|:--|:--|
| 订阅配额 | 服务商定义时间窗口内的用量与重置时间 | 官方 account usage endpoint 或结构化 CLI 协议 |
| 会话 token | 归属于单个会话的 input、output 与 cache token | 结构化服务商 lifecycle/usage event |
| 成本 | 已知模型与价格来源下的实际计费金额 | 官方 billing/usage 记录，而不是用猜测价格乘 token |
| 经过时间 | 从已知会话时间戳开始的墙钟时间 | 本地时钟加真实 lifecycle timestamp |
| 活动状态 | 智能体是否正在工作或等待批准 | 结构化服务商生命周期信号 |

订阅百分比不能从会话 token 推导。Token 数量不自动证明成本。PTY 输出不证明活动状态。

## 当前已经实现的能力

[`LimitsService`](../src/main/services/LimitsService.ts) 通过结构化适配器读取服务商订阅窗口：

- Codex 使用已安装 CLI 的 app-server 协议。
- Claude 与 Kimi 在 CLI 凭据和账户类型支持时，使用只读 usage endpoint。
- 60 秒缓存；此前成功读取后若刷新失败，会返回 stale fallback。
- 只返回经过清洗的 `available`、`stale` 或 `unavailable` snapshot；原始凭据与服务商 payload 不通过 IPC。

CanvasTTY 绝不解析服务商终端 UI 来恢复限额。不支持的订阅类型会明确保持 unavailable。

CanvasTTY **尚未实现公开的逐会话 token 统计 API**。下面的模型是安全的扩展方案，不代表当前已有该遥测。

## 数据源优先级

使用可获得的最高等级来源；没有可信来源时必须停止：

1. 与 session ID 绑定的结构化服务商 event 或本地协议。
2. 具有稳定标识符的官方 usage API。
3. 面向自动化且有文档的 CLI JSON 输出。
4. 带具体原因的 `unavailable`。

不得抓取 ANSI 输出、根据终端文本推断工作状态、按字符估算 token 却标为实际值，也不得向 renderer 暴露认证数据。估算值只能作为独立命名的 estimate，并明确展示方法与不确定性；它不能替代真实 usage 字段。

## 建议的会话 token 契约

Discriminated union 可以避免不可用数据伪装成零：

```ts
type SessionMetricSource =
  | "provider-event"
  | "provider-usage-api"
  | "cli-json";

type SessionMetricUnavailableReason =
  | "unsupported-provider"
  | "not-authenticated"
  | "not-reported"
  | "timeout"
  | "protocol-error";

interface SessionTokenValues {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  totalTokens: number;
}

type SessionTokenUsage =
  | {
      sessionId: string;
      provider: AgentProviderId;
      state: "available";
      source: SessionMetricSource;
      fetchedAt: number;
      values: SessionTokenValues;
    }
  | {
      sessionId: string;
      provider: AgentProviderId;
      state: "stale";
      source: SessionMetricSource;
      fetchedAt: number;
      failedAt: number;
      reason: SessionMetricUnavailableReason;
      values: SessionTokenValues;
    }
  | {
      sessionId: string;
      provider: AgentProviderId;
      state: "unavailable";
      checkedAt: number;
      reason: SessionMetricUnavailableReason;
    };
```

如果来源只能可靠报告 total，就让子字段保持 nullable；不要计算不存在的 input/output 分拆。创建 snapshot 前必须验证每个计数有限、非负且位于安全范围。

## Token 小组件的数据流

```text
结构化服务商来源
        ↓
main 进程适配器
  validate · normalize · cache · bind to session ID
        ↓
经过清洗的 SessionTokenUsage snapshot
        ↓ 白名单 IPC + typed preload
纯 renderer selector
        ↓
Home 小组件或终端卡片摘要
```

Main 适配器负责认证、超时、服务商 schema、并发去重与清理。Renderer 只负责展示与本地选择。如果服务商无法把用量绑定到准确的 CanvasTTY 会话，就不能把 account-wide token 分配给该会话。

## 小组件行为

- 仅在 `available` 或 `stale` 时显示紧凑的数字 total。
- stale 数据要明确标记，不能替换为零；来源时间戳应在辅助文本或详情中可见。
- 使用本地化的 unavailable 原因，不显示空进度条。
- 只有存在真实 denominator 时才使用确定进度条。单独的 token usage 通常没有 denominator。
- 会话总量与服务商配额窗口必须分开。
- 被动 Home 指标不能捕获鼠标滚轮。
- 历史必须按数量或时间限制，不能无限增加 renderer 内存或持久化状态。

## 隐私与安全

- 只返回计数与最少来源 metadata，不返回 prompt、response、terminal buffer、账户 token、cookie 或原始 payload。
- 服务商凭据只能由可信 main 进程读取，也只能发送到对应的官方 endpoint。
- 记录日志前清洗子进程 stderr；服务商工具可能输出敏感路径或标识符。
- 避免逐按键遥测，优先使用服务商聚合值或低频生命周期 event。
- 明确限制网络超时并终止子进程，防止适配器阻塞应用退出。

## 缓存与新鲜度

根据数据语义选择刷新频率，而不是为了动画。订阅配额可以接受一分钟缓存；会话 token 可以在结构化 message/completion event 到达时更新。对并发刷新去重。短暂失败后可保留最后有效 snapshot 并标为 `stale`，但不能在没有可见年龄或过期策略的情况下永久保留。

## 测试矩阵

| 范围 | 用例 |
|:--|:--|
| 规范化 | 完整 payload、只有 total、零 token、格式错误/负值/非有限值 |
| 标识 | 正确会话绑定、未知会话、provider mismatch、无 session key 的 account-wide 响应 |
| 状态 | loading、available、stale fallback、unavailable 原因、首次读取错误 |
| 生命周期 | 并发刷新去重、超时、子进程清理、会话销毁 |
| 安全 | snapshot 与日志中无凭据/原始 payload，只有白名单 IPC |
| 展示 | 不虚构 denominator、保留 stale 标签、unavailable 已本地化、被动 wheel 行为正确 |

先运行适配器与纯 selector 的聚焦单元测试，再运行 `npm test`、`npm run typecheck` 和 `npm run build`。最后在真实 Electron 中以正常比例与缩小状态检查小组件。

实现位置与视觉规则见[编写小组件](widget-authoring.zh-CN.md)。
