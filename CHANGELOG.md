# Changelog

[English](CHANGELOG.md) · [Русский](CHANGELOG.ru.md) · [简体中文](CHANGELOG.zh-CN.md)

## 1.0.2

- Exposed the built-in browser from HOME as a movable, resizable canvas application with trusted tabs/navigation, downloads, site dialogs, safe tab restore, browser-data clearing, semantic summaries, and stable native-view geometry during camera/card motion.
- Added scoped browser automation for CanvasTTY-launched Claude Code, Codex, and Kimi sessions through a bundled stdio MCP helper and authenticated current-user Unix socket or protected Windows named pipe; no TCP listener, remote-debugging port, arbitrary JavaScript, cookie/storage API, or raw CDP surface is exposed.
- Added connected-agent badges/cursors, per-agent activity isolation, revision-bound element refs, per-tab FIFO mutations, request deduplication, bounded concurrency/rate limits/timeouts, dialog/download handling, and redacted screenshots that fail closed when sensitive regions cannot be resolved.
- Added a persistent redacted browser audit hash chain below Electron `userData/browser/audit`, 100 MB rotation, 30-day rotated-file retention, integrity checks, and fail-closed agent mutations when the required pre-action audit cannot be written.
- Integrated browser cards with terminal-equivalent canvas selection, click/hover focus, empty-canvas clearing, window actions, wheel zoom over applications, and a stable renderer surface while the native view is repositioned.
- Hardened the Windows agent transport with a bundled native named-pipe host restricted to the exact current-user SID and added real Electron/provider smoke coverage across the release pipeline.
- Fixed the repository secret audit for linked Git worktrees by ignoring repository metadata entry names before file-type inspection while preserving personal-path detection in publishable files.
- Synchronized browser, security, local-data, audit-log, and release documentation in English, Russian, and Simplified Chinese.

Known issue: if the main CanvasTTY window did not start maximized, opening Browser can make the native browser view cover the window and leave the canvas controls unusable. For this prerelease, start CanvasTTY maximized before opening Browser; a fix is planned for the next patch.

## 1.0.1

- Added `Shift+Enter` terminal line breaks without submitting the current prompt.
- Fixed terminal selection and keyboard focus: selecting a live card routes typing into xterm, while pressing empty canvas clears the selection and focus outline.
- Added optional focus-on-hover with slow (`500ms`), normal (`250ms`), and fast (`80ms`) enter/leave delays. Programmatic hover focus no longer forwards focus-report sequences into agent TUIs or jumps their history.
- Added independent terminal-scroll and canvas-zoom wheel direction settings. Terminal scrolling defaults to wheel-down moving down; canvas zoom retains its previous direction.
- Batched PTY output into 16ms renderer updates and replaced repeated scrollback string copies with a bounded chunk buffer, eliminating high-volume terminal flicker and reducing history resets under large output bursts.
- Made settings, plugin-registry, and media-grant write queues recover after transient filesystem errors, and aligned provider-client metadata with the packaged app version.
- Added complete Simplified Chinese runtime-plugin documentation, synchronized terminal-control guidance across English, Russian, and Chinese, and documented local plugin/media/browser data.
- Added the MIT License and localized security, changelog, architecture, and UI-contract documents.

## 1.0.0

- Added a lightweight local startup page that appears before settings, plugins, media, and IPC services initialize; bootstrap failures now surface as a visible error page with a native-dialog fallback instead of a blank window.
- Added Electron single-instance lock: a second launch restores and focuses the existing window.
- Remapped terminal pointer coordinates from the canvas's CSS-transformed rectangle back to xterm layout coordinates, so text selection, mouse reporting (vim, tmux), and wheel scrolling work at any canvas zoom.
- Reworked terminal clipboard shortcuts: copy with `Ctrl+C` (with selection), `Ctrl+Shift+C`, or `Cmd+C`; paste with `Ctrl+Shift+V`, `Cmd+V`, or `Shift+Insert` through `Terminal.paste`; shortcuts now match physical keys and work on non-Latin keyboard layouts.
- Added a packaged-app smoke harness (`CANVASTTY_SMOKE_TEST=1` prints `CANVASTTY_SMOKE_READY` after first paint) and wired it into the Linux release pipeline under `xvfb-run` with FUSE2.

## 0.9.99 — public preview

- Added a permissioned runtime plugin registry for ready-to-run static GitHub repositories.
- Added manifest v1 contributions for sandboxed HOME widgets, movable canvas apps, and separate CanvasTTY-owned windows.
- Added plugin preview/permission review, enable/disable/uninstall controls, isolated storage, CSP-constrained assets, and a shared host SDK.
- Added persistent user-granted music libraries, seekable local audio streams, and bounded playlist read/write APIs for full player plugins.
- Added a sandboxed built-in browser core scaffold with tabs, navigation, a persistent isolated profile, and canvas-card geometry; it is intentionally not exposed from HOME yet.
- Replaced the fixed HOME composition with a spacious persisted 16 × 12 layout and visual drag/resize editor while preserving the approved default arrangement.
- Added any-edge window and HOME-widget resizing, visible edit-only HOME boundaries, out-of-bounds draft placement, save validation, and edit-mode isolation from other canvas windows.
- Added runtime-plugin architecture/authoring documentation and a complete Studio Kit example package.

## 0.9.2 — public preview

- Made provider CLI discovery cross-platform: per-user CLI directories are now resolved on both Linux and Windows, so AppImage and Windows launches find existing `codex`, `claude`, and `kimi` installs.

## 0.9.1 — public preview

- Restored provider CLI discovery for graphical AppImage launches by supplementing the desktop-session `PATH` with existing per-user CLI directories, including Kimi's `~/.kimi-code/bin`.
- Prevented late terminal input and resize events from crashing the Electron main process when they race with PTY exit (`EBADFD`).

## 0.9.0 — public preview

- Fixed the main window never appearing when the renderer paints before `loadURL` resolves; the `ready-to-show` listener is now attached before loading.
- Added RTS-style edge panning (off by default; enable in Settings): the camera drifts while the pointer rests near a viewport edge over empty canvas and pauses over interactive surfaces.
- Added Settings controls for edge panning (toggle and speed) and wheel zoom sensitivity.
- Reorganized Settings into General, Appearance, and Controls sections.
- Added explicit Off, Single click, and Double click modes for terminal focus/zoom; automatic click focus is off by default.
- Added remappable application shortcuts with `Home` for the Home zone and `F2` for inline terminal-window rename, plus an optional live shortcut hint.
- Preserved PTY state and scrollback while changing palettes, patterns, settings, and custom window titles.
- Improved terminal clipboard shortcuts, edge resizing, semantic-zoom interaction, and multilingual documentation.

## 0.8.2 — public preview

- Publish only end-user installers from release jobs, excluding unpacked build directories.
- Give Windows NSIS and portable executables distinct artifact names.

## 0.8.1 — public preview

- Made repository and documentation security checks portable across LF/CRLF checkouts and Windows drive paths.
- No application behavior changed from the `0.8.0` preview candidate.

## 0.8.0 — public preview

- Spatial canvas for live local PTY and AI-agent CLI sessions.
- Fixed Home zone with launchers, sessions, clock, media, and source-backed provider limits.
- Movable, resizable, snapping terminal cards with semantic zoom navigation.
- Electron process isolation with typed, allow-listed IPC and local-only settings.
- Multilingual repository entry points and documentation in English, Russian, and Simplified Chinese.
- Reproducible Linux, Windows, and macOS packaging through GitHub Actions.
- Repository secret audit and strict package-content allowlist.

Known preview constraints: runtime widget plugins are not implemented; Windows and macOS behavior still needs broader real-device validation; release packages are not code-signed or notarized.
