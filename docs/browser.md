# Built-in browser and audit log

[English](browser.md) · [Русский](browser.ru.md) · [简体中文](browser.zh-CN.md) · [Docs home](README.md)

CanvasTTY `1.0.2` exposes its built-in browser from HOME as a trusted canvas application. It uses sandboxed Electron `WebContentsView` tabs and one persistent Chromium profile; it is not a runtime-plugin capability.

> **Known issue in 1.0.2:** if the main CanvasTTY window did not start maximized, opening Browser can make the native view cover the window and leave the canvas controls unusable. For this prerelease, start CanvasTTY maximized before opening Browser. A geometry fix is planned for the next patch.

## Open and use the browser

1. Open **Browser** on HOME. CanvasTTY creates or restores the browser card on the canvas.
2. Use the trusted tab bar and address field for HTTP(S) navigation or search. Back, forward, reload, new-tab, close-tab, and close-all controls stay outside the remote page.
3. Move or resize the card like a terminal. Zooming out replaces the native page with a stable semantic summary; moving the camera/card also hides the native view until its geometry settles.
4. Select the browser with the configured single/double-click mode. **Settings → Controls → Focus on hover** applies the same delay to terminals and the browser. Clicking empty canvas clears the active application.
5. The downloads panel shows recent progress. JavaScript alert/confirm/prompt dialogs are suspended until the trusted CanvasTTY dialog answers them.

Hiding the browser card does not close its tabs. **Close all** removes the tabs after confirmation. **Settings → Browser → Restore tabs** controls whether safe URLs return after restart.

## Browser settings

| Setting | Behavior |
|:--|:--|
| **Agent access** | Allows CanvasTTY-launched Claude Code, Codex, and Kimi sessions to use the typed browser tool surface; enabled by default |
| **Restore tabs** | Persists tab order, active tab, and safe restore URLs; enabled by default |
| **Downloads** | Shows up to six recent downloads and their local progress/status |
| **Browser activity** | Shows the ten most recent in-memory human/agent command results; the runtime buffer is capped at 1,000 events and resets when the app restarts |
| **Clear browser data** | Closes tabs and removes the restored-tab state, site storage, cache, HTTP auth cache, staged uploads, and the current download list |

Clearing browser data does **not** delete the persistent audit log described below.

## Agent access

Only agent sessions launched by CanvasTTY receive a per-launch browser connection. The main process creates a one-use capability and passes it through the child environment to a bundled stdio MCP helper. Linux/macOS use a current-user Unix socket; Windows uses a bundled native named-pipe host with a DACL for the exact current-user SID.

The tool surface covers tabs, navigation, observation/read, screenshot, click/hover/type/select/press, scroll/drag, waits, dialogs, downloads, and the calling agent's activity. It does not expose cookies, saved passwords, authorization headers, local/session storage, arbitrary JavaScript, filesystem or shell access, raw CDP, a TCP listener, or a remote-debugging port.

Agent mutations are ordered FIFO per tab, deduplicated by request ID, revision-checked before side effects, rate-limited, bounded by timeouts, and blocked when their required audit attempt cannot be written. Reads can run concurrently; different tabs keep independent mutation lanes.

## Website and file boundaries

- Remote pages run sandboxed with context isolation and no Node.js or CanvasTTY preload.
- Top-level navigation is limited to canonical HTTP(S) URLs. HTTP(S) popups become internal tabs; privileged/external schemes are rejected.
- Hardware, geolocation, notifications, clipboard read, insecure certificate bypass, webviews, client certificates, and HTTP-auth prompts are denied.
- Downloads go to a CanvasTTY-managed directory below the user's Downloads folder. Uploads must pass path, file-count, and total-size checks and are copied through a no-follow descriptor into private staging before Chromium receives them.
- Website data can still leave the computer through the website itself. CanvasTTY's local-only boundary is not a privacy promise made on behalf of visited sites.

## Activity feed and persistent audit log

The Settings activity feed is a short-lived operational view. Separately, the main process appends JSONL audit records to:

```text
<Electron userData>/browser/audit/browser-audit.jsonl
```

The active file is created with mode `0600`. Records include actor/provider/session identifiers, operation, attempt/result phase, tab ID, origin without query or fragment, document revisions, duration, outcome/error code, and hashes linking the chain. The log deliberately redacts typed values, page text, screenshots/base64, credentials, authorization/cookie fields, passwords, secrets, tokens, and API keys.

The active file rotates at 100 MB. Rotated files remain chained; files older than 30 days are pruned when the store initializes or rotates. Existing files are verified when the store opens, and an invalid chain makes subsequent appends fail. If an agent mutation's pre-action record cannot be stored, the agent receives `AUDIT_UNAVAILABLE` and the mutation side effect is not executed.

There is no remote log collector or CanvasTTY-operated telemetry endpoint. The **Clear browser data** button leaves audit evidence intact. To remove it manually, fully quit CanvasTTY first and delete the whole `userData/browser/audit` directory, understanding that this permanently discards the local audit history.

For implementation ownership, read [Architecture](ARCHITECTURE.md). For canvas and interaction invariants, read the [UI contract](UI_CONTRACT.md). For installation paths and other local data, read [Installing, releases, and local data](installing-and-security.md).
