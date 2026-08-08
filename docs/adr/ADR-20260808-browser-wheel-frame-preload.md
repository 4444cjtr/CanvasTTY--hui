# ADR: Intercept Native Browser Wheel in a Frame Preload

**Date:** 2026-08-08
**Scope / Component:** native Browser input ownership and canvas wheel relay
**Risk/Strictness Profile:** Production
**Status:** Superseded
**Superseded by:** [ADR: Use Focus-Aware Native Browser Wheel Ownership](./ADR-20260808-focus-aware-native-browser-wheel-ownership.md)
**Amended by:** [ADR: Freeze Native Browser During Cross-Surface Wheel Gestures](./ADR-20260808-freeze-native-browser-during-cross-surface-wheel.md)
**Supersedes:** [ADR: Make Native Browser Wheel Input Canvas-Owned](./ADR-20260808-native-browser-wheel-owned-by-canvas.md)
**Amends:** [ADR: Use Intent-Based Canvas Navigation with Mode-Based Wheel Capture](./ADR-20260807-intent-based-canvas-wheel-navigation.md)
**Implementation:** [`browser` preload](../../src/preload/browser.ts), [`BrowserService`](../../src/main/services/BrowserService.ts), and [`BrowserCanvasWheel`](../../src/main/services/browser/BrowserCanvasWheel.ts)

## 1. Context and Problem Statement

CanvasTTY decided that wheel-class input over the built-in native Browser always belongs to the
canvas, independently of Browser focus and the renderer-widget Off/On/Key capture mode. The first
implementation attempted to enforce this at Electron's `before-mouse-event` boundary: detect
`mouseWheel`, call `preventDefault()`, convert native deltas, and relay them to the canvas.

Manual trackpad testing falsified the mechanism. When the Browser was not logically focused and
the pointer was over page content, Chromium still scrolled the page. Electron 43.2.0 documents
`before-mouse-event` as cancellable, but its own tests cover cancellation for mouse down, up, and
move rather than wheel. Electron source also exposes `input-event` only as a notification; its
emission result is not used to cancel delivery. A trackpad gesture can therefore reach Chromium's
renderer/compositor path without the page-scroll guarantee assumed by the superseded ADR.

The ownership policy remains unchanged. The decision here is which input boundary can both cancel
the page's wheel synchronously and provide one validated relay to the canvas across top-level and
iframe content.

## 2. Options Considered

### Option A: Keep `before-mouse-event` as the cancellation and relay boundary

- **Description:** Continue cancelling native `mouseWheel` in `BrowserService` and relaying
  Electron deltas to the canvas.
- **Pros:** All ownership logic remains in the trusted main process and uses no page preload.
- **Cons & Reason for Rejection:** The observed macOS trackpad path still scrolls unfocused page
  content. Existing source-level tests only verified handler ordering and could not prove that
  Chromium's page scroll was cancelled.

### Option B: Cancel gesture events through `webContents` `input-event`

- **Description:** Observe `gestureScroll*` and `gesturePinch*` input in the main process and call
  `preventDefault()` there.
- **Pros:** It exposes event types closer to native trackpad gestures.
- **Cons & Reason for Rejection:** Electron 43.2.0 emits `input-event` as a notification and does
  not use the listener result as a cancellation decision. It cannot establish the required
  fail-closed page ownership.

### Option C: Cancel in a frame preload but keep the native relay

- **Description:** Install a non-passive capture `wheel` listener in every page frame only to
  cancel page delivery, while retaining `before-mouse-event` for canvas relay.
- **Pros:** Keeps delta conversion in the existing native helper and adds a renderer-side
  cancellation backstop.
- **Cons & Reason for Rejection:** The same physical input can appear in both channels and move the
  canvas twice. Conversely, a trackpad path absent from `before-mouse-event` would be cancelled but
  never move or zoom the canvas.

### Option D: Cancel and relay once from a session frame preload

- **Description:** Register a sandbox-compatible preload with `type: "frame"`. Its capture-phase,
  non-passive `wheel` listener cancels trusted events before page handlers and relays DOM-convention
  deltas and modifiers through a Browser-only IPC channel. Main validates the active visible tab,
  payload, delta mode, viewport scale, and bounds before forwarding the existing
  `BrowserCanvasWheelEvent` to the canvas.
- **Pros:** Cancellation and relay originate from the same observed event; top-level and iframe
  content have identical ownership; the canvas receives exactly one DOM-convention event.
- **Cons:** A preload now participates in every Browser frame, and its IPC channel identifier must
  remain synchronized with the main-process contract.
- **Decision:** Selected.

### Option E: Keep the current behavior

- **Description:** Accept that an unfocused native Browser can scroll under the pointer.
- **Pros:** No additional input bridge.
- **Cons & Reason for Rejection:** It directly violates the accepted Browser ownership policy and
  makes canvas navigation depend on where Chromium routes a physical trackpad gesture.

## 3. Decision Outcome

**Chosen Option:** Cancel and relay once from a session frame preload.

The Browser session registers `out/preload/browser.cjs` as a `frame` preload before any Browser tab
loads. The preload installs one `{ capture: true, passive: false }` listener. For trusted wheel
input it calls `preventDefault()` and `stopImmediatePropagation()` before sending the payload. It
does not handle synthetic page-generated wheel events.

The preload is deliberately self-contained apart from Electron. A sandboxed registered preload
must not depend on a Rollup shared chunk: runtime smoke testing proved that the split preload did
not install its listener and allowed page `scrollY` to change. The Browser-only channel string is
therefore local to the self-contained entry while the matching channel remains declared in the
shared IPC registry.

`BrowserService.handlePageWheel` accepts `unknown`, requires the sender to be the active visible
Browser tab, validates all numeric and boolean fields, converts line deltas by 16 CSS pixels and
page deltas by the sending frame viewport, clamps both axes, and rejects malformed or zero input.
The focal coordinates come from Electron's current screen pointer relative to the owner window,
not from coordinates supplied by page content. The native `before-mouse-event` handler remains the
pointer and full-navigation-drag boundary but no longer relays wheel, preventing duplicates.

## 4. Invariants / Constraints

1. A trusted wheel event over any frame of the active visible native Browser is cancelled before
   page handlers and never changes page scroll position.
2. Browser wheel ownership is independent of logical focus and Off/On/Key widget capture mode.
3. One physical wheel event produces at most one `BrowserCanvasWheelEvent`; native and preload
   wheel relays must not coexist.
4. Only the active visible Browser tab may relay, and every preload payload is untrusted at the
   main-process boundary until fully validated.
5. DOM pixel, line, and page deltas preserve both axes, use DOM sign convention, and are clamped
   before reaching the canvas classifier.
6. Pinch and `Cmd/Ctrl + scroll` preserve modifiers and continue through the existing focal zoom
   classifier.
7. The Browser frame preload remains self-contained so sandbox execution cannot depend on loading
   a generated local chunk.
8. Clicks, keyboard focus, selection, scrollbar drag, page controls, and explicit Browser
   automation scrolling remain page-owned outside the full-navigation drag override.

## 5. Consequences & Mitigations

- **Positive:** Page scroll cancellation is enforced in the same Chromium frame path that receives
  the wheel, including iframe content and unfocused Browser pages.
- **Positive:** DOM deltas require no Electron-native sign inversion and cannot be duplicated by a
  second native relay.
- **Negative / Risks:** The preload and shared IPC registry duplicate one private channel string;
  drift would cancel the page but stop canvas movement.
- **Negative / Risks:** Future Electron or Chromium changes to sandbox preloads or wheel dispatch
  can invalidate the mechanism.
- **Mitigations:** Source integration tests assert both channel declarations and the absence of a
  native wheel relay. The Electron smoke test sends native `mouseWheel` in both directions from a
  non-edge scroll position and fails if page `scrollY` changes. Manual release checks retain real
  trackpad scroll and pinch because synthetic Electron input cannot cover OS gesture nuances.

## Decision Drivers / Forces

- Cancellation must happen synchronously in the actual page delivery path.
- The Browser page is untrusted and cannot choose whether the canvas owns an event.
- The same event must drive cancellation and relay to avoid missing or duplicate camera movement.
- Subframes must not reintroduce page-owned wheel regions.
- Mouse wheel and trackpad input must share the canvas classifier without device detection.

## Assumptions

- Chromium continues representing physical mouse-wheel, trackpad scroll, and wheel-shaped pinch
  as trusted DOM `wheel` input in Browser frames.
- Electron session `frame` preloads continue running before page scripts in every frame.
- `screen.getCursorScreenPoint()` remains expressed in the same display-independent coordinate
  space as the owner window content bounds.

Breaking any assumption requires review of this ADR and a real Electron runtime test, not only a
source or unit test.

## References

- [Electron `session.registerPreloadScript`](https://www.electronjs.org/docs/latest/api/session#sesregisterpreloadscriptscript)
- [Electron `before-mouse-event`](https://www.electronjs.org/docs/latest/api/web-contents#event-before-mouse-event)
- [Electron `InputEvent`](https://www.electronjs.org/docs/latest/api/structures/input-event)
- [Electron 43.2.0 `PreHandleMouseEvent` and `OnInputEvent` source](https://github.com/electron/electron/blob/v43.2.0/shell/browser/api/electron_api_web_contents.cc)
- [W3C UI Events: Wheel Events](https://w3c.github.io/uievents/split/wheel-events.html)

## Validation

- Unit tests validate pixel, line, and page delta normalization, both-axis clamping, modifiers,
  malformed fields, unsupported delta modes, and zero events.
- Source integration tests require a self-contained Browser preload entry, session-wide frame
  registration, cancellation-before-relay ordering, IPC routing, and removal of native wheel
  relay.
- `npm run smoke:browser` loads a long page in Electron, positions it away from either scroll edge,
  injects native `mouseWheel` in both directions, and asserts the page stays at the same `scrollY`.
  The smoke then verifies that explicit Browser automation can still scroll the page.
- Release validation covers an unfocused Browser under the physical pointer with macOS trackpad
  vertical and diagonal scroll, pinch, mouse wheel, nested iframe content, scrollbar drag, and
  keyboard scrolling.

The decision is falsified if trusted physical wheel changes page scroll position, fails to move or
zoom the canvas once, or produces more than one camera update.

## Confidence & Reversibility

Confidence is medium-high. The original mechanism failed despite source-level tests; confidence
is now grounded in an Electron runtime assertion of the exact page-scroll invariant, but physical
trackpad pinch and platform-specific gesture delivery still require the release matrix. The change
is reversible by unregistering the preload and restoring another proven single relay boundary. It
does not alter persisted settings or the public Browser canvas event contract.

## Follow-ups

No deferred implementation work is created. The physical macOS, Windows Precision Touchpad, and
Linux/libinput release matrix remains a release gate for the broader navigation feature.
