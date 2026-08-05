# CanvasTTY documentation

[English](README.md) · [Русский](README.ru.md) · [简体中文](README.zh-CN.md)

CanvasTTY is a spatial Electron desktop for real local terminals and AI-agent CLI sessions. This documentation explains how to run the MVP, preserve its process and visual contracts, and extend it with honest source-backed widgets.

## Guides

| Guide | What it covers |
|:--|:--|
| [Getting started](getting-started.md) | Requirements, local launch, first session, and verification commands |
| [Installing, releases, and local data](installing-and-security.md) | Installer formats, unsigned-preview caveats, credential boundaries, and release checks |
| [Widget authoring](widget-authoring.md) | Source-level extension paths, visual grammar, process boundaries, and an AI-agent brief |
| [Metrics and telemetry](metrics-and-telemetry.md) | Subscription limits, session token usage, source priority, privacy, stale states, and tests |

## Maintainer references

| Contract | Read it before… |
|:--|:--|
| [Architecture](ARCHITECTURE.md) | changing IPC, PTY lifecycle, persistence, process ownership, or provider adapters |
| [UI contract](UI_CONTRACT.md) | changing Home, launch flow, Settings, canvas behavior, terminal cards, or visual semantics |

## Current extension model

CanvasTTY treats a custom widget as a source-level contribution compiled with the app rather than a third-party runtime plugin. This is intentional for the MVP: Electron capabilities remain allow-listed, shared data remains typed, and provider credentials never cross into the renderer.

When a runtime plugin API is introduced, this documentation must be revised around an explicit permission model rather than treating current source-level examples as a stable public ABI.

## Non-negotiable data rule

Never invent session status, counters, quota, token usage, cost, countdowns, or progress. Use a real structured source and surface `loading`, `stale`, `unavailable`, or `error` when the source cannot answer.

Back to the [repository overview](../README.md).
