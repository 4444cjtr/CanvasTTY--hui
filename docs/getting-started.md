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
3. Open **Browser** on Home to create or restore the built-in browser card. Agent sessions launched by CanvasTTY can use its open tabs while **Settings → Browser → Agent access** is enabled.
4. Move or resize the live terminal and browser on the same canvas.
5. Zoom out to use semantic summaries as navigation targets; zoom back in to interact with xterm or the native browser page.
6. Return to Home to inspect real sessions, connected browser agents, and any provider quota windows that their adapters expose.

The **YOLO** profile disables provider safety prompts where the provider supports such a mode. CanvasTTY presents an explicit danger confirmation; use it only in a directory you are willing to let the agent modify.

## Terminal input and controls

- Press any live terminal card to select it. The selected card receives xterm keyboard focus immediately, so typing is sent to its PTY without a second press inside the text area.
- Press empty canvas to clear the selection, keyboard focus, and visible outline.
- **Settings → Controls → Focus on hover** can select the terminal under the pointer and clear it after leaving. The same delay applies in both directions: slow `500ms`, normal `250ms`, or fast `80ms`. It is off by default.
- Terminal scrolling and canvas zoom have independent wheel-direction settings. By default, wheel-down scrolls down in a live terminal, while canvas zoom keeps the original CanvasTTY direction.
- `Shift+Enter` sends a modified Enter sequence to insert a line break in compatible agent prompts without submitting. `Enter` keeps its normal PTY behavior.
- With terminal text selected, `Ctrl+C`/`Ctrl+Shift+C` or `Cmd+C` copies it. Paste with `Ctrl+Shift+V`, `Cmd+V`, or `Shift+Insert`. Plain `Ctrl+C` without a selection remains the PTY interrupt.

## Browser controls and activity

- The browser follows the same configured click-selection and hover-focus behavior as terminal cards. Clicking empty canvas clears the active application.
- Use the trusted tab strip and navigation bar for HTTP(S) pages. Hiding the card preserves tabs; **Close all** removes them after confirmation.
- **Settings → Browser** controls agent access and tab restore and shows recent downloads and command activity.
- **Clear browser data** removes tabs, site data, cache, auth cache, staged uploads, and the current download list. It deliberately keeps the persistent redacted audit log.
- The audit log lives below Electron `userData/browser/audit`, rotates at 100 MB, and prunes rotated files older than 30 days during store initialization or rotation. Read [Built-in browser and audit log](browser.md) before handling or deleting it.

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

Settings are validated and persisted by the main-process `SettingsStore`. Live terminal state and bounded scrollback belong to `TerminalManager`; the renderer is not the source of truth for PTY history. Browser site data stays in its persistent Chromium partition, safe tab restore state stays in `userData/browser-state.json`, and the redacted hash-chain audit stays below `userData/browser/audit`. Provider credentials stay with the installed CLIs and trusted main-process adapters and are never returned over IPC.

For the exact boundaries, read [Architecture](ARCHITECTURE.md). For interaction and visual rules, read the [UI contract](UI_CONTRACT.md).

## Troubleshooting

### `node-pty` fails to build

Install the compiler, Python, and platform headers required by your operating system, then rerun `npm install`. Do not replace the native PTY with a fake terminal: real local processes are a core product constraint.

### A provider launches but limits are unavailable

A working CLI session and a readable subscription-quota API are separate capabilities. Re-authenticate the CLI, then inspect the explicit reason exposed by CanvasTTY. Some account types do not provide a subscription window; the UI must show unavailable rather than `0%`.

### A terminal exists but is not marked working

This is expected. A newly opened PTY is `idle`. Only a structured provider lifecycle signal may set `working` or `needs_approval`; terminal text and PTY existence are not activity telemetry.

Next: read the [browser and audit-log guide](browser.md), [author a widget](widget-authoring.md), or study [metrics and telemetry](metrics-and-telemetry.md).
