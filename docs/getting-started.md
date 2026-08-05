# Getting started

[English](getting-started.md) · [Русский](getting-started.ru.md) · [简体中文](getting-started.zh-CN.md) · [Docs home](README.md)

## Requirements

- Node.js and npm.
- A native compiler toolchain supported by `node-pty` on your platform.
- A graphical desktop session capable of running Electron.
- Optional agent CLIs — `codex`, `claude`, or `kimi` — installed and available in `PATH` for the launchers you intend to use.

CanvasTTY does not install or authenticate agent CLIs for you. Complete each provider's own login flow before expecting its sessions or subscription limits to work.

## Install and run

```bash
npm install
npm run dev
```

`npm install` also prepares Electron and rebuilds the native `node-pty` module. The development command starts the real Electron application, not a browser-only mock.

## First session

1. Open **Terminal** on Home to start a shell immediately in the last project directory.
2. Open **Codex**, **Claude**, or **Kimi** to choose a project folder and launch profile for that fixed provider.
3. Move the live terminal on the canvas or resize it from any edge or corner.
4. Zoom out to use semantic summaries as navigation targets; zoom back in to interact with xterm.
5. Return to Home to inspect real sessions and any provider quota windows that their adapters expose.

The **YOLO** profile disables provider safety prompts where the provider supports such a mode. CanvasTTY presents an explicit danger confirmation; use it only in a directory you are willing to let the agent modify.

## Useful commands

| Command | Purpose |
|:--|:--|
| `npm run dev` | Start the Electron development build |
| `npm test` | Run the Node test suite |
| `npm run typecheck` | Type-check main/preload and renderer projects |
| `npm run build` | Type-check and create the production bundles |
| `npm run preview` | Launch the built application for a production-path check |

Before handing off a change, run the test, typecheck, and build commands, then inspect the affected flow in a real Electron window.

## Where local state lives

Settings are validated and persisted by the main-process `SettingsStore`. Live terminal state and bounded scrollback belong to `TerminalManager`; the renderer is not the source of truth for PTY history. Provider credentials stay with the installed CLIs and trusted main-process adapters and are never returned over IPC.

For the exact boundaries, read [Architecture](ARCHITECTURE.md). For interaction and visual rules, read the [UI contract](UI_CONTRACT.md).

## Troubleshooting

### `node-pty` fails to build

Install the compiler, Python, and platform headers required by your operating system, then rerun `npm install`. Do not replace the native PTY with a fake terminal: real local processes are a core product constraint.

### A provider launches but limits are unavailable

A working CLI session and a readable subscription-quota API are separate capabilities. Re-authenticate the CLI, then inspect the explicit reason exposed by CanvasTTY. Some account types do not provide a subscription window; the UI must show unavailable rather than `0%`.

### A terminal exists but is not marked working

This is expected. A newly opened PTY is `idle`. Only a structured provider lifecycle signal may set `working` or `needs_approval`; terminal text and PTY existence are not activity telemetry.

Next: [author a widget](widget-authoring.md) or study [metrics and telemetry](metrics-and-telemetry.md).
