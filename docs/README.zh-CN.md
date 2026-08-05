# CanvasTTY 文档

[English](README.md) · [Русский](README.ru.md) · [简体中文](README.zh-CN.md)

CanvasTTY 是一个面向真实本地终端与 AI 智能体 CLI 会话的 Electron 空间桌面。本文档介绍如何运行 MVP、维护进程与视觉契约，以及如何使用可验证的数据源扩展小组件。

## 指南

| 指南 | 内容 |
|:--|:--|
| [快速开始](getting-started.zh-CN.md) | 环境要求、本地启动、首个会话与验证命令 |
| [安装、发布与本地数据](installing-and-security.zh-CN.md) | 安装包格式、未签名预览版提示、凭据边界与发布检查 |
| [编写小组件](widget-authoring.zh-CN.md) | 源码级扩展路径、视觉语言、进程边界与 AI 智能体任务模板 |
| [指标与遥测](metrics-and-telemetry.zh-CN.md) | 订阅限额、会话 token、数据源优先级、隐私、过期状态与测试 |

## 维护者参考

| 契约 | 在以下改动前阅读 |
|:--|:--|
| [架构](ARCHITECTURE.md) | IPC、PTY 生命周期、持久化、进程职责或服务商适配器 |
| [UI 契约](UI_CONTRACT.md) | Home、启动流程、Settings、画布行为、终端卡片或视觉语义 |

## 当前扩展方式

CanvasTTY 尚不加载第三方运行时插件。自定义小组件是与应用一起编译的源码级贡献。对于 MVP，这是有意为之：Electron 能力保持白名单控制，跨进程数据保持类型约束，服务商凭据绝不进入渲染进程。

如果未来引入运行时插件 API，文档必须围绕明确的权限模型重新设计，不能把当前源码示例视为稳定的公共 ABI。

## 不可妥协的数据规则

不得虚构会话状态、计数器、配额、token 用量、成本、倒计时或进度。必须使用真实的结构化来源；当来源无法回答时，应显示 `loading`、`stale`、`unavailable` 或 `error`。

返回[仓库概览](../README.zh-CN.md)。
