# ADR: Make Native Browser Wheel Input Canvas-Owned

**Date:** 2026-08-08
**Scope / Component:** native Browser input ownership and canvas wheel relay
**Risk/Strictness Profile:** Production
**Status:** Superseded
**Superseded by:** [ADR: Intercept Native Browser Wheel in a Frame Preload](./ADR-20260808-browser-wheel-frame-preload.md)
**Amends:** [ADR: Use Intent-Based Canvas Navigation with Mode-Based Wheel Capture](./ADR-20260807-intent-based-canvas-wheel-navigation.md)
**Implementation:** [`BrowserService`](../../src/main/services/BrowserService.ts) and [`BrowserCanvasWheel`](../../src/main/services/browser/BrowserCanvasWheel.ts)

## 1. Context and Problem Statement

The built-in Browser renders its page in a native Electron `WebContentsView`, outside the renderer
DOM that owns the canvas. The previous contract let a logically focused Browser page keep
wheel/pinch in Off or released-Key mode. That made spatial canvas navigation depend on a retained
focus flag sent asynchronously from the renderer to the main process.

In practice, the page could scroll when that flag was stale. It could also receive a native wheel
event when delta conversion rejected an unrecognized, malformed, or zero payload, because the
original event was cancelled only after successful conversion. A native Browser page therefore
could intercept trackpad or mouse-wheel navigation even though it visually occupies a canvas card.

Logical Browser focus is still required for keyboard input, text selection, and normal clicks. The
decision is only about wheel-class input delivered over the native-content boundary.

## 2. Decision Drivers

- Wheel ownership must be decided synchronously before Chromium can deliver the event to the page.
- Canvas navigation must not change because a Browser retained or recently changed logical focus.
- Malformed native input must fail closed instead of leaking to page scrolling.
- Mouse wheel, two-axis trackpad scroll, pinch, and `Cmd/Ctrl + scroll` must use the same canvas
  classifier as other canvas-owned input.
- Browser keyboard focus, clicks, text selection, scrollbar dragging, and the full-navigation drag
  override must keep their existing behavior.
- The renderer-to-main viewport contract should not carry state that no longer affects ownership.

## 3. Considered Options

### Option A: Always make native Browser wheel input canvas-owned

- **Description:** Cancel every native `mouseWheel` event for an active visible Browser before any
  validation, then relay only valid non-zero deltas to the canvas.
- **Pros:** Deterministic ownership, no focus synchronization race, fail-closed malformed input,
  and consistent canvas pan/zoom behavior across pointer devices.
- **Cons:** A Browser page cannot be scrolled by wheel or pinch. Users must use scrollbar drag,
  keyboard navigation, or controls provided by the site.
- **Decision:** Selected.

### Option B: Give the page wheel ownership only after an explicit click

- **Description:** Ignore hover focus for wheel routing and let a clicked Browser keep wheel until
  focus is cleared.
- **Pros:** Reduces accidental page scrolling compared with hover-based ownership and preserves a
  familiar clicked-page scrolling model.
- **Cons & Reason for Rejection:** Wheel behavior would still change based on retained cross-process
  state, and an explicit click would turn a spatial canvas region into a wheel sink without a
  persistent visual boundary.

### Option C: Follow logical Browser focus

- **Description:** Keep Browser wheel ownership aligned with renderer-managed hover/click focus and
  the Off/On/Key setting.
- **Pros:** Matches focus-based ownership for renderer, xterm, and plugin widgets.
- **Cons & Reason for Rejection:** The native page is a separate `WebContents`; asynchronous focus
  propagation and fallible delta conversion leave paths where the page receives an event the
  canvas was expected to own. This is the observed failure mode.

## 4. Decision

Every native `mouseWheel` event for an active visible Browser is canvas-owned. `BrowserService`
calls `preventDefault()` synchronously before resolving the owner window, converting deltas, or
creating an IPC payload. Valid bounded deltas on both axes are normalized to the DOM convention and
relayed through the existing `BrowserCanvasWheelEvent`. Malformed and zero payloads are discarded
after cancellation and never reach the page.

The `canvasWheelCaptureMode` setting continues to govern focusable renderer DOM, xterm, and plugin
widgets only. It has no effect on native Browser wheel ownership. The Browser remains logically
focusable for keyboard input, selection, and clicks. The full canvas navigation override continues
to own Browser drag and cursor state independently.

The focus-derived `captureCanvasWheel` value is removed from `BrowserViewportBounds`, Browser-card
state, viewport normalization, and renderer-to-main IPC. `BrowserCanvasWheelEvent` remains
unchanged.

## 5. Invariants

1. A native Browser page never receives wheel-class input while it is active and visible.
2. Cancellation occurs before every fallible ownership, conversion, or relay step.
3. Focused and unfocused Browser pages behave identically for wheel/pinch in Off, On, and Key mode.
4. Valid mouse-wheel and trackpad deltas still use both axes, sign normalization, bounding, and the
   selected canvas pan or historical zoom profile.
5. Pinch and `Cmd/Ctrl + scroll` perform focal-point zoom through the existing canvas classifier.
6. Logical Browser focus remains available for keyboard input, selection, and ordinary clicks.
7. Scrollbar drag, keyboard scrolling, and page-provided controls remain available for page scroll.
8. Full-navigation override pointer ownership and cursor latching are unchanged.

## 6. Consequences

- **Positive:** Browser cards no longer interrupt trackpad or mouse-wheel canvas navigation because
  of stale focus or malformed native input.
- **Positive:** The Browser-specific cross-process contract is smaller and ownership is decided at
  the only boundary that can synchronously stop page delivery.
- **Positive:** The same canvas classifier determines pan versus zoom for native Browser, DOM,
  xterm, and plugin relays after ownership has been established.
- **Negative:** Wheel and pinch can no longer scroll Browser page content, even when the page has
  logical keyboard focus.
- **Mitigation:** Browser content remains scrollable with scrollbar drag, keyboard input, and
  controls supplied by the page.

## 7. Assumptions and Operational Boundaries

- Electron continues to expose cancellable native wheel input through `before-mouse-event`.
- `mouseWheel` is the native event class used for conventional wheel, trackpad scroll, and
  wheel-shaped pinch input before canvas classification.
- A hidden, inactive, or destroyed Browser is not an eligible relay source.
- This ADR amends only the native Browser wheel-ownership clauses of the earlier navigation ADR.
  Its settings, focus, plugin, xterm, classifier, migration, and full-override decisions remain the
  operational baseline unless separately superseded.

## 8. Validation

Automated coverage verifies focused and unfocused Browser ownership in every wheel-capture mode,
early cancellation, malformed and zero payload handling, both axes, modifier preservation, sign
conversion, clamping, and the existing canvas classifier. Integration checks also verify that the
removed viewport flag does not return through Browser-card or renderer IPC state.

Release validation additionally covers a long Browser page on macOS with focused and unfocused
states, diagonal trackpad scroll, pinch, mouse wheel, scrollbar drag, keyboard scrolling, and full
override drag.

## 9. Confidence and Reversibility

Confidence is high because ownership is centralized at the native delivery boundary and protected
by focused unit and source-integration tests. The decision is reversible by introducing a new
explicit Browser-page scrolling interaction, but restoring focus-derived wheel ownership would
reintroduce the cross-process race this decision removes.

## 10. References

- [Electron `webContents` input events](https://www.electronjs.org/docs/latest/api/web-contents#event-before-mouse-event)
- [Electron `MouseWheelInputEvent`](https://www.electronjs.org/docs/latest/api/structures/mouse-wheel-input-event)
- [Base canvas navigation ADR](./ADR-20260807-intent-based-canvas-wheel-navigation.md)
- [`BrowserService.ts`](../../src/main/services/BrowserService.ts)
- [`BrowserCanvasWheel.ts`](../../src/main/services/browser/BrowserCanvasWheel.ts)
