# ADR: Use Intent-Based Canvas Navigation with Mode-Based Wheel Capture

**Date:** 2026-08-07
**Scope / Component:** canvas input, widget ownership, native Browser IPC, plugin protocol, and input settings
**Risk/Strictness Profile:** Production
**Status:** Accepted
**Amended by:** [ADR: Make Native Browser Wheel Input Canvas-Owned](./ADR-20260808-native-browser-wheel-owned-by-canvas.md), [ADR: Use Focus-Aware Native Browser Wheel Ownership](./ADR-20260808-focus-aware-native-browser-wheel-ownership.md)
**Related:** [ADR: Use an Emulated Native Browser Wheel Sink](./ADR-20260808-emulated-native-browser-wheel-sink.md)
**Implementation:** `SettingsStore`, `CanvasNavigationInputController`, `WorkspaceCanvas`, plugin input bridge, and `BrowserService`

## 1. Context and Problem Statement

CanvasTTY historically interpreted every canvas-owned `wheel` event as zoom and ignored
`deltaX`. That behavior works for a conventional mouse-wheel zoom profile, but turns trackpad
two-finger scrolling into zoom and discards diagonal movement. Pinch also entered the same generic
wheel path without an explicit intent contract.

Neither DOM `WheelEvent` nor Electron `MouseWheelInputEvent` provides a reliable physical trackpad
identity. Delta precision, timing, and horizontal movement characterize an event stream, not its
source device. The design therefore has to classify observable user intent instead of guessing
whether the hardware is a mouse or trackpad.

The canvas contains independently interactive renderer widgets, xterm, sandboxed plugin frames,
and a native Browser in another `WebContents`. Only one focusable input surface should interrupt
canvas wheel navigation at a time; decorative and action-only widgets must not become implicit
wheel sinks. Users need one explicit Off/On/Key policy for overriding focused-widget wheel/pinch
ownership and a separate held full-navigation override for wheel/pinch plus drag. The full
override also needs a global hand cursor so the temporary ownership change is visible across DOM,
xterm, plugin, and native Browser surfaces.

New profiles need pan-first trackpad behavior. Existing profiles must retain their established
mouse-wheel zoom and over-widget wheel behavior after migration.

## 2. Options Considered

### Option A: Keep every canvas-owned wheel event as zoom

- **Description:** Continue ignoring `deltaX` and use every `deltaY` as camera zoom.
- **Pros:** No migration and no new input state.
- **Cons & Reason for Rejection:** Two-finger scrolling cannot pan, diagonal motion is lost, and
  pinch has no distinct intent contract.

### Option B: Detect mouse versus trackpad

- **Description:** Infer a physical device from fractional deltas, precision flags, frequency, or
  the presence of horizontal motion.
- **Pros:** Could appear to select a device-specific behavior automatically.
- **Cons & Reason for Rejection:** The observable fields are not a stable device identifier and
  also occur with Magic Mouse and high-resolution wheels. Misclassification would change behavior
  during a gesture and cannot be made portable across Chromium platforms.

### Option C: Keep permanent and held wheel capture as two settings

- **Description:** Expose an Always toggle and an independent temporary wheel/pinch shortcut.
- **Pros:** Maps directly to the two initial storage values and allows both mechanisms to be
  configured independently.
- **Cons & Reason for Rejection:** The two controls describe one ownership choice and can both be
  active, making precedence and the purpose of the temporary binding unclear. Off, On, and Key are
  mutually exclusive modes of the same wheel-only policy and should be presented as such.

### Option D: Classify intent, unify wheel capture as Off/On/Key, and retain a full override

- **Description:** Ordinary scroll pans by default, pinch and `Cmd/Ctrl + scroll` zoom, and a
  setting restores ordinary scroll-to-zoom. A separate logical input focus identifies the only
  widget that can interrupt canvas wheel navigation. Wheel/pinch capture over that widget uses one
  Off/On/Key mode, while a held full navigation override independently adds drag ownership.
- **Pros:** Gives new profiles trackpad-friendly navigation without device detection, preserves
  the historical mouse profile, and makes every ownership transition explicit.
- **Cons & Reason Not Rejected:** The input stack must coordinate renderer capture, plugin frames,
  and native Browser contents. This cost is necessary because those surfaces have real process and
  focus boundaries.

### Option E: Derive wheel ownership from selection or raw widget hit testing

- **Description:** Let every widget under the pointer interrupt canvas navigation, or use the
  current exclusive terminal/Browser selection as the wheel owner.
- **Pros:** Reuses existing hit-testing or selection state without another focus model.
- **Cons & Reason for Rejection:** Decorative widgets become wheel sinks under raw hit-testing,
  while selection does not cover plugin and HOME input surfaces and would couple wheel routing to
  the future multi-selection model. Input focus therefore remains a separate, single-valued state.

## 3. Decision Outcome

**Chosen Option:** Classify input intent, unify wheel capture as Off/On/Key, and retain a full
navigation override.

CanvasTTY does not identify a physical trackpad. It classifies canvas-owned wheel input from
modifiers and settings, and decides ownership before cancelling the original event.

### Settings and storage contract

`AppSettings` contains the semantic runtime values:

```ts
useScrollWheelToZoom: boolean;
canvasWheelCaptureMode: "off" | "always" | "key";
canvasWheelOverride: string | null;
canvasNavigationOverride: string | null;
```

- `useScrollWheelToZoom=false` means ordinary scroll pans. `true` selects historical ordinary
  wheel zoom with `invertCanvasWheel` and `zoomSensitivity`.
- `canvasWheelCaptureMode` is the wheel-only ownership policy over the focused input widget. `off`
  preserves focused-widget ownership, `always` transfers wheel/pinch unconditionally, and `key`
  transfers it while `canvasWheelOverride` is active. Unfocused and non-focusable widgets leave
  wheel/pinch with the canvas in every mode.
- `canvasWheelOverride` remains stored independently in every mode so Off/On -> Key restores the
  previous binding.
- `canvasNavigationOverride` controls temporary full navigation ownership. `null` means Disabled.

Fresh settings use:

```ts
useScrollWheelToZoom = false;
canvasWheelCaptureMode = "key";
canvasWheelOverride = "Meta"; // macOS; "Ctrl" on Windows/Linux
canvasNavigationOverride = "Alt";
```

The UI displays `Alt` as `Option` on macOS. Persisted bindings use platform-neutral canonical key
names.

An existing `settings.json` without `useScrollWheelToZoom` migrates to `true`. The legacy
`zoomOverApplications` key exists only at the `SettingsStore` storage boundary. Without a saved
mode, legacy `true` becomes `always`; legacy `false` plus a valid wheel binding becomes `key`;
legacy `false` without a binding becomes `off`. When the legacy key is absent, runtime uses the
current `key` default and the key remains absent in JSON. Explicitly changing the mode starts
compatible legacy writes: `always` writes `true`, while `off` and `key` write `false`. A malformed
or action-conflicting Key binding fails closed to `off` without changing action shortcuts. The
normalized result is written through a temporary file and atomic rename.

Action shortcuts are normalized before both overrides. A malformed binding or a binding chord
that reserves an action shortcut becomes `null`; existing action shortcuts are preserved.

### Override binding contract

Both overrides accept modifier-only and modifier-based chords, for example `Alt`, `Ctrl+Alt`, and
`Alt+Space`. A bare ordinary key is invalid. Additional held modifiers do not deactivate a match.
The two bindings may be identical; when both are active, full navigation ownership dominates.

Letters and digits use physical keyboard codes for matching, so a saved chord remains stable when
the active keyboard layout changes. In a modifier-plus-key chord, the ordinary key is reserved
only after the required modifiers are held; once reserved, it remains canvas-owned through keyup.

Both bindings accept the platform's explicit zoom modifier by itself: `Meta` on macOS and `Ctrl`
on Windows/Linux. A modifier-only binding does not reserve ordinary keyboard combinations such as
`Cmd+C` or `Ctrl+R`; only a chord with an ordinary key reserves that key and is checked against
action shortcuts. Identical wheel and full bindings are valid; the UI warns that full navigation
dominates because it also owns drag.

Each editor retains a modifier until `keyup`, saves a modifier-plus-key chord on the ordinary
key's `keydown`, and cancels capture on Escape. Main-process matching for both overrides is
suspended while either field is recording so an old binding cannot consume the replacement.

### Ownership matrix

| Location and condition | Input | Owner and result |
|---|---|---|
| Empty canvas | Primary-button drag | Canvas pans, independent of wheel settings |
| Empty canvas | Wheel/pinch | Canvas classifies pan or zoom |
| Non-focusable widget, any wheel mode | Wheel/pinch | Canvas classifies pan or zoom |
| Focusable but unfocused widget, any wheel mode | Wheel/pinch | Canvas classifies pan or zoom |
| Focused input widget, wheel mode Off | Wheel/pinch | Widget receives the original event |
| Focused input widget, wheel mode On | Wheel/pinch | Canvas classifies pan or zoom |
| Focused input widget, wheel mode Key, binding released | Wheel/pinch | Widget receives the original event |
| Focused input widget, wheel mode Key, binding held | Wheel/pinch | Canvas classifies pan or zoom |
| Any widget without full override | Click/drag | Widget receives the original event |
| Any widget, held full override | Wheel/pinch | Canvas classifies pan or zoom |
| Any widget, held full override | Primary-button drag | Canvas pans; widget does not click, select, or focus |

Ownership is decided synchronously. `preventDefault()` is called only after the canvas wins.
A pointer gesture that starts under the full override remains canvas-owned through
`pointerup`/`pointercancel`, even if the chord is released during the drag.

Logical input focus is independent from selection. Clicking a focusable input widget assigns it;
after the configured hover delay, hovering another focusable input widget transfers it. Pointer
leave cancels only a pending transfer and never clears assigned focus. Clicking a non-focusable
widget preserves the current focus; only a click outside every widget clears it. The focusable set
is opt-in: terminals, native Browser, plugin iframe/canvas surfaces, and actually scrollable HOME
lists. This contract leaves selection free to become multi-valued without changing wheel routing.

### Wheel intent classifier

All paths feed one normalized classifier:

1. `ctrlKey || metaKey` requests focal-point zoom using
   `clamp(exp(-deltaY / 100), 0.75, 1.25)`.
2. Otherwise, `useScrollWheelToZoom=true` requests historical focal-point wheel zoom with
   `invertCanvasWheel` and `zoomSensitivity`.
3. Otherwise, input pans in screen space:

   ```ts
   camera.x -= deltaX;
   camera.y -= deltaY;
   ```

For pan, `invertCanvasWheel` changes the sign of both axes. `Shift` does not remap axes. DOM line
deltas use `16` CSS pixels and page deltas use the current viewport size. Pan deltas are summed and
applied once per animation frame; no application inertia is added. Before zoom, pending pan is
flushed synchronously to preserve event order.

Modifier/pinch zoom intentionally ignores wheel inversion and sensitivity. Every zoom path remains
anchored at the event's client coordinates and uses the existing camera bounds.

### Global override and embedded surfaces

The main process observes `before-input-event` on the main renderer and each native Browser tab.
It tracks both configured chords, publishes their independent active states to the renderer, and
resets both on window blur, `WebContents` destruction, binding changes, or shortcut-editor
suspension. Modifier events remain observable so Electron delivers their keyup; menu shortcuts are
suppressed separately while a configured modifier is held.

Renderer DOM and xterm use the workspace's non-passive capture path. xterm's coordinate adapter
does not process wheel input already owned by the canvas.

Every internal plugin HTML response receives a host input bridge before plugin scripts execute.
For effective wheel capture (permanent, wheel-only, or full), that bridge synchronously cancels
iframe wheel and relays bounded, validated coordinates, deltas, delta mode, and modifiers. Iframe layout coordinates are converted
to the frame's transformed visual rectangle before focal zoom. Relay messages are accepted only
from the frame's `event.source` and the expected schema. The same bridge reports pointer focus and
hover-boundary messages without cancelling ordinary plugin clicks. During the full override,
plugin iframes use `pointer-events:none`, allowing workspace pointer capture to start without
focusing the plugin. Ordinary plugin clicks are unchanged outside the override.

While the full override is held, the workspace and all of its DOM descendants force `grab`; a
canvas-owned pointer gesture forces `grabbing` until pointer up/cancel. Wheel-only Key mode never
changes the cursor. Plugin iframes are hit-test transparent under the full override, so the
workspace cursor remains visible. Blur and shortcut capture cancel an owned gesture and reset the
cursor.

Native Browser ownership is decided in `BrowserService` before page delivery. Wheel capture occurs
when the Browser is not logically focused, for wheel mode On, an active Key binding, or an active
full override. Native pointer enter/leave/down messages feed the same delayed logical-focus state
as renderer widgets. Pointer
down/move/up/cancel is relayed only for the full override and bypasses normal Browser
focus/selection. Electron native wheel deltas and ticks are bounded and converted on both axes to
DOM right/down-positive convention before IPC.

Native Browser cursor state is inserted into tab content with user-origin `!important` CSS. A
generation token removes stale asynchronous insertions, the CSS is reapplied after navigation or
reload, and release, tab destruction, and service disposal remove it. During a Browser-owned
canvas drag, `grabbing` remains active even if the binding is released.

The Browser wheel payload is:

```ts
interface BrowserCanvasWheelEvent {
  tabId: string;
  clientX: number;
  clientY: number;
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  wheelOverrideActive: boolean;
  canvasOverrideActive: boolean;
}
```

## 4. Invariants / Constraints

1. Production code does not infer `isTrackpad`, `deviceId`, or an equivalent physical device label.
2. Blank-canvas drag always pans.
3. New profiles use scroll-to-pan; migrated profiles retain scroll-to-zoom.
4. `zoomOverApplications` exists only as a legacy storage key. Its explicit value migrates without
   inversion; an absent key stays absent and selects the current Key default.
5. Pinch and `Cmd/Ctrl + scroll` request focal-point zoom whenever the canvas owns the event.
6. Wheel modes On and active Key transfer only wheel/pinch. Full override transfers wheel/pinch and
   drag.
7. Only the logically focused focusable widget can interrupt canvas wheel/pinch without an
   override. Unfocused and non-focusable widgets never become wheel sinks.
8. Full override works while focus is in renderer DOM, xterm, a plugin frame, or native Browser.
9. An override drag cannot leak its initiating pointer event or focus to the underlying widget.
10. Pan preserves both axes and native momentum, uses screen-space pixels, and adds no inertia.
11. Ownership and cancellation are synchronous; camera rendering may be frame-coalesced.
12. Modifier/pinch zoom ignores inversion and sensitivity; historical wheel zoom preserves both.
13. `Shift` never invents an axis remap.
14. `hasPreciseScrollingDeltas` is not used as a device detector or classifier input.
15. Modifier-only bindings never suppress ordinary modified shortcuts; only chords containing an
   ordinary key participate in action-shortcut conflict checks.
16. Wheel-only capture never changes the cursor. Full navigation shows `grab`, and an owned pan
   shows latched `grabbing` across renderer, plugin, xterm, and native Browser surfaces.
17. Input focus and selection are independent. Hover transfers focus only after the configured
   delay, pointer leave never clears assigned focus, and only a click outside every widget clears
   it.
18. Focusability is opt-in for input-bearing surfaces; decorative and action-only widgets preserve
   the current focus.

## 5. Consequences and Mitigations

- **Positive:** Trackpad scroll pans on both axes and pinch zooms without heuristic device
  detection.
- **Positive:** Existing mouse users retain their saved wheel direction, sensitivity, ordinary
  scroll zoom, and over-widget wheel capture.
- **Positive:** One Off/On/Key control expresses the mutually exclusive wheel-only policies while
  the full override remains independently configurable.
- **Positive:** One logical input focus makes wheel routing deterministic without coupling it to a
  future single- or multi-selection model.
- **Negative / Risk:** New mouse-only profiles pan on ordinary wheel until the user enables wheel
  zoom. The Controls label makes this choice explicit.
- **Negative / Risk:** The ordinary key in a reserved override chord cannot reach the focused
  widget while held. Modifier-only bindings preserve ordinary keyboard shortcuts; the wheel mode
  can be Off and the full binding can be disabled.
- **Negative / Risk:** Forcing cursor CSS inside native Browser tabs introduces asynchronous
  lifecycle work across navigation and destruction. Generation checks and stale-key cleanup keep
  old insertions from winning.
- **Negative / Risk:** Plugin and native Browser boundaries require separate trusted bridges. Both
  validate payloads, bound deltas, and decide ownership before delivery.
- **Negative / Risk:** Hover can transfer ownership during a long-lived pointer stay. The existing
  configurable delay makes that transition deliberate; leaving does not introduce a second,
  surprise focus reset.
- **Negative / Risk:** Chromium-generated pinch and a physical `Ctrl + wheel` remain
  indistinguishable. They intentionally map to the same zoom intent.

## Decision Drivers / Forces

- Trackpad-friendly defaults for new profiles.
- No mouse regression for persisted profiles.
- Figma-like scroll pan and modifier/pinch zoom.
- Focused-input-widget interaction with explicit, independently configurable exceptions.
- One mutually exclusive wheel-capture mode instead of overlapping Always and temporary controls.
- One camera result for equivalent DOM, xterm, plugin, and native Browser input.
- No production dependency on undocumented device heuristics.

## Assumptions

- UI labels are `Off / On / Key`, while the persisted semantic value for On is `always`.
- Full navigation continues to default to Option/Alt; accepting Command/Ctrl changes validation,
  not the default.
- Identical wheel and full bindings are intentional and remain saveable with a warning.

## References

- [W3C UI Events: Wheel Events](https://w3c.github.io/uievents/split/wheel-events.html)
- [Chromium touchpad pinch event queue](https://chromium.googlesource.com/chromium/src.git/+/refs/heads/lkgr/components/input/touchpad_pinch_event_queue.cc)
- [Chromium native wheel builder](https://chromium.googlesource.com/chromium/chromium/+/6ed5b045181d7f288daf10a75d672a3cca282cd5/content/browser/renderer_host/input/web_input_event_builders_gtk.cc)
- [Electron MouseWheelInputEvent](https://www.electronjs.org/docs/latest/api/structures/mouse-wheel-input-event)
- [Figma: Pan and zoom in FigJam](https://help.figma.com/hc/en-us/articles/1500004414582-Pan-and-zoom-in-FigJam)
- [`WorkspaceCanvas.tsx`](../../src/renderer/src/features/workspace/WorkspaceCanvas.tsx)
- [`CanvasNavigationOverride.ts`](../../src/main/services/CanvasNavigationOverride.ts)
- [`BrowserService.ts`](../../src/main/services/BrowserService.ts)
- [`SettingsStore.ts`](../../src/main/services/SettingsStore.ts)

## Validation

Automated validation covers classifier order, both axes and delta modes, inversion, zoom clamp,
fresh defaults, every legacy migration branch, Off/On/Key transitions, both shortcut normalizers
and independent active states, focused/unfocused/non-focusable ownership, focus/selection
independence, hover transfer and leave behavior, xterm routing, plugin focus/wheel bridge
validation, Browser delta conversion, pointer gesture locking, and native cursor generation races.

Release validation additionally exercises macOS trackpad/mouse, Windows Precision Touchpad/mouse,
and Linux/libinput touchpad/mouse over empty canvas, xterm, plugin iframe, and native Browser. It
must include all three wheel modes, the default `Command` binding on macOS, the default `Ctrl`
binding on Windows/Linux, standalone Command/Ctrl full overrides, and extra-modifier chords.

The decision is falsified if a new profile zooms on ordinary scroll, a migrated profile silently
switches to pan, permanent capture steals widget pointer input, override drag leaks focus/clicks,
equivalent surface input changes the camera differently, or momentum is duplicated.

## Confidence & Reversibility

Confidence is high for the intent and ownership model because each boundary is explicit and
covered independently. The mode schema is reversible through `SettingsStore`; the compatibility
key keeps older readers meaningful. Native Browser cursor injection is isolated and removable, but
must be revalidated when Electron changes `insertCSS` lifecycle behavior.

## Follow-ups

No implementation follow-up is required by this decision. Auto mode and use of precise-delta
signals remain separate open research questions below.

## Open Questions Outside This Decision

- Whether a future best-effort Auto mode is useful after cross-platform measurement. Auto mode is
  not part of this decision.
- Whether `hasPreciseScrollingDeltas` could inform that future experiment. It is not used by the
  accepted classifier.

## Refresh 2026-08-08: Input Correctness Clarifications

The decision remains accepted. Native Browser wheel ownership is amended by the related ADR; the
settings, classifier, renderer/xterm/plugin focus matrix, and full-navigation override remain in
force.

The following constraints clarify the existing contracts after implementation review:

1. Legacy wheel-capture provenance is tri-state at the storage boundary. An absent
   `zoomOverApplications` key means the user never stored the legacy choice; it must remain absent
   and select the current Key default. Explicit `false` remains distinct. `SettingsStore` starts
   legacy-compatible writes only after reading the legacy key or receiving an explicit mode
   change, so a fresh profile does not materialize a historical value it never had.
2. Modifier-only `Meta`, `Ctrl`, and `Shift` bindings activate navigation without enabling
   Electron menu-shortcut suppression. This preserves ordinary application shortcuts such as
   `Cmd/Ctrl+C`, `Cmd/Ctrl+V`, and `Cmd+H` while the modifier is also available for wheel capture.
   Standalone `Alt` keeps menu-shortcut suppression because native menu handling can otherwise
   consume its transition or `keyup` and leave the held override stuck. A chord containing an
   ordinary key enables suppression after its required modifier prefix is held so that the chord
   key can be observed and reserved reliably.
3. Shortcut recording commits at most once per physical chord. Capturing ends and an in-flight
   guard is established synchronously before asynchronous settings persistence begins; a later
   modifier `keyup` therefore cannot replace `Alt+Space` with `Alt` or issue a second write.
4. Every pointer gesture started under the full-navigation override consumes its synthesized
   follow-up click, even when movement stays below the normal drag threshold. Full ownership means
   the underlying widget cannot focus, activate, close, or select from that gesture. Ordinary
   canvas drag keeps its existing movement-threshold behavior outside the override.
