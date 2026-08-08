# ADR: Pin the Native Browser Wheel Target for Browser-Origin Canvas Gestures

**Date:** 2026-08-08
**Scope / Component:** native Browser hit testing during Browser-origin canvas wheel sequences
**Risk/Strictness Profile:** Production
**Status:** Superseded
**Superseded by:** [ADR: Use an Emulated Native Browser Wheel Sink](./ADR-20260808-emulated-native-browser-wheel-sink.md)
**Amends:** [ADR: Freeze Native Browser During Cross-Surface Wheel Gestures](./ADR-20260808-freeze-native-browser-during-cross-surface-wheel.md), [ADR: Use Focus-Aware Native Browser Wheel Ownership](./ADR-20260808-focus-aware-native-browser-wheel-ownership.md)
**Implementation:** [`BrowserCanvasFreeze`](../../src/main/services/browser/BrowserCanvasFreeze.ts), [`BrowserCanvasWheel`](../../src/main/services/browser/BrowserCanvasWheel.ts), and [`BrowserService`](../../src/main/services/BrowserService.ts)
**Refresh 2026-08-08:** Live macOS validation confirmed target continuity but showed that the
child `WebContentsView` can remain visibly composited outside the reduced parent bounds. The
implementation now preserves the original child bounds and page scroll state, makes the native
surface transparent while the sink is active, and removes the DOM freeze frame only after the
trusted frame preload acknowledges visual restoration. This refines the selected minimal-sink
mitigation without changing its target-identity or hit-test decision.

## 1. Context and Problem Statement

The focus-aware wheel ADR selected the canvas synchronously when a wheel sequence begins over an
unfocused native Browser. Its first implementation then activated the frozen screenshot and hid
the native `clipView`. It assumed macOS would deliver later events from the same physical scroll
sequence to the owner renderer's DOM freeze surface.

Live macOS trackpad testing falsified that assumption. A direct pan over an unfocused Browser
relayed one event, then paused until the 250 ms idle timeout restored the native view. The next
event started another generation and repeated the cycle. One captured interval selected canvas at
`04:04:20.500`, ended at `04:04:20.754`, and restarted at `04:04:20.765`; the same approximately
250 ms cadence repeated across subsequent generations. A quick second gesture worked because it
began after the native surface had already been removed and therefore acquired the owner renderer
as a new operating-system scroll target.

The evidence distinguishes ownership classification from native target continuity: main selected
canvas correctly, the frame preload cancelled and relayed correctly, and the freeze state was
active. The failure occurred because hiding the selected `WebContentsView` did not retarget an
already active macOS scroll sequence. Browser-origin canvas navigation therefore needs to keep
that exact native target alive while removing the moving Browser rectangle from normal hit testing.

The same runtime capture exposed a coordinate-space error at non-unit canvas scale. The owner
cursor was `(845,463)`, while page `clientX/clientY` added directly to the scaled Browser viewport
produced `(885,484)`. Browser DOM coordinates are CSS pixels and cannot be treated as owner DIP
without scale conversion.

## 2. Decision Drivers

- Every event in a Browser-origin canvas wheel sequence must continue reaching the registered
  frame preload until the 250 ms sequence idle boundary.
- The live native Browser rectangle must not follow the moving card and become a broad hit target
  while the DOM screenshot represents it.
- Canvas-origin gestures must retain the already verified behavior of fully removing native
  Browser content before crossing its boundary.
- The frozen Browser image must continue following current canvas geometry, including semantic
  summary transitions, while the native target remains pinned independently.
- Pinch, trackpad pan, and mouse wheel must share the same mechanism without device detection.
- Pointer input during the short pinned interval must not click stale page coordinates.
- Focal points must use owner DIP coordinates under every supported canvas scale.

## 3. Options Considered

### Option A: Keep hiding the Browser and wait for owner-renderer retargeting

- **Description:** Preserve the existing freeze implementation: hide `clipView` immediately after
  the first Browser relay and expect later deltas to arrive on the DOM placeholder.
- **Pros:** No additional native geometry or pointer-routing state.
- **Cons & Reason for Rejection:** Physical testing showed exactly one relayed event per idle
  generation. The roughly 250 ms repetition matches application restoration, not a renderer
  scheduling delay. macOS keeps the original scroll sequence associated with the hidden native
  target and does not redispatch its remaining deltas to the owner renderer.

### Option B: Cover the Browser with a higher-z-index DOM block

- **Description:** Leave the native Browser in place and put an owner-renderer overlay above it
  that captures wheel but allows ordinary clicks through.
- **Pros:** The Browser could remain at current visual bounds without native cropping.
- **Cons & Reason for Rejection:** Owner DOM does not participate above a child native
  `WebContentsView` in Electron hit testing. `pointer-events` can choose among DOM elements but
  cannot turn the overlay into a native wheel target while passing click hit tests to the child.
  A second native overlay would itself become another native target and require more forwarding
  and accessibility policy than the selected solution.

### Option C: Keep the entire native Browser pinned at its starting rectangle

- **Description:** Stop moving the `WebContentsView` for the sequence while the frozen screenshot
  follows the Browser card.
- **Pros:** Preserves the original operating-system scroll target with no small-target geometry.
- **Cons & Reason for Rejection:** The old full Browser rectangle would remain an invisible input
  surface over unrelated canvas content. It could intercept clicks and new wheel gestures far from
  the stationary cursor, and any exposed native pixels would visually detach from the card.

### Option D: Pin a minimal native sink under the sequence cursor

- **Description:** Keep the same `WebContentsView` in the native hierarchy, but clip it to a 4 DIP
  square around the fixed owner-relative sequence point. Keep the child bounds relative to the
  original Browser viewport so the cursor addresses the same page location. Continue moving only
  the DOM frozen screenshot with the card.
- **Pros:** Preserves the operating-system scroll target while reducing the stale native hit region
  from the full Browser rectangle to one cursor-local square. It reuses the trusted frame preload,
  existing ownership latch, screenshot, and lifecycle reset.
- **Cons:** Relies on macOS retaining the sequence for a still-mounted but tightly clipped view,
  leaves up to 4 by 4 DIP of live pixels, and requires explicit pointer rerouting during the pinned
  interval.
- **Decision:** Selected.

### Option E: Patch Electron or install a platform event tap

- **Description:** Change the runtime below application views so scroll targeting can be retained
  or redirected explicitly.
- **Pros:** Could provide exact platform-level ownership without a native sink.
- **Cons & Reason for Rejection:** It creates a runtime fork or privileged platform-specific input
  path for a boundary that can be isolated in the existing view model. It remains the fallback if
  live logs show that the pinned `WebContentsView` still loses the physical sequence.

### Option F: Keep the current one-event behavior

- **Description:** Accept repeated 250 ms pan steps over unfocused Browser content.
- **Pros:** No implementation work.
- **Cons & Reason for Rejection:** Direct trackpad pan is effectively unusable and contradicts the
  agreed ownership matrix: a canvas-owned sequence would be classified correctly but not delivered.

## 4. Decision Outcome

**Chosen Option:** Pin a minimal native sink under the sequence cursor.

When the synchronous frame-preload decision starts a new canvas-owned sequence, main snapshots the
active tab, the current native Browser viewport, and the validated owner-relative pointer. If the
pointer lies inside that viewport, the snapshot becomes the native wheel sink for the sequence.
An asynchronous Browser-frame update can refresh the shared idle deadline but cannot replace the
sink geometry.

On a latched freeze, `BrowserService` still activates the DOM screenshot and hides the presence
overlay. For a Browser-origin sequence, however, it keeps `clipView` mounted and visible at a 4 DIP
square centered on the fixed pointer and clamped to owner content bounds. The child
`WebContentsView` keeps bounds derived from the starting viewport relative to that tiny clip. The
page therefore remains the same native scroll target and the page coordinate below the pointer
does not move, while nearly all native pixels and hit testing are clipped away. Current canvas
viewport updates move only the DOM frozen representation. Page scale and live view bounds are not
reapplied until sequence restoration.

A canvas-origin sequence has no native sink and retains the existing behavior: the parent
`clipView` is hidden completely once collision is latched. Placeholder transitions do not remove
an active sink; actual hidden lifecycle state, blur, tab change, navigation, crash, close,
destruction, disposal, or idle reset clears it before native restoration.

Screen coordinates from the trusted wheel event are converted through the owner content bounds
and take priority for the canvas focal point. When valid screen coordinates are unavailable, a
top-frame DOM point is scaled by `Browser viewport DIP / page viewport CSS pixels` on each axis.
Nested-frame client coordinates are not used as a top-frame fallback.

If ordinary pointer input begins while the sink is active, main prevents delivery at the pinned
page coordinate, ends and restores the current wheel surface, then routes the pointer sequence to
the surface under the current owner-relative point. Full canvas navigation override remains
higher priority and keeps its established canvas pointer ownership.

## 5. Invariants / Constraints

1. A native sink is created only by the first synchronous Browser-frame decision of a new
   canvas-owned sequence, never by canvas-origin or asynchronous follow-up input.
2. The sink uses the same active `WebContentsView` that received the first physical wheel event;
   replacing it with another view does not preserve the contract.
3. Sink clip bounds remain 4 DIP, contain the validated sequence point, and stay within owner
   content bounds.
4. Child bounds and page scale remain pinned to the starting Browser viewport until sequence end.
5. Current canvas geometry affects the DOM freeze frame but cannot move or resize the native sink.
6. Canvas-origin sequences have no sink and continue hiding the native `clipView` completely.
7. Placeholder state preserves a running sink; hidden and all lifecycle resets clear it.
8. Pointer input cannot be delivered to the stale pinned page coordinate. Full navigation
   override retains priority over ordinary rerouting.
9. Valid event screen coordinates take priority over DOM client coordinates. A top-frame fallback
   scales CSS pixels to owner DIP on both axes.
10. Wheel ownership, 250 ms latching, relay count, and device-agnostic classification remain as
    specified by the focus-aware ownership ADR.

## 6. Consequences and Mitigations

- **Positive:** Browser-origin canvas pan can retain its physical macOS scroll target instead of
  restarting once per idle timeout.
- **Positive:** The stale native hit region is bounded to a cursor-local square while the frozen
  Browser image moves normally with the canvas.
- **Positive:** Focal-point pan and zoom no longer drift at non-unit canvas scale when screen
  coordinates are available, and the deterministic fallback converts both axes.
- **Negative / Risk:** Electron may treat clipping or moving the ancestor view as sufficient to
  invalidate the active native scroll target on a supported platform.
- **Mitigation:** Runtime logging stays enabled through physical macOS validation. If multiple
  Browser-frame wheel events do not arrive in one generation while the sink remains visible, this
  decision is falsified and the next option is an Electron patch or platform-level target API.
- **Negative / Risk:** Up to 4 by 4 DIP of live Browser pixels may appear over the frozen image.
- **Mitigation:** The region is fixed under the stationary cursor, excludes overlays, and is
  restored after 250 ms idle. Reducing it further requires physical validation because a
  sub-DIP or boundary-only target may not remain hit-testable.
- **Negative / Risk:** Synthetic pointer rerouting may not reproduce every platform drag or
  context-menu detail.
- **Mitigation:** Rerouting starts only during the short sink interval, latches a target through
  mouse up, preserves modifiers/button/click count, and is reset on lifecycle boundaries.

## 7. Assumptions

- macOS retains an active scroll sequence for the same `WebContentsView` while it remains mounted,
  visible, and hit-testable under the stationary cursor, even when its ancestor clip is reduced.
- A 4 DIP square is large enough to keep the target eligible without producing a material visual
  artifact.
- Trackpad pan does not move the system pointer, so the pinned target does not need to follow
  camera movement.
- DOM `screenX/screenY`, Electron content bounds, and View bounds use compatible DIP coordinates on
  supported displays.
- Existing frame preload ordering continues to cancel canvas-owned wheel before page scroll.

## 8. References

- [Electron issue #32751: Trackpad scrolling stops when crossing BrowserView](https://github.com/electron/electron/issues/32751)
- [Electron `View.setBounds`](https://www.electronjs.org/docs/latest/api/view#viewsetboundsbounds)
- [Electron `View.setVisible`](https://www.electronjs.org/docs/latest/api/view#viewsetvisiblevisible)
- [Amended freeze ADR](./ADR-20260808-freeze-native-browser-during-cross-surface-wheel.md)
- [Amended focus-aware ownership ADR](./ADR-20260808-focus-aware-native-browser-wheel-ownership.md)

## 9. Validation

- Pure tests cover sink construction, exact pinned clip and child geometry, owner-edge clamping,
  invalid points, screen-coordinate precedence, scaled top-frame fallback, and nested-frame
  rejection.
- Source integration tests require separate sink and full-hide paths plus lifecycle and pointer
  rerouting.
- Electron smoke sends three Browser-frame canvas-owned wheel events in one generation while the
  current Browser viewport moves, checks three relays, and checks that the freeze does not end
  between them.
- Physical macOS validation must confirm a direct slow pan over an unfocused Browser produces
  consecutive Browser-frame wheel updates without 250 ms gaps, Browser-to-canvas and
  canvas-to-Browser crossing remain continuous, zoom crosses the semantic-summary threshold, and
  an immediate click after freeze reaches the current surface.
- The decision is falsified if the wheel sequence ends while logs show
  `browser-freeze-native-wheel-sink-active` continuously and no lifecycle reset occurred.

## 10. Confidence and Reversibility

Confidence is medium before the next physical macOS run. The runtime log gives high confidence in
the failure mechanism, and the geometry plus routing are deterministic, but Electron's behavior
for an already active native gesture is only partially represented by synthetic input.

The change is reversible inside `BrowserService`: removing Browser-origin sink creation restores
the prior full-hide path without changing settings, public IPC, ownership policy, or stored data.
That rollback also restores the verified one-event-per-idle defect. A failed physical validation
should not trigger additional DOM overlays or device heuristics; it should reopen the lower-level
Electron target-retention option.

## 11. Follow-ups

Temporary runtime logging remains until physical macOS testing confirms direct Browser-origin pan,
both crossing directions, semantic-summary zoom, and immediate pointer restoration. No separate
deferred issue is created while this validation remains part of the active implementation task.
