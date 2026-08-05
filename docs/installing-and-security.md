# Installing, releases, and local data

[English](installing-and-security.md) · [Русский](installing-and-security.ru.md) · [简体中文](installing-and-security.zh-CN.md) · [Docs home](README.md)

## User-facing packages

Each `v*` tag starts native GitHub-hosted builds for all three operating systems:

| Platform | Artifacts | Notes |
|:--|:--|:--|
| Linux x86_64 | AppImage, deb | AppImage runs without installation; deb integrates with Debian-family desktops |
| Windows x64 | NSIS installer, portable executable | The installer allows choosing a directory and creates Start Menu/Desktop shortcuts |
| macOS arm64 (Apple Silicon) | dmg, zip | Both contain the graphical `.app` bundle; `0.9.99` does not include an Intel/x64 build |

Download artifacts only from the repository's [GitHub Releases](https://github.com/howdeploy/CanvasTTY/releases) page. The `0.9.x` line is a public preview and currently has no commercial code-signing certificates or Apple notarization. Windows SmartScreen and macOS Gatekeeper may therefore warn about an unknown developer. Verify the release tag and artifact name before acknowledging any warning.

## What the distributable contains

`electron-builder.yml` uses an explicit allowlist: production bundles under `out/`, `package.json`, and required production dependencies. Source docs, `.env`, local agent/planning folders, logs, settings, credentials, and release workspace files are not copied into the packaged application.

`node-pty` is rebuilt on the matching GitHub runner, so Linux, Windows, and macOS packages receive a native module for their own operating system. A package from one OS is never relabeled as another OS build.

## Local-only user data

| Data | Location and lifetime |
|:--|:--|
| CanvasTTY settings | Electron's per-user `userData` directory (`~/.config/canvastty` on typical Linux desktops, `%APPDATA%\canvastty` on Windows, `~/Library/Application Support/canvastty` on macOS) |
| Provider credentials | The local credential store owned by the installed Codex, Claude, or Kimi CLI; CanvasTTY does not copy it |
| PTY scrollback | Bounded main-process memory for the live app session; not saved in the repository |
| Home media | The user's original local file; settings retain only its local path |
| Logs | Local stdout/stderr only; CanvasTTY has no remote log collector or project-operated telemetry endpoint |

Exact `userData` paths may vary with OS configuration. CanvasTTY asks Electron for the correct per-user directory and never uses the source checkout as runtime storage.

## Credential boundary

Provider credentials are read only in the trusted main process when a source-backed quota request needs them. They are sent only to that provider's matching endpoint, are not logged, are not persisted by CanvasTTY, and never cross the typed preload bridge. Kimi's loopback usage token remains in process memory and its child stderr is discarded.

Sanitized percentages, window metadata, timestamps, and explicit unavailable reasons may cross IPC. Raw provider responses, bearer headers, cookies, and credential files may not.

## Repository guards

```bash
npm run audit:secrets
npm test
```

The audit checks high-confidence provider/cloud token formats, private-key blocks, hard-coded secret assignments, sensitive filenames, and personal absolute home paths. `.gitignore` excludes local agent context, planning data, env files, credentials, logs, settings, dependencies, and generated packages. CI runs the audit before build and every release job runs it again before packaging.

No scanner is perfect. Never commit a live secret “temporarily.” If one reaches Git history, revoke it first, then purge the history before making the repository public.

## Build packages locally

```bash
npm install
npm run package
```

`npm run package` creates an unpacked app for the current OS. Platform scripts create installers:

```bash
npm run package:linux
npm run package:win
npm run package:mac
```

Run each platform script on its matching operating system. Cross-compilation is not treated as proof of compatibility because `node-pty` is native.

## Release checklist

1. Confirm `package.json` and the tag use the same semantic version.
2. Run secret audit, tests, typecheck, production build, and a current-OS package build.
3. Inspect the real packaged app and verify the package-content allowlist.
4. Push `vX.Y.Z`; wait for all three GitHub Actions package jobs.
5. Treat the automatically created release as a prerelease until real-device checks pass on Linux, Windows, and macOS.

Security reports follow the repository [security policy](../SECURITY.md).
