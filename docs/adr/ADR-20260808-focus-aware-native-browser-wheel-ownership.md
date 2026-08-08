# ADR: Use Focus-Aware Native Browser Wheel Ownership

**Date:** 2026-08-08
**Scope / Component:** native Browser wheel ownership, frame preload arbitration, logical input focus, and cross-surface freeze lifecycle
**Risk/Strictness Profile:** Production
**Status:** Accepted
**Amended by:** [ADR: Pin the Native Browser Wheel Target for Browser-Origin Canvas Gestures](./ADR-20260808-pin-native-browser-wheel-target.md), [ADR: Use an Emulated Native Browser Wheel Sink](./ADR-20260808-emulated-native-browser-wheel-sink.md)
**Supersedes:** [ADR: Intercept Native Browser Wheel in a Frame Preload](./ADR-20260808-browser-wheel-frame-preload.md)
**Amends:** [ADR: Use Intent-Based Canvas Navigation with Mode-Based Wheel Capture](./ADR-20260807-intent-based-canvas-wheel-navigation.md), [ADR: Freeze Native Browser During Cross-Surface Wheel Gestures](./ADR-20260808-freeze-native-browser-during-cross-surface-wheel.md)
**Implementation:** [`browser` preload](../../src/preload/browser.ts), [`BrowserService`](../../src/main/services/BrowserService.ts), [`BrowserCanvasWheel`](../../src/main/services/browser/BrowserCanvasWheel.ts), [`BrowserViewport`](../../src/main/services/browser/BrowserViewport.ts), and [`BrowserCard`](../../src/renderer/src/features/browser/BrowserCard.tsx)

## 1. Context and Problem Statement

The native Browser page runs in a child `WebContentsView`, outside the owner renderer that hosts
the canvas. The superseded frame-preload ADR made every trusted Browser-frame `wheel` event
canvas-owned. That mechanism reliably prevented Chromium page scroll and provided a single relay,
including in nested frames, but the always-canvas policy removed ordinary wheel scrolling from a
focused live page.

Runtime testing exposed two related continuity failures after the always-canvas interception was
combined with the cross-surface freeze mechanism:

1. A canvas pan that began in Browser content stopped when the pointer left the native Browser
   rectangle. The frame preload relayed the first events but did not start the shared owner-wheel
   sequence that hides the native hit target.
2. When canvas zoom crossed the semantic-summary threshold, the renderer reported the Browser as
   no longer visible. Main treated that transient presentation state as removal, ended the
   sequence, and dropped subsequent Browser-frame wheel as `viewport-hidden`.

The product contract requires ordinary scroll over a focused live Browser page to scroll the page
when wheel capture is Off or its Key binding is released. The same input must navigate the canvas
when the Browser is unfocused, wheel capture is On or active-Key, the full navigation override is
held, or the event expresses focal zoom through `Ctrl`/`Meta`. A decision cannot change midway
through trackpad momentum merely because focus, modifiers, frame target, or an override changes.

The decision therefore concerns both policy and timing: where the first event is arbitrated, how
the owner is latched across Browser frames, and how a Browser-origin canvas gesture enters the
existing native-surface freeze state machine.

## 2. Decision Drivers

- A focused live Browser must support native plain-wheel page scrolling without a separate mode.
- Unfocused Browser content must not trap canvas pan or historical wheel zoom.
- Pinch-shaped `Ctrl`/`Meta` wheel must always reach the canvas focal-point zoom classifier.
- Wheel ownership must be decided before the Browser page can observe or cancel the first event.
- One physical event must produce at most one canvas relay.
- Top frame and nested iframe transitions must not change ownership inside a wheel sequence.
- A Browser-origin canvas gesture must survive movement out of the native rectangle just as an
  owner-origin gesture survives movement into it.
- Semantic summary, trusted popovers/dialogs, and other placeholders must not be confused with a
  Browser card that has left the workspace.
- Ordinary mouse wheel and trackpad input must share the contract without device detection.
- Synchronous renderer/main work must be bounded because it blocks the Browser renderer.

## 3. Options Considered

### Option A: Keep Browser wheel always canvas-owned

- **Description:** Retain unconditional frame-preload cancellation and relay.
- **Pros:** Simple ownership, no focus dependency, and proven prevention of page-scroll leakage.
- **Cons & Reason for Rejection:** A focused Browser cannot use ordinary wheel or trackpad scroll
  to read a page. Requiring scrollbar drag, keyboard input, or site controls for every page scroll
  is a product regression rather than a routing safeguard.

### Option B: Push focus and capture state asynchronously to every Browser frame

- **Description:** Main or the owner renderer broadcasts focus, capture mode, and override changes;
  each frame decides locally on every wheel event.
- **Pros:** No synchronous IPC on the input path and immediate local cancellation.
- **Cons & Reason for Rejection:** Broadcast state can be stale at the first event, especially
  across focus clicks, hover-delay completion, new frames, and preload startup. Independent frame
  state also allows top-frame to iframe movement to select a different owner during one physical
  gesture.

### Option C: Add a manual page-scroll mode

- **Description:** Keep always-canvas ownership and expose a separate toggle or held shortcut that
  temporarily gives wheel to the Browser page.
- **Pros:** The always-canvas routing path remains unchanged and page ownership is explicit.
- **Cons & Reason for Rejection:** It duplicates Off/On/Key capture semantics, adds another mode to
  discover, and makes a focused Browser behave differently from other input-bearing widgets.
  Logical focus already provides the required page-scroll intent.

### Option D: Arbitrate the first event synchronously in main and latch the result

- **Description:** On the first trusted frame `wheel` after idle, the frame preload asks main for a
  `page | canvas` decision. Main evaluates logical focus and current capture state once, assigns a
  tab-scoped generation, and holds that owner until wheel input is idle for 250 ms. Each later
  event only validates/touches the generation asynchronously.
- **Pros:** The first event is decided against authoritative main state before page delivery;
  nested frames share one owner; page-owned input stays native; canvas-owned input enters the
  existing freeze and relay path; synchronous IPC is limited to sequence start.
- **Cons:** The first wheel event blocks the Browser renderer for one short main-process decision,
  and the preload/main generation protocol adds lifecycle state.
- **Decision:** Selected.

## 4. Decision Outcome

### Ownership at sequence start

For a live native Browser surface, main selects the owner with this ordered matrix:

| Condition at sequence start | Owner |
|---|---|
| `ctrlKey` or `metaKey` wheel, including pinch-shaped wheel | Canvas |
| Full canvas navigation override active | Canvas |
| Wheel/pinch capture mode On | Canvas |
| Wheel/pinch capture mode Key with its binding active | Canvas |
| Browser not logically focused | Canvas |
| Browser focused, capture mode Off | Page |
| Browser focused, capture mode Key with its binding released | Page |

A Browser placeholder or hidden native surface is not a live page and is canvas-owned by
definition. Hidden lifecycle state cannot accept a valid Browser-frame decision because no active
native sender should remain routable.

The frame preload listens in capture phase with a non-passive trusted `wheel` listener. If its
local decision is absent or older than 250 ms, it performs one synchronous
`browser:page-wheel-decision` request. Main validates the active tab sender, viewport surface, all
delta fields, viewport dimensions, delta mode, and modifiers before returning a positive
generation and owner.

The decision is tab-scoped in main, not frame-scoped. A first event in a nested iframe during an
active top-frame sequence receives the existing generation and owner. Focus, capture mode,
modifier, or override changes do not affect that generation. Every trusted wheel sends an
asynchronous generation update so main refreshes the shared idle deadline.

For `page`, the preload does not call `preventDefault()` or relay a canvas event. Chromium delivers
the original event and the site scrolls normally. For `canvas`, the preload calls
`preventDefault()` and `stopImmediatePropagation()` synchronously, then sends one validated event
through the existing `BrowserCanvasWheelEvent` path. Invalid decision responses fail closed: the
preload cancels the input, while main rejects generation zero and does not relay malformed data.

### Logical focus

Browser logical focus remains separate from selection and native Chromium focus. A native primary
pointer down assigns Browser input focus in main before the event is reported to the owner
renderer; the renderer synchronously confirms focus changes through a dedicated IPC. Existing
hover behavior transfers focus only after its configured delay. Pointer leave cancels a pending
transfer but does not clear assigned focus. Clicking outside every widget, closing/removing the
Browser card, or destroying the active Browser clears it.

Viewport updates remain asynchronous and contain geometry plus surface state, not logical focus.
This prevents camera/layout traffic from becoming the authority for page input ownership.

### Canvas gesture continuity

The Browser native `before-mouse-event` callback records the current wheel point in owner-content
coordinates before the frame preload requests its decision. Main uses this point for the
synchronous Browser-origin transition; the system cursor is only a short-lived fallback when the
native point is unavailable.

When the selected owner is `canvas`, main starts the same owner-wheel sequence used by canvas-origin
input before returning from synchronous IPC. If the point is inside the active Browser rectangle,
the collision is immediately latched, the cached freeze frame is activated, and the parent
`clipView` is hidden synchronously. The first event is relayed by the frame preload. Later physical
events hit the owner renderer's frozen DOM surface, so pan or zoom continues when the pointer
leaves the former native rectangle.

Canvas-origin gestures keep the existing path: the owner renderer arms main before applying wheel
intent, and main hides the native surface when an updated Browser rectangle approaches the fixed
wheel point. Both origins share one collision generation, idle timer, cached frame, and reset
policy. Neither path performs device detection.

### Native, placeholder, and hidden surfaces

The viewport contract distinguishes:

- `native`: an active live `WebContentsView` is eligible for page ownership;
- `placeholder`: the Browser card remains in the workspace but native content is temporarily
  replaced by summary, trusted dialog/popover, crash/no-tab state, or frozen DOM pixels;
- `hidden`: the Browser card is actually absent and its input lifecycle ends.

`native -> placeholder` does not end an active canvas wheel sequence or discard its same-tab cached
frame. If zoom returns above `0.5` before idle, collision latching keeps the native view out of the
hit-test tree until sequence end. Only `hidden` and real lifecycle resets end immediately.

Viewport size, scale, and bounds changes during an active freeze do not start repeated
`capturePage()` work. The gesture uses the frame captured at sequence start; one deferred refresh
runs after native restoration when necessary.

## 5. Invariants and Constraints

1. The Browser wheel owner is chosen once per tab-scoped sequence and remains unchanged until 250
   ms without wheel input or an explicit lifecycle reset.
2. A page-owned event is neither cancelled nor relayed to the canvas.
3. A canvas-owned Browser event is cancelled before page delivery and relayed exactly once.
4. `Ctrl`/`Meta` wheel and pinch-shaped wheel over a live Browser are always canvas-owned.
5. Focus, mode, binding, modifier, and frame changes cannot change an active sequence owner.
6. Only the active tab's current `WebContents` may request or update a decision.
7. Invalid or stale generations fail closed without delivering unvalidated input to either page
   behavior or canvas relay.
8. Browser-origin and owner-origin canvas gestures use the same native hit-target freeze sequence.
9. Once collision is latched, the native parent view cannot return under the pointer before
   sequence end, including after pan reversal or zoom through semantic summary.
10. Placeholder DOM is canvas-owned for wheel/pinch; only a `native` focused page can be page-owned.
11. `hidden`, blur, tab change, navigation, crash, active contents destruction, Browser close, and
    service disposal clear ownership and restore or remove native state.
12. Mouse wheel and trackpad use the same matrix and classifier; no physical device identity or
    precision heuristic participates.
13. The public `BrowserCanvasWheelEvent` payload remains unchanged.

## 6. Consequences and Mitigations

- **Positive:** Focused Browser pages regain normal wheel and trackpad scrolling in Off and
  released-Key modes.
- **Positive:** Unfocused Browser content no longer interrupts spatial canvas navigation.
- **Positive:** Pinch and `Cmd/Ctrl + scroll` retain focal-point canvas zoom even when the Browser
  owns ordinary page scroll.
- **Positive:** A canvas gesture that starts inside Browser content can continue outside its former
  native bounds, and a canvas-origin gesture can continue into them.
- **Positive:** Summary-threshold transitions no longer masquerade as Browser removal.
- **Negative / Risk:** Sequence-start `sendSync` blocks the Browser renderer while main decides.
- **Mitigation:** It occurs only once after 250 ms idle, performs bounded validation/state changes,
  and never waits for screenshot capture or other asynchronous work.
- **Negative / Risk:** Ownership remains temporarily latched after focus or override changes.
- **Mitigation:** This is intentional gesture stability; the next sequence observes the new state
  after the documented idle interval.
- **Negative / Risk:** Canvas-owned Browser input briefly freezes visual page pixels.
- **Mitigation:** The bounded same-tab cached frame remains visible and native content returns
  before the DOM freeze is deactivated.
- **Negative / Risk:** A malicious or broken frame could attempt malformed IPC updates.
- **Mitigation:** The isolated preload accepts only trusted wheel input, main validates the active
  sender and schema, and invalid/stale generations fail closed.

## 7. Assumptions

- Electron continues to deliver trusted DOM `wheel` to registered `frame` preloads before page
  scripts and default page scroll.
- Electron synchronous IPC sets `event.returnValue` before `ipcRenderer.sendSync` returns.
- Browser native `before-mouse-event` precedes the corresponding DOM wheel often enough to record
  an event-local point; the system cursor fallback remains in the same DIP coordinate space.
- Hiding the parent `clipView` synchronously removes its child `WebContentsView` from hit testing on
  supported platforms.
- A 250 ms idle interval covers trackpad momentum segmentation without making ownership feel
  sticky between intentional gestures.

If the Browser page scrolls after the preload records a canvas decision, one physical event creates
multiple relays, or runtime logs show the native parent visible during a latched collision, this
decision is falsified and requires a lower-level Electron input investigation.

## 8. References

- [Electron `ipcRenderer.sendSync`](https://www.electronjs.org/docs/latest/api/ipc-renderer#ipcrenderersendsyncchannel-args)
- [Electron `session.registerPreloadScript`](https://www.electronjs.org/docs/latest/api/session#sesregisterpreloadscriptscript)
- [Electron `before-mouse-event`](https://www.electronjs.org/docs/latest/api/web-contents#event-before-mouse-event)
- [Electron issue #32751: Trackpad scrolling stops when crossing BrowserView](https://github.com/electron/electron/issues/32751)
- [Superseded frame-preload ADR](./ADR-20260808-browser-wheel-frame-preload.md)
- [Amended freeze ADR](./ADR-20260808-freeze-native-browser-during-cross-surface-wheel.md)

## 9. Validation

- Unit tests cover the complete focus/mode/override/modifier matrix, page/canvas ownership, 250 ms
  latching, generation changes, stale updates, delta modes, modifiers, both axes, and malformed
  input.
- Source integration tests require conditional preload cancellation, synchronous decision IPC,
  separate logical-focus IPC, native wheel-point capture, Browser-origin sequence arming,
  placeholder preservation, and hidden-surface reset.
- Freeze tests cover exact boundary geometry, clipping, all pan directions, reversal, guard,
  timeout, stale capture generation, same-tab fallback, and bounded JPEG encoding.
- Electron smoke verifies focused plain-wheel page scroll, unfocused canvas relay without page
  scroll, modified wheel canvas relay, both cross-surface canvas directions, and
  `native -> placeholder -> native` continuity. Tab-scoped top-frame to nested-iframe ownership
  latching is deterministic coverage because Electron's synthetic input API does not reliably
  target a child frame inside a `WebContentsView` on all release platforms.
- Release validation covers macOS trackpad scroll/pinch and mouse wheel, Windows Precision
  Touchpad/mouse wheel, and Linux/libinput over focused/unfocused Browser content, nested frames,
  scrollbar drag, keyboard scroll, four crossing directions, diagonal/reverse motion, and semantic
  summary zoom.

Temporary runtime logging remains until live testing confirms page scroll, Browser-to-canvas,
canvas-to-Browser, and zoom-through-summary behavior. Removing those logs is a separate finishing
change after confirmation.

## 10. Confidence and Reversibility

Confidence is medium until the four physical trackpad scenarios pass with runtime logging. The
policy is covered by pure tests and the routing boundaries by Electron smoke, but operating-system
gesture targeting and momentum still require manual release validation.

The change is reversible at the policy layer by returning the frame preload to unconditional
canvas cancellation. The tab-scoped sequence and surface-state model are isolated from persisted
settings and the public Browser canvas event contract. Reversal would knowingly restore the
focused-page scrolling regression documented here.
