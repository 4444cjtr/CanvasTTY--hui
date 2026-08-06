# Runtime plugins

[English](plugins.md) · [Русский](plugins.ru.md) · [简体中文](plugins.zh-CN.md) · [Docs home](README.md)

CanvasTTY runtime plugins are static web packages installed from an HTTPS GitHub repository. A plugin can contribute a HOME widget, a movable canvas app, a separate application window, or any combination of the three. Plugin HTML, CSS, and JavaScript run in an Electron sandbox without Node.js.

## Trust model

Installing a plugin is equivalent to allowing third-party browser code to run locally. CanvasTTY reduces that trust surface, but cannot make unknown code trustworthy:

- CanvasTTY downloads only the default-branch tar archive for a GitHub repository root URL and never runs `npm install`, build hooks, native modules, or repository scripts.
- The package must contain no symlinks and is limited to 500 files or directories / 25 MB. Individual served assets are limited to 8 MB.
- A plugin frame has an opaque sandbox origin, no access to the parent DOM, no `window.canvasTTY`, and no Node.js API.
- The separate-window preload exposes no Node primitives. It forwards the same SDK messages through an identity-checked IPC handler.
- Every privileged SDK method is gated by a manifest permission. Permissions are shown before the user confirms installation.
- Provider credentials, PTY buffers, working directories, raw provider responses, and filesystem access never cross the plugin boundary.
- Disabling or uninstalling a plugin immediately stops serving its assets and closes its separate windows.

CanvasTTY does not embed arbitrary native OS windows. A `window` contribution is a sandboxed CanvasTTY-owned `BrowserWindow`. Native reparenting is not portable or reliable across Wayland, macOS, Windows, DPI modes, popups, and GPU surfaces.

## Package layout

The repository root must contain `canvastty.plugin.json`. Entries are relative static HTML files; inline scripts are blocked by the plugin Content Security Policy.

```text
canvastty.plugin.json
shared/plugin.css
widgets/status.html
widgets/status.js
apps/notes.html
apps/notes.js
windows/focus.html
windows/focus.js
```

An end-to-end example lives in [`examples/plugins/studio-kit`](../examples/plugins/studio-kit).
Editor tooling can use the [manifest JSON Schema](canvastty-plugin.schema.json) and [SDK TypeScript declarations](plugin-api.d.ts).

## Manifest v1

```json
{
  "apiVersion": 1,
  "id": "com.example.studio-kit",
  "name": "Studio Kit",
  "version": "1.0.0",
  "description": "Small CanvasTTY surfaces backed by real host state.",
  "permissions": ["storage", "sessions:read", "launcher:open"],
  "contributions": [
    {
      "id": "session-status",
      "kind": "home-widget",
      "title": "Session status",
      "entry": "widgets/status.html",
      "defaultSize": { "columns": 4, "rows": 2 }
    },
    {
      "id": "notes",
      "kind": "canvas-app",
      "title": "Notes",
      "entry": "apps/notes.html",
      "defaultSize": { "width": 680, "height": 440 }
    },
    {
      "id": "focus",
      "kind": "window",
      "title": "Focus",
      "entry": "windows/focus.html",
      "defaultSize": { "width": 900, "height": 620 }
    }
  ]
}
```

Plugin and contribution IDs are stable persistence keys. Do not rename them after publishing. Plugin versions use semantic version text. HOME starts with a spacious 16 × 12 logical grid while preserving the original 12 × 8 composition. The editor can resize its visible boundary up to 48 × 36 without shrinking cell dimensions, and adding a widget grows the boundary automatically when needed. Canvas apps use world-space pixels and participate in the same snapping system as terminal cards.

## Permissions

| Permission | SDK capability | Data boundary |
|:--|:--|:--|
| `storage` | `storage.get`, `storage.set` | Isolated JSON storage, 64 KB per plugin |
| `sessions:read` | `sessions.list` | ID, provider, title, status, start time, exit code only |
| `limits:read` | `limits.get` | The same sanitized `LimitsSnapshot` used by HOME |
| `launcher:open` | `launcher.open` | Opens the built-in provider Focus Card or terminal action; it does not bypass user launch choices |
| `external:open` | `external.open` | Opens only an explicit HTTP(S) URL through the OS |
| `media:library` | `media.*` | User-selected music folders only; absolute paths are never exposed and audio is served through seekable `canvastty-media://` streams |
| `playlists:read` | `playlists.list`, `playlists.read` | Reads `.m3u`, `.m3u8`, and `.pls` in a granted music folder plus `.json` under its `Playlists/` directory, up to 4 MB each |
| `playlists:write` | `playlists.write` | Atomically writes a named playlist into the granted folder's `Playlists/` directory, up to 4 MB |
| `network` | browser `fetch` | Allows HTTPS and loopback requests in the plugin CSP; no CanvasTTY credentials are attached |

Declaring a permission does not expose a generic IPC channel. Unknown methods and permissions are rejected.

## SDK

Load the host SDK as an external script:

```html
<script src='canvastty-plugin://host/sdk.js'></script>
<script src='./index.js'></script>
```

The SDK creates `window.CanvasTTYPlugin`:

```js
const host = window.CanvasTTYPlugin;

host.onContext(({ appearance, contribution }) => {
  document.documentElement.dataset.palette = appearance.palette;
  document.title = contribution.title;
});

const sessions = await host.request("sessions.list");
await host.storage.set("draft", { text: "Local to this plugin" });
const draft = await host.storage.get("draft");
await host.request("launcher.open", { provider: "codex" });
await host.request("window.open", { contributionId: "focus" });

const library = await host.media.pickLibrary();
if (library) {
  const audio = document.querySelector("audio");
  const tracks = await host.media.scanLibrary(library.id);
  if (audio) audio.src = tracks[0]?.streamUrl ?? "";
  const playlists = await host.playlists.list(library.id);
  const text = playlists[0] ? await host.playlists.read(library.id, playlists[0].id) : "";
  await host.playlists.write(library.id, "favorites.m3u8", text || "#EXTM3U\n");
}
```

Supported methods are `host.getContext`, `storage.*`, `sessions.list`, `limits.get`, `launcher.open`, `external.open`, `window.open`, `media.*`, and `playlists.*`. `window.open` may target only a `window` contribution declared by the same plugin.

Music-library grants persist across restarts and can be listed or revoked by the owning plugin. Scans skip symlinks and return relative paths, metadata, and opaque stream URLs rather than the absolute library root. Uninstalling the plugin revokes all of its grants. Playlist contents are returned as authored and are intentionally format-neutral, so a player may use standard M3U/PLS or its own JSON schema; an imported playlist may itself contain absolute paths.

### Building a full player plugin

A local-library player normally declares:

```json
"permissions": ["storage", "media:library", "playlists:read", "playlists:write"]
```

Add `network` only for remote catalogs, radio, artwork, or streams, and `external:open` only for explicit links opened in the system browser. `storage` is intended for player preferences, favorites, queue state, and other small JSON metadata; audio files remain in user-selected folders.

| SDK call | Result and intended use |
|:--|:--|
| `host.media.pickLibrary()` | Opens the native directory picker and persists the grant; returns `{ id, name }` or `null` when cancelled |
| `host.media.listLibraries()` | Restores this plugin's granted libraries after a restart without exposing absolute paths |
| `host.media.scanLibrary(libraryId)` | Recursively returns up to 20,000 supported tracks with `id`, display name, relative path, size, MIME type, and `streamUrl` |
| `host.media.revokeLibrary(libraryId)` | Removes this plugin's grant for the selected folder |
| `host.playlists.list(libraryId)` | Lists up to 2,000 readable playlist files in the granted library |
| `host.playlists.read(libraryId, playlistId)` | Returns the original UTF-8 playlist text, up to 4 MB |
| `host.playlists.write(libraryId, name, content)` | Atomically writes `.m3u`, `.m3u8`, `.pls`, or `.json` under the library's `Playlists/` directory, up to 4 MB |

Scanned audio extensions are `.aac`, `.flac`, `.m4a`, `.mp3`, `.oga`, `.ogg`, `.opus`, `.wav`, and `.webm`. Assign `track.streamUrl` directly to an `<audio>` element; the host supports byte-range responses so duration probing and seeking work. A plugin with `media:library` may also `fetch(track.streamUrl)` when it needs the bytes for browser-side metadata parsing. The complete method overloads and result interfaces are in [`plugin-api.d.ts`](plugin-api.d.ts).

Recommended startup flow: call `listLibraries()`, ask for a folder with `pickLibrary()` only when none is granted, scan the chosen library, restore queue/preferences from `storage`, then list and parse playlists. Treat revoked or moved folders as an explicit unavailable state and let the user choose them again.

Context updates include the active CanvasTTY locale and palette. Plugins own their internal localization and styling; they should remain legible at the contribution's intended size and should not invent loading progress, sessions, status, limits, or telemetry.

## Install and manage

1. Publish the static package at the root of a public GitHub repository.
2. Open **Settings → Plugins**.
3. Paste `https://github.com/owner/repository` and choose **Inspect**.
4. Review the manifest and requested permissions, then confirm **Install**.
5. Enable/disable or uninstall the package from the same section. HOME widgets can be added or removed there.
6. Open **Settings → Appearance → HOME composition**, then choose **Edit HOME** to drag tiles, resize them, or pull the bottom-right HOME boundary. The Settings tile is retained as the recovery entry point; all other core and plugin tiles are optional.

The current installer intentionally rejects private repositories, GitHub `/tree/branch/subdirectory` links, and repositories that require a build step. Publish a ready-to-run static package at the repository root.

## Author checklist

- Use only structured host data and explicit loading/unavailable/error states.
- Request the smallest permission set.
- Keep all scripts external; do not depend on inline script execution.
- Do not expect Node.js, filesystem paths, PTY history, provider tokens, or parent DOM access.
- Test the HOME widget at its smallest declared grid size and during canvas zoom.
- Test canvas apps in semantic summary mode below `0.5×`.
- Test the same SDK calls in both embedded and separate-window contributions.
- Run CanvasTTY's `npm test`, `npm run typecheck`, and `npm run build` when contributing an example or host change.
