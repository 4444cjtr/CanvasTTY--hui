# Changelog

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
