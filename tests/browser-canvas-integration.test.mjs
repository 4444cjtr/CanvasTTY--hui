import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HOVER_FOCUS_DELAYS, shouldActivateCanvasFromClick } from "../src/renderer/src/features/workspace/focus.ts";

const browserCardPath = new URL("../src/renderer/src/features/browser/BrowserCard.tsx", import.meta.url);
const browserServicePath = new URL("../src/main/services/BrowserService.ts", import.meta.url);
const browserPreloadPath = new URL("../src/preload/browser.ts", import.meta.url);
const browserSinkViewportPath = new URL("../src/main/services/browser/BrowserCanvasSinkViewport.ts", import.meta.url);
const electronVitePath = new URL("../electron.vite.config.ts", import.meta.url);
const ipcPath = new URL("../src/main/ipc/registerIpc.ts", import.meta.url);
const contractsPath = new URL("../src/shared/contracts.ts", import.meta.url);
const workspacePath = new URL("../src/renderer/src/features/workspace/WorkspaceCanvas.tsx", import.meta.url);
const iconPath = new URL("../src/renderer/src/components/UiIcon.tsx", import.meta.url);
const stylesPath = new URL("../src/renderer/src/styles/app.css", import.meta.url);

test("browser and terminal share canvas focus activation semantics", () => {
  assert.equal(shouldActivateCanvasFromClick("single", 1), true);
  assert.equal(shouldActivateCanvasFromClick("single", 2), false);
  assert.equal(shouldActivateCanvasFromClick("double", 1), false);
  assert.equal(shouldActivateCanvasFromClick("double", 2), true);
  assert.equal(shouldActivateCanvasFromClick("off", 1), false);
  assert.deepEqual(HOVER_FOCUS_DELAYS, { slow: 500, normal: 250, fast: 80 });
});

test("browser native input participates in selection and independent logical focus", async () => {
  const [card, service, workspace] = await Promise.all([
    readFile(browserCardPath, "utf8"),
    readFile(browserServicePath, "utf8"),
    readFile(workspacePath, "utf8")
  ]);

  assert.match(service, /contents\.on\("before-mouse-event"/);
  assert.match(service, /if \(pointerType === "down"\) \{[\s\S]*?contents\.focus\(\);[\s\S]*?this\.setInputFocused\(true\)/);
  assert.match(service, /IPC\.browserCanvasPointer/);
  assert.match(service, /mouse\.type === "mouseMove" && this\.pointerTabId !== tab\.id/);
  assert.match(card, /window\.canvasTTY\.browser\.onCanvasPointer/);
  assert.match(card, /browser-card--selected/);
  assert.match(workspace, /selected=\{browserSelected\}/);
  assert.match(workspace, /focusActivation=\{settings\.focusActivation\}/);
  assert.match(workspace, /HOVER_FOCUS_DELAYS\[settingsRef\.current\.hoverFocusSpeed\]/);
  assert.match(workspace, /onWidgetFocus=\{focusBrowserWidget\}/);
  assert.match(workspace, /onWidgetHoverChange=\{hoverBrowserWidget\}/);
  assert.doesNotMatch(workspace, /captureCanvasWheelOverWidgets=.*browserCanvasWidgetId/);
  assert.doesNotMatch(card, /captureCanvasWheelOverWidgets/);
  assert.doesNotMatch(card, /captureCanvasWheel:/);
});

test("browser native view stays live while the canvas and card move", async () => {
  const [card, service, workspace, styles] = await Promise.all([
    readFile(browserCardPath, "utf8"),
    readFile(browserServicePath, "utf8"),
    readFile(workspacePath, "utf8"),
    readFile(stylesPath, "utf8")
  ]);

  assert.doesNotMatch(card, /canvasMoving|manipulating|browser-card__motion-surface/);
  assert.doesNotMatch(workspace, /cameraMoving|canvasMoving=/);
  assert.match(card, /\[camera\.x, camera\.y, position, reportViewport, showAgentPresence, size, surface, zoom\]/);
  assert.doesNotMatch(card, /viewportFrame|requestAnimationFrame\(\(\) => \{\s*viewportFrame/);
  assert.match(card, /const rect = element\.getBoundingClientRect\(\);\s*const state = viewportState\.current;\s*window\.canvasTTY\.browser\.setViewport/);
  assert.match(service, /if \(this\.clipTabId !== active\.id\)/);
  assert.match(service, /this\.applyPageScale\(active\)/);
  assert.match(service, /contents\.setZoomFactor\(pageScale\)/);
  assert.match(service, /contents\.on\("did-navigate",[\s\S]*?this\.applyPageScale\(tab\)/);
  assert.match(service, /contents\.on\("did-finish-load", \(\) => tab\.canvasCursor\.refresh\(\)\)/);
  assert.match(service, /setCanvasNavigationActive\(active: boolean\)/);
  assert.match(service, /canvasDragTabId === tab\.id/);
  assert.match(service, /cancelCanvasNavigationGesture\(\): void/);
  assert.match(styles, /\.browser-card__viewport \{[^}]*inset: 140px 8px 8px;[^}]*background: #272934;/);
});

test("cross-surface wheel collision exposes a canvas-owned Browser freeze frame", async () => {
  const [card, service, workspace, styles, contracts, preload, ipc] = await Promise.all([
    readFile(browserCardPath, "utf8"),
    readFile(browserServicePath, "utf8"),
    readFile(workspacePath, "utf8"),
    readFile(stylesPath, "utf8"),
    readFile(contractsPath, "utf8"),
    readFile(new URL("../src/preload/index.ts", import.meta.url), "utf8"),
    readFile(ipcPath, "utf8")
  ]);

  assert.match(contracts, /interface BrowserCanvasFreezeFrameEvent/);
  assert.match(contracts, /browserCanvasFreezeFrame: "browser:canvas-freeze-frame"/);
  assert.match(service, /mouse\.type === "mouseWheel"/);
  assert.match(service, /beginOwnerWheelSequence/);
  assert.match(service, /this\.clipView\.setVisible\(false\)/);
  assert.match(service, /browserCanvasNativeWheelSinkLayout/);
  assert.match(service, /this\.clipView\.setBounds\(sinkLayout\.clip\)[\s\S]*?active\.view\.setBounds\(sinkLayout\.view\)/);
  assert.match(card, /onCanvasFreezeFrame/);
  assert.match(card, /browser-card__freeze-frame/);
  assert.match(card, /data-browser-canvas-wheel-owner=\{freezeFrameVisible \? "canvas" : undefined\}/);
  assert.match(workspace, /data-browser-canvas-wheel-owner/);
  assert.match(styles, /\.browser-card__freeze-frame/);
  assert.match(preload, /sendSync\(IPC\.canvasNavigationOwnerWheel/);
  assert.match(ipc, /ipcMain\.on\(IPC\.canvasNavigationOwnerWheel[\s\S]*?assertMainRenderer[\s\S]*?event\.returnValue = true/);
  const applyStart = workspace.indexOf("const applyCanvasWheel");
  const intentStart = workspace.indexOf("const intent = canvasWheelIntent", applyStart);
  const armStart = workspace.indexOf("armOwnerWheelSequence", applyStart);
  assert.ok(applyStart >= 0 && armStart > applyStart && intentStart > armStart);
  assert.doesNotMatch(workspace.slice(applyStart, intentStart), /source !== "browser"/);
});

test("frozen Browser forwards ordinary pointer input but preserves full override ownership", async () => {
  const service = await readFile(browserServicePath, "utf8");
  const relayStart = service.indexOf("private relayFreezePointerFromOwner");
  const relayEnd = service.indexOf("private sendFreezePointerInput", relayStart);
  const relay = service.slice(relayStart, relayEnd);
  const senderStart = relayEnd;
  const senderEnd = service.indexOf("private cancelFreezePointerRelay", senderStart);
  const sender = service.slice(senderStart, senderEnd);

  assert.ok(relayStart >= 0 && relayEnd > relayStart && senderEnd > senderStart);
  assert.match(relay, /this\.canvasNavigationActive/);
  assert.match(relay, /this\.canvasNavigationInput\?\.active/);
  assert.match(relay, /this\.rendererCanvasGestureActive/);
  assert.match(relay, /event\.preventDefault\(\)/);
  assert.match(relay, /mouse\.type === "contextMenu"/);
  assert.match(relay, /this\.freezePointerRelay = \{/);
  assert.match(relay, /this\.endOwnerWheelSequence\("freeze-pointer-ended"\)/);
  assert.match(sender, /webContents\.sendInputEvent\(\{/);
  assert.match(sender, /mouse\.x - this\.viewport\.x/);
  assert.match(sender, /modifiers: mouse\.modifiers/);

  const sinkRelayStart = service.indexOf("private relayNativeWheelSinkPointerFromBrowser");
  const sinkRelayEnd = service.indexOf("private relayNativeWheelSinkPointerFromOwner", sinkRelayStart);
  const sinkRelay = service.slice(sinkRelayStart, sinkRelayEnd);
  assert.ok(sinkRelayStart >= 0 && sinkRelayEnd > sinkRelayStart);
  assert.match(sinkRelay, /event\.preventDefault\(\)/);
  assert.match(sinkRelay, /this\.endOwnerWheelSequence\("native-wheel-sink-pointer"\)/);
  assert.match(sinkRelay, /this\.viewport\.surface === "native" && this\.pointInsideViewport\(point\)/);
  assert.match(sinkRelay, /sendNativeWheelSinkPointerToBrowser/);
  assert.match(sinkRelay, /sendNativeWheelSinkPointerToOwner/);
});

test("freeze lifecycle resets on every native Browser boundary", async () => {
  const service = await readFile(browserServicePath, "utf8");

  assert.match(service, /owner\.on\("blur", \(\) => this\.endOwnerWheelSequence\("owner-blurred"\)\)/);
  assert.match(service, /this\.endOwnerWheelSequence\("viewport-removed", false\)/);
  assert.match(service, /this\.endOwnerWheelSequence\("active-tab-changed", false\)/);
  assert.match(service, /this\.endOwnerWheelSequence\("active-tab-navigation"\)/);
  assert.match(service, /this\.endOwnerWheelSequence\("active-tab-crashed", false\)/);
  assert.match(service, /this\.endOwnerWheelSequence\("service-disposed", false\)/);
  assert.match(service, /this\.freezeFrameStore\.invalidateCapture\(\)/);
});

test("native wheel sink preserves the logical page viewport while shrinking the physical surface", async () => {
  const [service, sinkViewport, card, preload, contracts, ipc] = await Promise.all([
    readFile(browserServicePath, "utf8"),
    readFile(browserSinkViewportPath, "utf8"),
    readFile(browserCardPath, "utf8"),
    readFile(browserPreloadPath, "utf8"),
    readFile(contractsPath, "utf8"),
    readFile(ipcPath, "utf8")
  ]);

  assert.doesNotMatch(contracts, /browserNativeWheelSinkVisibility/);
  assert.doesNotMatch(contracts, /browserNativeWheelSinkVisibilityAck/);
  assert.match(sinkViewport, /enableDeviceEmulation\(browserCanvasDeviceEmulationParameters\(viewport\)\)/);
  assert.match(sinkViewport, /disableDeviceEmulation\(\)/);
  assert.doesNotMatch(sinkViewport, /setBackgroundColor/);
  assert.match(service, /canvasSinkViewport\.preserve\([\s\S]*?\.viewport[\s\S]*?\)/);
  assert.match(service, /canvasSinkViewport\.restore\(\)/);
  assert.match(card, /\{freezeFrameDataUrl && \(/);
  assert.doesNotMatch(preload, /setNativeWheelSinkConcealed/);
  assert.doesNotMatch(preload, /documentElement[\s\S]*?opacity/);
  assert.doesNotMatch(ipc, /browserNativeWheelSinkVisibilityAck/);
});

test("native Browser decides wheel ownership synchronously and cancels only canvas-owned input", async () => {
  const [service, preload, electronVite, ipc, contracts] = await Promise.all([
    readFile(browserServicePath, "utf8"),
    readFile(browserPreloadPath, "utf8"),
    readFile(electronVitePath, "utf8"),
    readFile(ipcPath, "utf8"),
    readFile(contractsPath, "utf8")
  ]);

  assert.match(electronVite, /browser: resolve\("src\/preload\/browser\.ts"\)/);
  assert.match(service, /registerPreloadScript\(\{[\s\S]*?type: "frame"[\s\S]*?browser\.cjs/);
  assert.match(preload, /if \(!event\.isTrusted\) return;/);
  assert.match(preload, /const BROWSER_PAGE_WHEEL_DECISION_CHANNEL = "browser:page-wheel-decision"/);
  assert.match(preload, /ipcRenderer\.sendSync\(BROWSER_PAGE_WHEEL_DECISION_CHANNEL/);
  assert.doesNotMatch(preload, /shared\/contracts/);
  assert.match(preload, /if \(decision\.owner === "canvas"\) \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.stopImmediatePropagation\(\);/);
  assert.match(preload, /ipcRenderer\.send\(BROWSER_PAGE_WHEEL_CHANNEL/);
  assert.match(contracts, /browserPageWheelDecision: "browser:page-wheel-decision"/);
  assert.match(contracts, /browserPageWheel: "browser:page-wheel"/);
  assert.match(ipc, /ipcMain\.on\(IPC\.browserPageWheelDecision[\s\S]*?event\.returnValue = browser\.decidePageWheel/);
  assert.match(ipc, /ipcMain\.on\(IPC\.browserPageWheel[\s\S]*?browser\.handlePageWheel/);
  assert.match(service, /decidePageWheel\(sender: WebContents, input: unknown\)/);
  assert.match(service, /handlePageWheel\(sender: WebContents, input: unknown\)/);
  assert.match(service, /mouse\.type === "mouseWheel"[\s\S]*?browserWheelPoint =/);
  assert.match(preload, /screenX: event\.screenX/);
  assert.match(preload, /screenY: event\.screenY/);
  assert.match(preload, /clientX: event\.clientX/);
  assert.match(preload, /topFrame: window === window\.top/);
  assert.match(service, /const clientPoint = this\.browserWheelClientPoint\(tab\.id, owner, input\)/);
  const pageWheelRelay = service.slice(
    service.indexOf("handlePageWheel(sender: WebContents"),
    service.indexOf("beginRendererWheelSequence(input: unknown")
  );
  assert.doesNotMatch(pageWheelRelay, /screen\.getCursorScreenPoint\(\)/);
  assert.match(service, /browserPageWheelClientPoint/);

  const nativeHandler = service.slice(
    service.indexOf('contents.on("before-mouse-event"'),
    service.indexOf('contents.on("login"')
  );
  assert.doesNotMatch(nativeHandler, /IPC\.browserCanvasWheel/);
  assert.doesNotMatch(nativeHandler, /toCanvasWheelDeltas/);
  assert.doesNotMatch(`${service}\n${preload}\n${ipc}\n${contracts}`, /canvas-nav-runtime|runtime-debug|page-input-debug/);
});

test("Browser logical focus is synchronized separately from viewport geometry", async () => {
  const [card, service, preload, ipc, contracts] = await Promise.all([
    readFile(browserCardPath, "utf8"),
    readFile(browserServicePath, "utf8"),
    readFile(new URL("../src/preload/index.ts", import.meta.url), "utf8"),
    readFile(ipcPath, "utf8"),
    readFile(contractsPath, "utf8")
  ]);

  assert.match(contracts, /setInputFocused\(focused: boolean\): void/);
  assert.match(contracts, /browserSetInputFocused: "browser:set-input-focused"/);
  assert.match(preload, /setInputFocused: \(focused: boolean\)[\s\S]*?sendSync\(IPC\.browserSetInputFocused/);
  assert.match(ipc, /ipcMain\.on\(IPC\.browserSetInputFocused[\s\S]*?browser\.setInputFocused/);
  assert.match(card, /useLayoutEffect\(\(\) => \{[\s\S]*?setInputFocused\(focused\)/);
  assert.match(service, /setInputFocused\(focused: boolean\)/);
});

test("Browser-origin canvas wheel arms freeze and placeholder transitions preserve the sequence", async () => {
  const [card, service, workspace, contracts] = await Promise.all([
    readFile(browserCardPath, "utf8"),
    readFile(browserServicePath, "utf8"),
    readFile(workspacePath, "utf8"),
    readFile(contractsPath, "utf8")
  ]);

  assert.match(contracts, /type BrowserViewportSurface = "native" \| "placeholder" \| "hidden"/);
  assert.match(card, /surface: state\.surface/);
  assert.match(card, /data-browser-canvas-wheel-owner=\{surface !== "native" \|\| freezeFrameVisible/);
  const setViewport = service.slice(
    service.indexOf("setViewport(bounds: BrowserViewportBounds)"),
    service.indexOf("setCanvasNavigationActive(active: boolean)")
  );
  assert.match(setViewport, /normalized\.surface === "hidden"[\s\S]*?endOwnerWheelSequence\("viewport-removed", false\)/);
  assert.equal([...setViewport.matchAll(/endOwnerWheelSequence/g)].length, 1);
  assert.match(service, /source === "browser-frame-sync-ipc"[\s\S]*?createBrowserCanvasNativeWheelSink/);
  assert.match(service, /this\.nativeWheelSink = null;[\s\S]*?this\.freezeFrameActive = false/);
  assert.doesNotMatch(service, /endOwnerWheelSequence\("viewport-hidden"/);
  assert.doesNotMatch(workspace, /if \(source !== "browser"\)/);
});

test("browser tab chrome highlights only the active tab", async () => {
  const [card, styles] = await Promise.all([
    readFile(browserCardPath, "utf8"),
    readFile(stylesPath, "utf8")
  ]);

  assert.match(card, /tab\.id === browser\.activeTabId \? "browser-card__tab--active" : ""/);
  assert.match(styles, /\.browser-card__tab \{[^}]*background: rgba\(255,255,255,\.025\);/);
  assert.match(styles, /\.browser-card__tab--active \{[^}]*background: rgba\(255,255,255,\.13\);/);
});

test("browser window actions are separated from tab actions and use the Lucide globe", async () => {
  const [card, icon] = await Promise.all([
    readFile(browserCardPath, "utf8"),
    readFile(iconPath, "utf8")
  ]);

  const headerStart = card.indexOf('className="browser-card__header"');
  const tabsStart = card.indexOf('className="browser-card__tabs"');
  assert.ok(headerStart >= 0 && tabsStart > headerStart);
  assert.match(card.slice(headerStart, tabsStart), /className="browser-card__hide"/);
  assert.doesNotMatch(card.slice(tabsStart, card.indexOf("<nav", tabsStart)), /browser-card__hide/);
  assert.match(icon, /globe\.svg/);
  assert.doesNotMatch(icon, /browserIcon from "\.\.\/assets\/icons\/lucide\/focus\.svg"/);
});
