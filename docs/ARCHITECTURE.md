# Architecture

## Process boundaries

CanvasTTY follows Electron's three-layer model:

```text
React renderer
    │ typed window.canvasTTY API
    ▼
preload bridge (contextBridge)
    │ allow-listed IPC channels
    ▼
Electron main process
    ├── SettingsStore  → validated, atomic JSON persistence
    ├── TerminalManager → node-pty lifecycle and scrollback
    ├── LimitsService  → sanitized provider-limit adapters and cache
    ├── PluginManager  → GitHub install, manifest validation, assets, permissions, storage
    ├── PluginMediaService → user-granted music folders, ranged audio streams, playlist files
    ├── BrowserService → built-in tabs and isolated WebContentsView lifecycle
    ├── canvastty-plugin:// → CSP-constrained static plugin resources
    ├── canvastty-media:// → permission-checked local audio streams
    └── native dialogs/window controls
```

- `src/shared/contracts.ts` is the single public contract between processes. Add or change cross-process data here first.
- `src/preload/index.ts` exposes only the typed capabilities the renderer needs. Node integration stays disabled; context isolation and sandbox stay enabled.
- `src/main/ipc/registerIpc.ts` owns native side effects and validates access to persisted media.
- `src/main/services/TerminalManager.ts` is the source of truth for live session state and PTY buffers. A new PTY is `idle`; process exit provides only `done` or `failed`. `working` and `needs_approval` are accepted only as typed provider lifecycle signals, never inferred from PTY existence or terminal text.
- `src/main/services/LimitsService.ts` reads Codex through the installed CLI's app-server protocol and Claude/Kimi through their provider usage endpoints. Provider credentials are read only inside the trusted main process, sent only to the matching provider over HTTPS, and never logged or exposed over IPC. The service owns timeout, structural normalization, caching, stale fallback, and subprocess cleanup; raw provider responses never cross IPC.
- `src/main/services/SettingsStore.ts` normalizes every update and persists through a serialized atomic write.
- `src/main/services/PluginManager.ts` installs ready-to-run static repositories without executing package scripts, rejects symlinks and oversized packages, persists the enabled registry, serves only contained package files, and enforces per-plugin permissions/storage quotas.
- `src/main/services/PluginMediaService.ts` persists per-plugin grants only after a native folder choice, hides absolute paths, skips symlinks, and serves contained audio with HTTP Range semantics. Playlist reads stay inside granted libraries; writes are bounded and atomic under the library's `Playlists/` directory.
- `src/main/services/BrowserService.ts` owns the built-in browser's `WebContentsView` tabs. Remote pages use a dedicated persistent partition with Node disabled, context isolation and sandbox enabled, and website permission requests denied by default. It is a core service, never a runtime plugin capability.
- `src/main/services/cliEnvironment.ts` supplements the graphical-session `PATH` with existing per-user CLI directories before any provider process is spawned. It never reads shell startup scripts.

Runtime plugin code is never imported into main or the trusted renderer bundle. HOME widgets and canvas apps run in sandboxed iframes with an opaque origin. Separate plugin windows use a dedicated narrow preload which forwards the same message SDK through an IPC handler that verifies the actual `canvastty-plugin://<id>/<entry>` sender URL. Arbitrary native OS windows are not embedded.

Plugin music access is capability-based rather than generic filesystem access. Media scans return library IDs, relative paths, metadata, and `canvastty-media://` stream URLs; raw playlist text remains the only format-neutral file content exposed. A media URL is resolved only for the owning enabled plugin and only beneath a previously selected library root. Removing a plugin revokes its persisted folder grants.

The built-in browser is split across surfaces: `BrowserCard` renders tabs and navigation controls in the React scene, while `BrowserService` positions the active native view over the card's measured viewport. The view is hidden during semantic summary, HOME editing, and trusted modal surfaces. Agent browser-control tools are intentionally not part of this initial browser scaffold.

## Renderer boundaries

`App.tsx` is the orchestration boundary. It loads settings/sessions, subscribes to main-process events, and coordinates dialogs and persistence. Feature components do not call unrelated feature APIs.

```text
App
├── WorkspaceCanvas        camera, pan, zoom, spatial composition
│   ├── HomeZone           persisted resizable grid, visible boundary, and edit gestures
│   │   ├── homeModel      pure derivation of limit/active-session rows
│   │   └── HomeMediaWidget independent pick/replace/remove control
│   ├── TerminalCard       one live xterm view, selection, rename, drag, resize, and snap behavior
│   ├── PluginCanvasCard   sandboxed plugin app with canvas bounds and semantic summary
│   └── BrowserCard        trusted browser chrome and canvas geometry for the native WebContentsView
├── AgentLaunchDialog      fixed provider + folder + profile + launch
└── SettingsPanel          General, Appearance, Controls, and Plugins
    └── PluginSettingsSection install preview, permissions, registry, and contributions
```

Keep domain decisions in pure selectors such as `homeModel.ts`, orchestration in `App.tsx`, and rendering/local interaction in feature components. IPC calls belong in `App.tsx` or a feature that exclusively owns that capability.

## Session flow

1. Home requests a terminal or opens a provider-specific launch card.
2. `App` sends a typed `terminal:create` request.
3. `TerminalManager` validates the request, spawns the PTY, stores metadata and bounded scrollback, then emits lifecycle/data events.
4. `App` reconciles lifecycle snapshots by session ID.
5. `TerminalCard` subscribes to its PTY stream, sends PTY input/grid resize events, and commits typed canvas bounds after a drag or edge resize.

`SessionMetadata` owns both world-space position and card size. `App` reconciles those bounds, while `TerminalCard` may hold transient pointer-move geometry until pointer-up. The main process validates and clamps committed sizes before emitting a session snapshot. Camera wheel handling is limited to empty canvas; interactive surfaces keep their native scroll/input ownership.

A live `TerminalCard` owns one xterm instance for the lifetime of its session ID. Palette changes update `terminal.options.theme` in place; title and settings changes must never dispose the terminal or its renderer-side scrollback. Window titles are updated as session metadata through `terminal:rename`. PTY input and resize events that race with process exit are contained at the main-process boundary and never surface as uncaught Electron errors.

Application shortcuts are normalized in `SettingsStore`, matched in `App`, and rendered from the same persisted bindings in the canvas hint. `App` owns the selected session used by window actions such as rename; `TerminalCard` owns only the inline editor.

Session counters, progress bars, and statuses must always derive from actual `SessionSnapshot` values. The UI must not synthesize telemetry.

## Provider-limit flow

1. `App` requests a sanitized `LimitsSnapshot` at bootstrap and every 60 seconds.
2. `LimitsService` deduplicates refreshes and keeps a 60-second cache.
3. Codex is queried through `codex app-server` using `account/rateLimits/read`. Claude and Kimi use their read-only usage endpoints with the credentials already managed by each installed CLI. Responses are structurally validated and reduced to percentage, window, and reset time.
4. If a refresh fails after a successful read, the last valid snapshot is returned as stale. Missing or unsupported adapters return an explicit unavailable reason, never `0%`.
5. Claude's weekly window exists only for a Claude.ai subscription session. API Usage Billing is reported as `subscription-required`, not as a fake quota. CanvasTTY never parses provider TUI screens.

## Extension points

- Add a provider in `ProviderId`, `providers.ts`, `TerminalManager.resolveLaunch`, the official provider asset map, and an optional safe limit adapter.
- Add a persisted setting to `AppSettings`, defaults/normalization in `SettingsStore`, and the owning feature only. Settings owns user-facing canvas controls and shortcuts; camera math and snapping geometry remain pure renderer concerns.
- Add a canvas entity as a separate feature component with an explicit position and callbacks; keep camera ownership in `WorkspaceCanvas`.
- Publish a runtime extension with `canvastty.plugin.json` API v1 and static HTML/CSS/JS entries. Contribution kinds are `home-widget`, `canvas-app`, and `window`; capability access is restricted to declared permissions. See [Runtime plugins](plugins.md).

Every extension should pass `npm run typecheck`, `npm run build`, and a real Electron interaction check.
