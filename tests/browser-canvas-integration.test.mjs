import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { BROWSER_CANVAS_WHEEL_IDLE_MS } from "../src/main/services/browser/BrowserCanvasFreeze.ts";
import { HOVER_FOCUS_DELAYS, shouldActivateCanvasFromClick } from "../src/renderer/src/features/workspace/focus.ts";

const source = (path) => readFile(new URL(path, import.meta.url), "utf8");

test("browser and terminal share canvas focus activation semantics", () => {
  assert.equal(shouldActivateCanvasFromClick("single", 1), true);
  assert.equal(shouldActivateCanvasFromClick("single", 2), false);
  assert.equal(shouldActivateCanvasFromClick("double", 1), false);
  assert.equal(shouldActivateCanvasFromClick("double", 2), true);
  assert.equal(shouldActivateCanvasFromClick("off", 1), false);
  assert.deepEqual(HOVER_FOCUS_DELAYS, { slow: 500, normal: 250, fast: 80 });
});

test("BrowserService composes canvas gesture and pointer modules without owning their state", async () => {
  const service = await source("../src/main/services/BrowserService.ts");

  assert.match(service, /new BrowserCanvasGestureController\(/);
  assert.match(service, /new BrowserCanvasPointerRouter\(/);
  assert.match(service, /this\.canvasGestures\.surfaceDecision\(/);
  assert.match(service, /this\.canvasPointers\.handleBrowserMouse\(/);
  assert.match(service, /this\.canvasPointers\.handleOwnerMouse\(/);
});

test("browser native input participates in selection and independent logical focus", async () => {
  const [card, service, workspace, focusHook] = await Promise.all([
    source("../src/renderer/src/features/browser/BrowserCard.tsx"),
    source("../src/main/services/BrowserService.ts"),
    source("../src/renderer/src/features/workspace/WorkspaceCanvas.tsx"),
    source("../src/renderer/src/features/workspace/useCanvasWidgetFocus.ts")
  ]);

  assert.match(service, /contents\.on\("before-mouse-event"/);
  assert.match(service, /if \(pointerType === "down"\) \{[\s\S]*?contents\.focus\(\);[\s\S]*?this\.setInputFocused\(true\)/);
  assert.match(card, /window\.canvasTTY\.browser\.onCanvasPointer/);
  assert.match(card, /browser-card--selected/);
  assert.match(workspace, /selected=\{browserSelected\}/);
  assert.match(workspace, /focusActivation=\{settings\.focusActivation\}/);
  assert.match(workspace, /focusController\.focusBrowser/);
  assert.match(focusHook, /HOVER_FOCUS_DELAYS\[settingsRef\.current\.hoverFocusSpeed\]/);
  assert.match(focusHook, /canvasWidgetFocusAfterClick/);
  assert.doesNotMatch(card, /captureCanvasWheelOverWidgets/);
});

test("native Browser layout remains a BrowserService responsibility", async () => {
  const [card, service, styles] = await Promise.all([
    source("../src/renderer/src/features/browser/BrowserCard.tsx"),
    source("../src/main/services/BrowserService.ts"),
    source("../src/renderer/src/styles/app.css")
  ]);

  assert.doesNotMatch(card, /canvasMoving|manipulating|browser-card__motion-surface/);
  assert.match(card, /const rect = element\.getBoundingClientRect\(\);\s*const state = viewportState\.current;\s*window\.canvasTTY\.browser\.setViewport/);
  assert.match(service, /if \(this\.clipTabId !== active\.id\)/);
  assert.match(service, /this\.applyPageScale\(active\)/);
  assert.match(service, /contents\.setZoomFactor\(pageScale\)/);
  assert.match(styles, /\.browser-card__viewport \{[^}]*inset: 140px 8px 8px;[^}]*background: #272934;/);
});

test("cross-surface freeze is wired through a canvas-owned DOM surface", async () => {
  const [card, service, gesture, wheelHook, styles, contracts] = await Promise.all([
    source("../src/renderer/src/features/browser/BrowserCard.tsx"),
    source("../src/main/services/BrowserService.ts"),
    source("../src/main/services/browser/BrowserCanvasGestureController.ts"),
    source("../src/renderer/src/features/workspace/useCanvasWheelNavigation.ts"),
    source("../src/renderer/src/styles/app.css"),
    source("../src/shared/contracts.ts")
  ]);

  assert.match(contracts, /interface BrowserCanvasFreezeFrameEvent/);
  assert.match(service, /canvasSurface\.kind === "sink"/);
  assert.match(gesture, /createBrowserCanvasNativeWheelSink/);
  assert.match(gesture, /browserCanvasNativeWheelSinkLayout/);
  assert.match(card, /browser-card__freeze-frame/);
  assert.match(card, /data-browser-canvas-wheel-owner=\{freezeFrameVisible \? "canvas" : undefined\}/);
  assert.match(wheelHook, /data-browser-canvas-wheel-owner="canvas"/);
  assert.match(styles, /\.browser-card__freeze-frame/);
});

test("Browser preload arbitrates one synchronous owner per 250 ms sequence", async () => {
  const [preload, vite, ipc, contracts] = await Promise.all([
    source("../src/preload/browser.ts"),
    source("../electron.vite.config.ts"),
    source("../src/main/ipc/registerIpc.ts"),
    source("../src/shared/contracts.ts")
  ]);

  assert.equal(BROWSER_CANVAS_WHEEL_IDLE_MS, 250);
  assert.match(vite, /browser: resolve\("src\/preload\/browser\.ts"\)/);
  assert.match(preload, /const BROWSER_PAGE_WHEEL_IDLE_MS = 250/);
  assert.match(preload, /ipcRenderer\.sendSync\(BROWSER_PAGE_WHEEL_DECISION_CHANNEL/);
  assert.match(preload, /if \(decision\.owner === "canvas"\) \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.stopImmediatePropagation\(\);/);
  assert.match(ipc, /ipcMain\.on\(IPC\.browserPageWheelDecision[\s\S]*?event\.returnValue = browser\.decidePageWheel/);
  assert.match(contracts, /browserPageWheelDecision: "browser:page-wheel-decision"/);
  assert.doesNotMatch(preload, /shared\/contracts/);
});

test("Browser logical focus is synchronized separately from viewport geometry", async () => {
  const [card, service, preload, ipc, contracts] = await Promise.all([
    source("../src/renderer/src/features/browser/BrowserCard.tsx"),
    source("../src/main/services/BrowserService.ts"),
    source("../src/preload/index.ts"),
    source("../src/main/ipc/registerIpc.ts"),
    source("../src/shared/contracts.ts")
  ]);

  assert.match(contracts, /setInputFocused\(focused: boolean\): void/);
  assert.match(preload, /setInputFocused: \(focused: boolean\)[\s\S]*?sendSync\(IPC\.browserSetInputFocused/);
  assert.match(ipc, /ipcMain\.on\(IPC\.browserSetInputFocused[\s\S]*?browser\.setInputFocused/);
  assert.match(card, /useLayoutEffect\(\(\) => \{[\s\S]*?setInputFocused\(focused\)/);
  assert.match(service, /setInputFocused\(focused: boolean\)/);
});

test("Browser placeholder remains canvas-owned while the live native surface is conditional", async () => {
  const [card, contracts, gesture] = await Promise.all([
    source("../src/renderer/src/features/browser/BrowserCard.tsx"),
    source("../src/shared/contracts.ts"),
    source("../src/main/services/browser/BrowserCanvasGestureController.ts")
  ]);

  assert.match(contracts, /type BrowserViewportSurface = "native" \| "placeholder" \| "hidden"/);
  assert.match(card, /data-browser-canvas-wheel-owner=\{surface !== "native" \|\| freezeFrameVisible/);
  assert.match(gesture, /if \(next\.surface === "hidden"\)/);
  assert.doesNotMatch(gesture, /viewport-hidden/);
});

test("browser tab chrome highlights only the active tab", async () => {
  const [card, styles] = await Promise.all([
    source("../src/renderer/src/features/browser/BrowserCard.tsx"),
    source("../src/renderer/src/styles/app.css")
  ]);

  assert.match(card, /tab\.id === browser\.activeTabId \? "browser-card__tab--active" : ""/);
  assert.match(styles, /\.browser-card__tab \{[^}]*background: rgba\(255,255,255,\.025\);/);
  assert.match(styles, /\.browser-card__tab--active \{[^}]*background: rgba\(255,255,255,\.13\);/);
});

test("browser window actions are separated from tab actions and use the Lucide globe", async () => {
  const [card, icon] = await Promise.all([
    source("../src/renderer/src/features/browser/BrowserCard.tsx"),
    source("../src/renderer/src/components/UiIcon.tsx")
  ]);

  const headerStart = card.indexOf('className="browser-card__header"');
  const tabsStart = card.indexOf('className="browser-card__tabs"');
  assert.ok(headerStart >= 0 && tabsStart > headerStart);
  assert.match(card.slice(headerStart, tabsStart), /className="browser-card__hide"/);
  assert.doesNotMatch(card.slice(tabsStart, card.indexOf("<nav", tabsStart)), /browser-card__hide/);
  assert.match(icon, /globe\.svg/);
});
