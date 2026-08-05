# CanvasTTY 文档

[English](README.md) · [Русский](README.ru.md) · [简体中文](README.zh-CN.md)

CanvasTTY 是一个基于 Electron 的空间画布桌面，用于承载真实的本地终端和 AI 智能体 CLI 会话。本文档介绍如何运行 MVP、遵守进程与视觉契约，以及如何基于有真实数据源支撑的小组件进行扩展。

## 指南

| 指南 | 内容 |
|:--|:--|
| [快速开始](getting-started.zh-CN.md) | 环境要求、本地启动、首个会话与验证命令 |
| [安装、发布与本地数据](installing-and-security.zh-CN.md) | 安装包格式、未签名预览版注意事项、凭据边界与发布检查 |
| [编写小组件](widget-authoring.zh-CN.md) | 源码级扩展路径、视觉语言、进程边界与 AI 智能体任务简报 |
| [指标与遥测](metrics-and-telemetry.zh-CN.md) | 订阅限额、会话 token 用量、数据源优先级、隐私、`stale` 状态与测试 |

## 维护者参考

| 契约 | 改动以下内容前先阅读 |
|:--|:--|
| [架构](ARCHITECTURE.md) | IPC、PTY 生命周期、持久化、进程职责或服务商适配器 |
| [UI 契约](UI_CONTRACT.md) | Home、启动流程、Settings、画布行为、终端卡片或视觉语义 |

## 当前扩展方式

CanvasTTY 将自定义小组件视为随应用一起编译的源码级贡献，而非第三方运行时插件。这是 MVP 阶段有意为之的设计：Electron 能力采用白名单机制，共享数据保持类型化，服务商凭据绝不进入渲染进程。

如果未来引入运行时插件 API，文档必须围绕明确的权限模型重新编写，而不能把当前的源码级示例当作稳定的公共 ABI。

## 不可妥协的数据规则

不得虚构会话状态、计数器、配额、token 用量、成本、倒计时或进度。必须使用真实的结构化数据源；当数据源无法给出答案时，应显示 `loading`、`stale`、`unavailable` 或 `error`。

返回 [仓库概览](../README.zh-CN.md)。
