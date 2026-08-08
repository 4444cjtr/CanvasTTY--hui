# ADR: Freeze Native Browser During Cross-Surface Wheel Gestures

**Date:** 2026-08-08
**Scope / Component:** native Browser hit testing during canvas wheel navigation
**Risk/Strictness Profile:** Production
**Status:** Accepted
**Amended by:** [ADR: Use Focus-Aware Native Browser Wheel Ownership](./ADR-20260808-focus-aware-native-browser-wheel-ownership.md), [ADR: Pin the Native Browser Wheel Target for Browser-Origin Canvas Gestures](./ADR-20260808-pin-native-browser-wheel-target.md), [ADR: Use an Emulated Native Browser Wheel Sink](./ADR-20260808-emulated-native-browser-wheel-sink.md)
**Amends:** [ADR: Intercept Native Browser Wheel in a Frame Preload](./ADR-20260808-browser-wheel-frame-preload.md)
**Implementation:** [`BrowserCanvasFreeze`](../../src/main/services/browser/BrowserCanvasFreeze.ts), [`BrowserService`](../../src/main/services/BrowserService.ts), and [`BrowserCard`](../../src/renderer/src/features/browser/BrowserCard.tsx)

## 1. Context and Problem Statement

The Browser page is rendered by a native child `WebContentsView`, while the canvas is rendered by
the owner window's renderer. The frame preload established by the amended ADR reliably cancels and
relays wheel events that begin inside Browser content. It cannot preserve an existing wheel
sequence that began in the owner renderer and later crosses the moving Browser surface.

Manual macOS testing produced a repeatable boundary failure. With a stationary pointer at client
`x=1156`, canvas pan moved the Browser's visible horizontal interval from `[324,1154)` to
`[360,1190)`. The owner renderer received wheel events before the crossing and received no
subsequent wheel event after the native Browser rectangle covered the pointer. Retrying from
inside the rectangle worked through the frame preload. This distinguishes a scroll-target
transition from delta classification, focus ownership, or camera rendering.

Electron 43.2.0 performs macOS hit testing against visible child views of the window content view.
A visible `WebContentsView` can therefore become the target before the owner renderer or its DOM
overlay can observe the next event. Electron issue #32751 describes the same class of interruption
when an infinite canvas moves a `BrowserView` under an active trackpad gesture. The application
must remove the native Browser surface from hit testing before its next bounds cover the pointer,
while preserving a stable visual representation and ordinary Browser pointer interaction.

The first implementation attempted to arm the sequence from the owner `before-mouse-event`
`mouseWheel` callback. Electron smoke falsified that delivery assumption: injected native wheel
reached the owner DOM and moved the canvas, but the owner callback did not fire. The owner renderer
therefore has to arm main explicitly before it applies the wheel intent. Native
`before-mouse-event` remains only an opportunistic backstop where a platform emits it.

## 2. Decision Drivers

- A wheel sequence that starts on the canvas must remain owned by the canvas across a native
  Browser boundary.
- A wheel sequence that starts inside Browser content must continue using the trusted frame
  preload relay and must not activate a second relay.
- The native surface must leave the hit-test tree synchronously, before intersecting bounds are
  applied.
- The visual Browser card must not flash empty while its native content is unavailable.
- Ordinary click, selection, and context-menu input must remain Browser-owned; the held full
  navigation override must remain canvas-owned.
- Mouse wheel and trackpad input must use the same sequence policy without device heuristics.
- Asynchronous screenshot capture must not display a stale tab or outlive Browser lifecycle
  changes.

## 3. Options Considered

### Option A: Keep the frame preload as the only Browser boundary

- **Description:** Continue cancelling and relaying only inside Browser frames.
- **Pros:** No additional native-view lifecycle or screenshot state.
- **Cons & Reason for Rejection:** The first event after an owner-origin gesture crosses the native
  boundary can be retargeted before the frame or owner renderer observes it. The observed sequence
  stops exactly at that boundary, so neither existing relay can preserve continuity.

### Option B: Place a DOM or transparent native overlay above the Browser

- **Description:** Cover the Browser during navigation and route input through an overlay.
- **Pros:** Could provide one stable input surface without changing Browser bounds.
- **Cons & Reason for Rejection:** Owner-renderer DOM does not sit above a visible native child
  view in Electron hit testing. A second native overlay becomes another native input target and
  requires its own cross-process pointer forwarding, focus, accessibility, and stacking policy.
  It does not remove the original boundary with less complexity.

### Option C: Clip or shrink the Browser around the pointer

- **Description:** Leave most of the native surface visible but cut a temporary hole around the
  active cursor.
- **Pros:** Minimizes frozen visual area.
- **Cons & Reason for Rejection:** Electron `View` exposes rectangular bounds and visibility, not a
  stable per-point hit-test mask. Multiple rectangles or moving crop bounds introduce visible
  seams and new native edges while still depending on platform-specific targeting behavior.

### Option D: Detect trackpad input and apply a device-specific workaround

- **Description:** Use delta precision, timing, or `hasPreciseScrollingDeltas` to identify a
  trackpad before hiding the Browser.
- **Pros:** Conventional mouse wheel could avoid the visual freeze.
- **Cons & Reason for Rejection:** These fields characterize an event stream, not a physical
  device, and overlap with high-resolution wheels and Magic Mouse input. Misclassification would
  leave the same boundary failure. The input contract already rejects device detection.

### Option E: Hide the native Browser without a placeholder

- **Description:** Remove the native surface from hit testing for the sequence and expose the
  Browser card background.
- **Pros:** Solves routing with minimal state.
- **Cons & Reason for Rejection:** A moving empty rectangle is a conspicuous visual regression and
  makes it unclear whether the Browser crashed or disappeared.

### Option F: Maintain an application-specific Electron patch

- **Description:** Patch Electron or Chromium to retain the original scroll target across child
  native view boundaries or expose an explicit hit-test control.
- **Pros:** Can solve the routing problem below the application layer without a frozen frame.
- **Cons & Reason for Rejection:** It creates a permanent runtime fork, platform-specific review
  burden, and upgrade cost for behavior needed only during a short cross-surface sequence. It is
  reserved as the fallback if hiding the parent view fails to preserve real input.

### Option G: Synchronously arm main, hide the native surface, and show a local frozen frame

- **Description:** After renderer ownership is established but before wheel intent changes the
  camera, synchronously arm main with the owner-relative focal point. Before the moving Browser
  rectangle reaches that point, hide its parent native `clipView`, latch that state for the
  sequence, and display the last local screenshot in the Browser card.
- **Pros:** Removes the native target from hit testing, preserves canvas ownership, keeps the card
  visually stable, retains the established Browser-origin preload path, and needs no hardware
  inference.
- **Cons:** Browser pixels pause briefly, screenshot capture consumes resources, and ordinary
  pointer input during the freeze requires explicit forwarding.
- **Decision:** Selected.

## 4. Decision Outcome

After the workspace has determined that a DOM or plugin wheel belongs to the canvas, it calls the
preload's `armOwnerWheelSequence` bridge before classifying or applying that input. The bridge uses
a synchronous, main-frame-only IPC. Main validates the sender and finite owner-relative focal
point, starts or refreshes the sequence, and returns without waiting for capture. Synchronous IPC
is restricted to this small state transition so main is armed before a same-event camera update
can publish intersecting Browser bounds. Owner-window `before-mouse-event` performs the same
transition when Electron emits native `mouseWheel`, but correctness does not depend on that
callback. Browser-frame wheel relay is explicitly excluded, so gestures begun inside Browser
content retain their existing single path.

The sequence uses a 250 ms idle timeout and records the last owner-relative focal point. Starting
it schedules screenshot refresh asynchronously; subsequent wheel events only refresh state and
the timer.

Every viewport update computes the Browser rectangle clipped to owner content bounds. The
collision test expands that rectangle by 4 DIP so the transition occurs before the native edge can
cover the cursor. Once a collision is detected, it remains latched even if the pan reverses. Main
publishes a freeze-frame event, synchronously hides the parent `clipView`, hides the separate
presence overlay, and returns without applying the intersecting native bounds. The owner renderer
then continues receiving wheel input over the DOM Browser viewport.

`BrowserCard` displays the active tab's cached JPEG inside its viewport. The frozen viewport is
explicitly canvas-owned for wheel input, independently of Browser logical focus and Off/On/Key
capture mode. Full navigation override still dominates pointer routing and cursor state.

For ordinary pointer input begun while frozen, main cancels the owner event and sends the complete
mouse sequence to the hidden active Browser `WebContents` using viewport-local coordinates and the
original modifiers, button, and click count. This preserves clicks, selection, and context menus
without allowing the Browser card to react to the same owner event. A full navigation override is
never forwarded when the pointer sequence begins and remains canvas-owned. A Browser-owned pointer
sequence that already began remains latched to Browser through mouse up or cancellation and keeps
the freeze alive for that interval.

The active tab keeps one local cached frame. Captures use `capturePage()` directly rather than the
agent screenshot/redaction path because the image is rendered only back into the same local card.
The encoder starts with JPEG quality 70, repeatedly reduces dimensions and quality when necessary,
and rejects output above 1.5 MiB. Concurrent requests collapse into a queued refresh. Generation
tokens reject results made stale by tab changes, navigation, hiding, crashes, destruction, or
disposal. A failed capture reuses the previous frame only when it belongs to the same tab;
otherwise the viewport background is shown.

At sequence end, main first restores the current native view and its bounds, then emits the
inactive freeze event. This ordering prevents a frame where neither the live Browser nor its
placeholder covers the viewport.

## 5. Invariants / Constraints

1. Only canvas-owned DOM/plugin wheel or an equivalent native owner callback starts the collision
   sequence; Browser-origin frame-preload wheel continues through the existing single relay.
2. Collision is tested against the next window-clipped Browser rectangle with a 4 DIP guard.
3. Once collision occurs, the native parent `clipView` remains hidden until sequence reset,
   including diagonal and reverse motion.
4. Intersecting native bounds are never applied while the collision is latched.
5. A frozen DOM viewport is always canvas-owned for wheel/pinch, regardless of Browser focus or
   wheel-capture mode.
6. Full navigation override owns wheel and pointer input before ordinary frozen-Browser forwarding.
7. Ordinary Browser pointer sequences begun during freeze cannot also click, select, or focus the
   renderer `BrowserCard`.
8. Native view restoration precedes frozen-frame deactivation.
9. Capture results are tab-scoped, bounded to 1.5 MiB, and accepted only for the current generation.
10. Blur, Browser hide, viewport hide, tab switch, navigation, crash, contents destruction, and
    service disposal restore or remove native state and invalidate stale capture work.
11. Presence and native cursor overlays are not shown on top of the DOM frozen frame.
12. Mouse wheel and trackpad use the same behavior; no device label or precision heuristic is used.

## 6. Consequences and Mitigations

- **Positive:** A canvas-origin pan no longer loses its wheel target when a moving native Browser
  reaches the stationary pointer.
- **Positive:** Browser-origin wheel retains the frame-preload cancellation and relay that already
  prevents page scroll.
- **Positive:** Hiding the parent surface removes the entire native Browser hit-test region rather
  than moving the problem to another edge.
- **Negative / Risk:** Live Browser pixels pause during a collision sequence.
- **Mitigation:** The last bounded local frame remains visible, and the sequence ends after 250 ms
  without wheel input.
- **Negative / Risk:** Capture may be unavailable during first load or after a tab switch.
- **Mitigation:** Same-tab cache fallback is used; otherwise the existing viewport background is
  shown without retaining an image from another tab.
- **Negative / Risk:** Synthetic pointer forwarding may diverge from platform input behavior.
- **Mitigation:** It copies coordinates, modifiers, button, and click count, latches through the
  pointer sequence, and is covered by Electron smoke and manual selection/context-menu checks.
- **Negative / Risk:** Frequent large captures can cost memory and main-process time.
- **Mitigation:** Only one active-tab frame is cached, parallel work is coalesced, stale work is
  discarded, and encoded data is bounded.

## 7. Assumptions

- On Electron 43.2.0, `clipView.setVisible(false)` synchronously removes its descendants from the
  macOS hit-test path before the next input event.
- Main-frame synchronous IPC completes the sequence transition before renderer wheel
  classification and any resulting viewport update.
- `capturePage()` can capture the active child while its parent is temporarily hidden; if it
  cannot, the same-tab frame captured before collision remains usable.
- Owner client coordinates, native view bounds, and renderer `getBoundingClientRect()` use the same
  display-independent coordinate space.
- A 250 ms idle window spans momentum events without making the visual pause persist after a
  completed gesture.

If live logs show a sequence stopping while the parent `clipView` is already hidden, the primary
hit-test assumption is falsified. The next design step is an Electron patch or upstream API, not
another DOM relay or device heuristic.

## 8. References

- [Electron issue #32751: Trackpad scrolling stops when crossing BrowserView](https://github.com/electron/electron/issues/32751)
- [Electron 43.2.0 macOS native-window hit testing](https://github.com/electron/electron/blob/v43.2.0/shell/browser/native_window_mac.mm#L111-L148)
- [Electron `webContents.capturePage`](https://www.electronjs.org/docs/latest/api/web-contents#contentscapturepagerect-opts)
- [Electron `View.setVisible`](https://www.electronjs.org/docs/latest/api/view#viewsetvisiblevisible)
- [Amended frame-preload ADR](./ADR-20260808-browser-wheel-frame-preload.md)

## 9. Validation

- Unit tests cover the observed `[324,1154) -> [360,1190)` geometry at cursor `1156`, horizontal,
  vertical, diagonal, reverse, guard, window clipping, latching, idle timeout, generation rejection,
  cache fallback, and encoding limits.
- Integration tests require ownership-before-arm ordering, main-frame sender validation,
  synchronous owner-sequence arming, native parent hiding, freeze IPC, renderer ownership, pointer
  forwarding, and full-override precedence.
- The Electron Browser smoke test verifies a non-empty freeze frame and continued page-scroll
  cancellation without duplicate wheel relay.
- Manual macOS validation covers gestures begun outside and inside Browser content in four
  directions, diagonal and reverse pan, slow pan, momentum, pinch, mouse wheel, immediate click,
  text selection, context menu, and full override drag.
- Temporary runtime logging remains until two live invariants are observed: wheel delivery does
  not stop, and a latched collision never leaves the native `clipView` under the cursor.

The decision is falsified if owner wheel delivery stops after the log records the native parent as
hidden, if a collision applies Browser bounds covering the pointer, if one physical Browser-origin
wheel is relayed twice, or if pointer forwarding leaks a duplicate Browser-card action.

## 10. Confidence and Reversibility

Confidence is medium until the exact physical macOS trackpad scenario passes with runtime logs.
The cause is supported by exact geometry, Electron's native hit-test implementation, a matching
upstream report, and an Electron smoke that exercises the renderer-to-main arm path. Physical
momentum and platform gesture targeting still require the manual check. The change is reversible
by removing the sequence/freeze module and renderer event while retaining the frame preload. No
persisted setting or external Browser contract changes.

## 11. Follow-ups

No separate issue is created. Runtime logging removal is intentionally deferred until the live
macOS invariants in Validation are confirmed. An Electron fork is considered only if that test
falsifies native-view hiding as the hit-test boundary.
