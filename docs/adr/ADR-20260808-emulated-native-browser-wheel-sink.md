# ADR: Use an Emulated Native Browser Wheel Sink

**Date:** 2026-08-08
**Scope / Component:** native Browser target continuity during Browser-origin canvas wheel sequences
**Risk/Strictness Profile:** Production
**Status:** Accepted
**Supersedes:** [ADR: Pin the Native Browser Wheel Target for Browser-Origin Canvas Gestures](./ADR-20260808-pin-native-browser-wheel-target.md)
**Amends:** [ADR: Use Focus-Aware Native Browser Wheel Ownership](./ADR-20260808-focus-aware-native-browser-wheel-ownership.md), [ADR: Freeze Native Browser During Cross-Surface Wheel Gestures](./ADR-20260808-freeze-native-browser-during-cross-surface-wheel.md)
**Related:** [ADR: Use Intent-Based Canvas Navigation with Mode-Based Wheel Capture](./ADR-20260807-intent-based-canvas-wheel-navigation.md)
**Implementation:** [`BrowserCanvasSinkViewport`](../../src/main/services/browser/BrowserCanvasSinkViewport.ts), [`BrowserCanvasFreeze`](../../src/main/services/browser/BrowserCanvasFreeze.ts), [`BrowserService`](../../src/main/services/BrowserService.ts), and [`BrowserCard`](../../src/renderer/src/features/browser/BrowserCard.tsx)

## 1. Context and Problem Statement

CanvasTTY renders the workspace in the owner renderer and a live Browser page in a child Electron
`WebContentsView`. These are separate native input surfaces. The intent-based navigation ADR
defines which surface owns wheel-class input, and the focus-aware Browser ADR selects `page` or
`canvas` synchronously at the start of a Browser wheel sequence. Correct ownership alone does not
guarantee that the operating system will continue delivering later trackpad momentum events to a
surface that remains usable by the selected owner.

Live macOS testing established the following causal chain:

1. A trackpad pan begins over an unfocused Browser, so the frame preload correctly selects canvas,
   cancels page delivery, and relays the first wheel event.
2. macOS retains the active scroll sequence against that exact native `WebContentsView`; hiding it
   does not retarget the remaining events to the owner renderer.
3. Removing the native view therefore preserves visual correctness but stalls the sequence after
   its first event until the 250 ms idle reset.
4. Keeping the same native target in a 4 DIP parent clip restores input continuity, but live
   testing then showed detached Browser pixels outside the reduced parent bounds. The child
   `WebContentsView` remained visibly composited rather than being reliably clipped by its parent.
5. Making page DOM transparent removed document pixels but left an opaque black native compositor
   surface. Page CSS opacity and View background alpha do not control the entire native layer.
6. Shrinking the actual child surface removes the detached native rectangle, but a plain resize
   also changes the page viewport and can trigger responsive reflow, resize handlers, and scroll
   changes.
7. Electron device emulation decouples the page's logical viewport from the physical native
   surface. The page can therefore keep its pre-gesture layout while the real hit-test target is
   reduced to a cursor-local square.

The decision must preserve the exact native target for Browser-origin canvas gestures, remove the
rest of that target from hit testing and composition, keep page state stable, and show a visual
representation that follows the Browser card through canvas pan and zoom.

## 2. Decision Drivers

- A canvas-owned Browser-origin trackpad sequence must retain one physical target through momentum
  and must not restart once per idle timeout.
- The native Browser must not leave a full-size, detached, or black compositing rectangle over the
  moving canvas.
- The page's logical viewport, scroll position, and resize-observable layout must not change merely
  to retain input delivery.
- The visual Browser representation must move and scale with its canvas card while the physical
  target remains pinned under the stationary pointer.
- Focused page-owned plain scroll must remain native and must not enter this workaround.
- Trackpad, Magic Mouse, and mouse wheel must use the same wheel-class contract without physical
  device detection.
- Failure to preserve the logical viewport must not fall back to an uncontrolled page resize.
- Restoration must not expose a frame where both the native page and its frozen representation are
  absent.

## 3. Options Considered

### Option A: Hide the native Browser and rely on operating-system retargeting

- **Description:** After the first Browser-frame relay, hide the child native view and expect
  subsequent wheel events to reach the owner renderer's DOM freeze surface.
- **Pros:** Removes the native Browser from both visual composition and hit testing.
- **Cons & Reason for Rejection:** Live macOS testing delivered one Browser-frame event and then no
  more until the 250 ms reset. An active scroll sequence remained associated with the original
  native target and was not retargeted when that target disappeared.

### Option B: Keep a full-size child inside a 4 DIP parent clip

- **Description:** Reduce only the parent `clipView` around the sequence pointer while leaving the
  child `WebContentsView` at its original size and offset.
- **Pros:** Retains the same native target and preserves the page viewport without emulation.
- **Cons & Reason for Rejection:** Input continuity worked, but live rendering showed the child
  surface outside the expected parent clip as a detached Browser rectangle. Parent geometry was
  therefore not a reliable visual-composition boundary for this native child.

### Option C: Conceal the page with CSS opacity or a transparent View background

- **Description:** Keep the full native surface but set page DOM opacity to zero and make the View
  background transparent while the frozen image is shown.
- **Pros:** Avoids resizing the native target or page viewport.
- **Cons & Reason for Rejection:** CSS opacity affected document content, not the complete native
  compositor surface. Live testing replaced the detached page with a large opaque black rectangle.
  The mechanism also required an extra preload acknowledgement race during restoration.

### Option D: Render unfocused Browser tabs permanently as screenshots

- **Description:** Keep the live `WebContentsView` hidden whenever the Browser is not focused and
  continuously capture frames for renderer display.
- **Pros:** Native Browser hit testing would not interrupt ordinary canvas navigation.
- **Cons & Reason for Rejection:** It changes Browser rendering and interaction outside active
  gestures, requires a continuous capture/refresh policy, increases CPU, GPU readback, encoding,
  and memory work, and introduces freshness and activation transitions for all unfocused Browser
  use. The observed defect requires only a bounded sequence-local substitution.

### Option E: Resize the actual `WebContentsView` without preserving its logical viewport

- **Description:** Shrink both parent and child native bounds to a small square for the sequence.
- **Pros:** Keeps the exact native target while removing almost all native pixels and hit area.
- **Cons & Reason for Rejection:** Physical surface size is also a page viewport input. A direct
  resize can trigger responsive reflow, `resize` events, and scroll changes, so a navigation
  workaround would mutate the Browser page being represented by the frozen frame.

### Option F: Shrink the actual view and preserve its logical viewport with device emulation

- **Description:** Before shrinking, emulate the starting Browser viewport in the same
  `WebContents`; then reduce both parent and child native bounds to 4 by 4 DIP under the sequence
  pointer. Keep the cached frame mounted inside `BrowserCard`, and restore physical bounds before
  disabling emulation.
- **Pros:** Retains the exact native wheel target, removes the broad native compositing surface,
  preserves page layout and scroll state, and lets the renderer snapshot follow canvas geometry.
- **Cons:** Temporarily freezes page pixels, depends on Electron's device-emulation lifecycle, and
  still leaves a 4 DIP native target under the pointer.
- **Decision:** Selected after Electron smoke and live macOS trackpad validation.

### Option G: Patch Electron or install a platform event tap

- **Description:** Retain or redirect native scroll targeting below the application View layer.
- **Pros:** Could remove the need for a screenshot and small native sink.
- **Cons & Reason for Rejection:** It creates an Electron fork or a privileged platform-specific
  input path with substantially greater maintenance and upgrade cost. It remains the fallback if
  the selected mechanism stops working in a future Electron release.

### Option H: Keep the one-event-per-idle behavior

- **Description:** Accept the sequence stall over an unfocused Browser.
- **Pros:** No additional lifecycle state.
- **Cons & Reason for Rejection:** Direct trackpad pan over Browser content is unusable and violates
  the already selected canvas ownership contract.

## 4. Decision Outcome

**Chosen Option:** Shrink the actual view and preserve its logical viewport with device emulation.

### Trackpad and wheel ownership contract

CanvasTTY does not detect a physical trackpad. Mouse wheel, high-resolution wheel, Magic Mouse,
two-finger scroll, and wheel-shaped pinch enter the same wheel-class ownership contract.

At the start of a live Browser sequence, the trusted frame preload asks main synchronously for one
tab-scoped owner. Main applies the focus-aware matrix:

| Start condition | Sequence owner |
|---|---|
| `Ctrl`/`Meta` wheel, including pinch-shaped wheel | Canvas |
| Full canvas navigation override active | Canvas |
| Wheel/pinch capture mode On | Canvas |
| Wheel/pinch capture mode Key and its binding active | Canvas |
| Browser not logically focused | Canvas |
| Browser focused, capture mode Off | Page |
| Browser focused, capture mode Key and binding released | Page |

The owner remains latched through top-frame/iframe transitions and changes to focus, modifiers, or
override state until 250 ms without wheel input or an explicit lifecycle reset. A page-owned event
is neither cancelled nor relayed and scrolls the live page normally. A canvas-owned Browser event
is cancelled in the frame preload before page delivery and relayed exactly once to the shared
canvas classifier.

The classifier remains defined by the intent-based navigation ADR: `Ctrl`/`Meta` wheel performs
focal-point zoom; otherwise a fresh pan-first profile uses both `deltaX` and `deltaY` for
screen-space pan, while a migrated or explicitly selected wheel-zoom profile retains its legacy
direction and sensitivity. No device precision flag participates in classification.

### Browser-origin canvas sequence

When the first synchronous Browser-frame decision selects canvas, `BrowserService` captures the
active tab, starting native Browser viewport, and validated owner-relative pointer. The same active
`WebContentsView` is retained as the operating-system target.

Before applying small physical bounds, `BrowserCanvasSinkViewportController` calls
`webContents.enableDeviceEmulation()` with the rounded starting viewport as `screenSize` and
`viewSize`, desktop positioning, the original device scale factor (`deviceScaleFactor: 0`), and
emulation scale `1`. The sink is armed only if this step succeeds.

While the sequence is frozen:

- the parent clip and actual child `WebContentsView` both use a 4 by 4 DIP rectangle centered on
  the fixed pointer and clamped to owner content bounds;
- the same native `WebContentsView` remains mounted, visible, and eligible for later wheel events;
- the active tab's cached JPEG remains mounted behind the native surface in `BrowserCard`;
- the DOM snapshot follows current Browser-card and canvas transforms, while the native sink stays
  pinned under the stationary sequence pointer;
- page CSS opacity, transparent native backgrounds, and preload visual acknowledgements are not
  part of the mechanism;
- full navigation override keeps higher-priority pointer ownership; ordinary pointer input during
  the sink interval is prevented at the stale native coordinate and routed to the current surface.

If device emulation cannot be enabled, no small sink is installed. The system uses the existing
full-hide freeze path rather than resizing the page without logical-viewport protection.

### Canvas-origin sequence and restoration

A canvas-owned sequence that begins in the owner renderer does not need to preserve a Browser
native target. Before a moving Browser rectangle crosses the pointer, the existing collision path
hides the native surface completely and displays the same cached frame. This keeps owner-renderer
delivery continuous.

At Browser-origin sequence end, restoration is ordered:

1. clear the sink geometry from sequence state;
2. restore the current full physical Browser bounds while device emulation is still active;
3. call `webContents.disableDeviceEmulation()`;
4. deactivate the DOM freeze state only after the live native page is back in place.

This order avoids both page reflow at 4 DIP and a visual gap. Blur, hidden Browser state, active-tab
change, navigation, crash, contents destruction, Browser close, and service disposal end the
sequence and perform the same protected restoration or destruction cleanup.

## 5. Invariants / Constraints

1. Production input code does not infer a physical trackpad, mouse, or device identifier from
   wheel deltas, timing, or precision flags.
2. Browser wheel ownership is chosen once per tab-scoped sequence and remains latched until 250 ms
   idle or an explicit lifecycle reset.
3. Focused page-owned plain wheel is not cancelled, frozen, relayed, or placed in a native sink.
4. Canvas-owned Browser wheel is cancelled before page delivery and relayed exactly once.
5. `Ctrl`/`Meta` wheel and pinch-shaped wheel over a live Browser are always canvas-owned and use
   focal-point zoom.
6. A Browser-origin sink retains the exact `WebContentsView` that received the first physical
   event; replacing the view does not satisfy target continuity.
7. Device emulation must succeed before physical sink bounds are applied. Failure cannot fall back
   to an unprotected 4 DIP page viewport.
8. Both the parent clip and actual child native view are limited to 4 by 4 DIP during the sink.
   Keeping a full-size child under a small parent is prohibited by the observed compositing leak.
9. The emulated logical viewport is derived from the starting native Browser viewport. During the
   sink, page `innerWidth`, `innerHeight`, scroll position, and resize-observable layout remain
   unchanged.
10. The cached DOM frame, not the native sink, follows canvas camera and Browser-card transforms.
11. CSS opacity, native background alpha, and DOM/native overlay stacking are not input-target or
    native-compositor controls and are not used for sink concealment.
12. Canvas-origin sequences have no native sink and continue using the full-hide collision path.
13. Full physical bounds are restored before device emulation is disabled; live native content is
    restored before the DOM freeze is deactivated.
14. Placeholder transitions may preserve an active sequence; hidden state and lifecycle resets
    cannot leave device emulation or sink bounds active.
15. Full canvas navigation override retains priority for pointer ownership and cursor latching.

## 6. Consequences and Mitigations

- **Positive:** A slow Browser-origin trackpad pan remains continuous instead of delivering one
  frame per 250 ms generation.
- **Positive:** Browser-to-canvas and canvas-to-Browser crossings use origin-appropriate mechanisms
  while preserving one ownership and classifier contract.
- **Positive:** No full-size native Browser or black compositor rectangle remains detached from the
  moving card.
- **Positive:** The Browser page keeps its logical viewport and scroll state while the physical
  target is reduced.
- **Negative / Risk:** Browser pixels are frozen for the short canvas-owned sequence.
- **Mitigation:** One same-tab cached frame follows the card; the live view returns after 250 ms
  idle. Capture work is coalesced, generation-checked, and encoded to at most 1.5 MiB.
- **Negative / Risk:** A 4 DIP native surface remains under the stationary cursor.
- **Mitigation:** Both parent and child are actually reduced to that area, so it cannot create the
  previous full-size compositing or hit-test region. Pointer routing remains explicit.
- **Negative / Risk:** Device emulation adds state that must be unwound on every Browser lifecycle
  path.
- **Mitigation:** A tab-scoped controller makes preserve/restore idempotent, refuses to arm after
  failure or disposal, and restores during tab destruction and service disposal.
- **Negative / Risk:** Future Electron versions may change native scroll-target or device-emulation
  behavior.
- **Mitigation:** Electron integration smoke and the physical trackpad release matrix are required
  when Electron changes. A runtime fork remains the explicit fallback, not additional DOM
  heuristics.

## 7. Assumptions

- macOS retains an active scroll sequence for the same mounted and hit-testable
  `WebContentsView` while it remains under the stationary pointer.
- A 4 DIP square is sufficient to keep that native target eligible for subsequent momentum events.
- Trackpad pan changes canvas geometry but not the operating-system pointer position.
- Electron 43.2.0 device emulation keeps the requested logical `viewSize` while the containing View
  uses smaller physical bounds.
- The active tab has a same-tab cached frame in normal loaded operation; if not, the existing
  Browser viewport background is an acceptable short fallback.

## 8. References

- [Electron 43.2.0 `webContents.enableDeviceEmulation` and `disableDeviceEmulation`](https://github.com/electron/electron/blob/v43.2.0/docs/api/web-contents.md#contentsenabledeviceemulationparameters)
- [Electron issue #32751: Trackpad scrolling stops when crossing BrowserView](https://github.com/electron/electron/issues/32751)
- [Intent-based canvas navigation ADR](./ADR-20260807-intent-based-canvas-wheel-navigation.md)
- [Focus-aware native Browser ownership ADR](./ADR-20260808-focus-aware-native-browser-wheel-ownership.md)
- [Cross-surface Browser freeze ADR](./ADR-20260808-freeze-native-browser-during-cross-surface-wheel.md)
- [Superseded native target pinning ADR](./ADR-20260808-pin-native-browser-wheel-target.md)

## 9. Validation

- Pure tests verify the 4 DIP parent and child geometry, owner-edge clamping, invalid points,
  device-emulation parameters, idempotent preserve/restore, retry after enable failure, and dispose
  restoration.
- Source integration tests reject the removed opacity, transparent-background, visibility-ACK,
  and full-size-child mechanisms and require the cached frame to remain mounted behind the live
  native view.
- Electron Browser smoke exercises the actual 4 DIP sink at canvas scales `1.0` and `0.5`. It
  verifies continued wheel relay while `innerWidth`, `innerHeight`, `scrollY`, and page resize count
  remain unchanged through activation and restoration.
- Live macOS trackpad validation confirmed continuous Browser-origin canvas pan with no detached
  frozen rectangle or black native surface. This observation promoted the decision from an
  experiment to Accepted.
- The broader release matrix remains macOS trackpad scroll/pinch and mouse wheel, Windows Precision
  Touchpad/mouse wheel, and Linux/libinput across page-owned scroll, Browser-origin canvas pan,
  canvas-origin crossing, focal zoom, semantic-summary transitions, and immediate post-idle click.

The decision is falsified if an active sequence stops while the 4 DIP sink remains mounted, page
viewport or scroll state changes during the sink, native pixels appear outside the 4 DIP bounds,
or focused page-owned plain scroll enters the freeze path.

## 10. Confidence and Reversibility

Confidence is high for the observed macOS failure: unit coverage, Electron integration smoke, and
the previously failing physical trackpad scenario all pass. Cross-platform confidence remains
medium until the Windows and Linux release matrix is completed.

The mechanism is reversible inside the native Browser freeze path and does not alter persisted
settings or the public `BrowserCanvasWheelEvent`. Removing it would restore the known
one-event-per-idle Browser-origin defect. If Electron invalidates the target-retention assumption,
the next decision is an Electron patch or supported native hit-test API, not CSS transparency,
device heuristics, or another overlay.

## 11. Follow-ups

- Re-run the physical release matrix whenever Electron is upgraded from 43.2.0.
