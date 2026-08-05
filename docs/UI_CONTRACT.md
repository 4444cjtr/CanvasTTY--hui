# UI contract

This contract preserves the approved MVP concept and prevents feature ownership from drifting.

## Home zone

- Logical size: `1180 × 700`; three rows: status, clock/media, launcher.
- The wide left tile contains exactly Codex, Claude, and Kimi limit rows. Each row prefers the provider's longest real default quota window (the weekly window when exposed), and falls back to another real window only when needed. It shows the countdown to that window's `resetsAt` and the matching usage rail. Values below one day use `HH:MM`; longer values use `Nд HHч`/`Nd HHh`. Window length stays in accessible metadata; unavailable data is labeled and has no fake reset or percentage.
- The right tile is the only session list. Its viewport shows three rows and scrolls when more real sessions exist; it never discards rows. Each row shows provider mark, localized semantic state, and identity. Session duration and limit-style progress rails never appear here.
- The clock is the dominant middle tile and renders only `HH:MM`. The adjacent media tile is an autonomous widget: click to pick or replace an image/GIF; remove from the widget itself.
- The bottom dock contains Terminal, Codex, Claude, and Kimi. Settings is a separate tile.

## Launch and settings

- Clicking a provider opens a Focus Card for that provider. The provider is fixed; there is no second provider selector.
- The Focus Card contains only the provider mark, project folder, Normal/YOLO profile, launch action, and contextual danger confirmation.
- Settings uses a top section strip: General, Appearance, and Controls. General owns language. Appearance owns palette, background pattern, and the shortcut-hint toggle. Controls owns click focus, window snapping, edge panning, zoom sensitivity, and keyboard shortcuts. Media controls never appear there.
- Click focus has three explicit modes: Off, Single click, and Double click. It is off by default. Selection and its visible outline still work when camera focus is off; a double-click mode never jumps the camera on the first click.
- Keyboard shortcuts are user-remappable and persisted locally. Defaults are `Home` for focusing the Home zone and `F2` for renaming the selected terminal window. Rename is an inline header edit and does not recreate the PTY. A compact passive hint in the canvas bottom-right reflects the persisted bindings immediately and can be hidden from Appearance.
- Snapping is enabled by default and can be disabled without changing existing window bounds. Edge panning remains off by default and exposes slow/normal/fast speed.
## Visual system

- Flat, large, pastel tiles; strong dark/light contrast; restrained shadows; no ornamental micro-controls or explanatory microcopy around self-evident controls.
- Home renders at `1:1` whenever `1180 × 700` fits. Auto-fit uses discrete scale steps and integer camera coordinates so borders and dock spacing stay optically even.
- System actions use locally vendored SVGs from the official Lucide repository. Do not hand-draw system icons in TSX and do not add an icon runtime package.
- Provider marks use unmodified vendor assets. Do not redraw, recolor, filter, or approximate them. Kimi's raster mark must not render above its native `48px` size.
- Dots and grid are CSS patterns. Waves use the seamless SVG tile in `assets/patterns/waves.svg`; do not emulate waves with radial gradients.
- Terminal cards keep a `54px` header. At normal scale the header shows the provider mark and terminal working directory until the user explicitly renames the window; a custom title then replaces the path. Close is the only window action and stays visible at the far right; canvas cards do not expose maximize/fullscreen. There is no lifecycle dot in terminal chrome.
- Terminal cards switch to semantic summary mode below `0.5×`. Summary typography counter-scales as the camera moves farther out so identical cards keep the same readable hierarchy instead of exposing tiny xterm text.
- In semantic summary mode a card is a canvas navigation target: wheel input zooms the camera around it, and clicking the summary always selects it with a visible card outline. Camera focus follows only the configured Off/Single click/Double click mode. At normal scale the live terminal regains wheel ownership.
- Every terminal edge and corner is a resize target. The minimum card size is `420 × 260`; resizing updates the xterm viewport and preserves the opposite edge.
- With window snapping enabled, drag and resize use a hidden `10px` grid and a `10px` magnetic threshold for neighboring edges, centers, and a consistent `20px` gap.
- Wheel input belongs to the surface under the pointer when that surface actually scrolls or consumes wheel input. The session list and terminal/card surfaces never zoom the camera. Passive Home widgets — limits, clock, media, and launcher tiles — still allow camera zoom so Home does not shrink the usable zoom area.
- The canvas edge-pans RTS-style while the pointer rests within `56px` of a viewport edge over empty canvas; speed ramps linearly up to `900px/s` at the edge itself. Edge panning is off by default and enabled in Settings. Motion pauses over interactive surfaces (terminal cards, Home, controls) and while drag-panning.
- Dialog close actions stay inside their own header/control row with a consistent inset; they never overlap a field, outline, or panel boundary.

## Acceptance checks

- No custom `<svg>` or `<path>` elements in React TSX.
- No media picker or media-fit selector in Settings.
- No provider picker inside `AgentLaunchDialog`.
- No maximize/fullscreen action inside a canvas card.
- No fake counts, percentages, reset timers, determinate progress, or placeholder sessions.
- A newly opened PTY starts as `idle`. Only a structured provider lifecycle signal may mark it `working` or `needs_approval`; PTY existence and terminal text are not activity signals.
- `needs_approval` is displayed only after a structured provider-adapter signal; terminal output is never parsed to invent it.
- Home, Focus Card, Settings, and at least one live terminal are inspected in the real Electron window after build.
