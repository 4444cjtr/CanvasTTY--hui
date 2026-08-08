import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workspacePath = new URL(
  "../src/renderer/src/features/workspace/WorkspaceCanvas.tsx",
  import.meta.url
);
const wheelNavigationPath = new URL(
  "../src/renderer/src/features/workspace/useCanvasWheelNavigation.ts",
  import.meta.url
);
const pointerNavigationPath = new URL(
  "../src/renderer/src/features/workspace/useCanvasPointerNavigation.ts",
  import.meta.url
);
const browserPointerRouterPath = new URL(
  "../src/main/services/browser/BrowserCanvasPointerRouter.ts",
  import.meta.url
);
const terminalAdapterPath = new URL(
  "../src/renderer/src/features/terminal/terminalMouseCoordinates.ts",
  import.meta.url
);
const pluginFramePath = new URL(
  "../src/renderer/src/features/plugins/PluginFrame.tsx",
  import.meta.url
);
const browserServicePath = new URL("../src/main/services/BrowserService.ts", import.meta.url);
const preloadPath = new URL("../src/preload/index.ts", import.meta.url);
const ipcPath = new URL("../src/main/ipc/registerIpc.ts", import.meta.url);
const stylesPath = new URL("../src/renderer/src/styles/app.css", import.meta.url);
const shortcutEditorPath = new URL(
  "../src/renderer/src/features/settings/CanvasNavigationShortcutEditor.tsx",
  import.meta.url
);
const settingsPanelPath = new URL(
  "../src/renderer/src/features/settings/SettingsPanel.tsx",
  import.meta.url
);
const homeZonePath = new URL(
  "../src/renderer/src/features/home/HomeZone.tsx",
  import.meta.url
);

test("workspace decides wheel ownership in a non-passive capture listener", async () => {
  const source = await readFile(wheelNavigationPath, "utf8");
  assert.match(source, /addEventListener\("wheel", handleWheel, \{ capture: true, passive: false \}\)/);
  assert.ok(source.indexOf("shouldCanvasOwnWheel") < source.indexOf("event.preventDefault()"));
  assert.match(source, /flushPan\(\);\s*zoomAt/);
  assert.match(source, /requestAnimationFrame\(flushPan\)/);
});

test("xterm skips coordinate wheel adaptation before the workspace consumes canvas-owned wheel", async () => {
  const [source, workspace] = await Promise.all([
    readFile(terminalAdapterPath, "utf8"),
    readFile(workspacePath, "utf8")
  ]);
  assert.match(source, /if \(shouldRouteWheelToCanvas\(\)\) return;/);
  assert.match(source, /screen\.addEventListener\("wheel", handleWheelEvent/);
  assert.doesNotMatch(source, /ownerDocument\.addEventListener\("wheel"/);
  assert.match(workspace, /routeWidgetWheelToCanvas \|\| widgetFocus\.id !== terminalCanvasWidgetId\(session\.id\)/);
});

test("plugin wheel relay is policy-gated and full override disables only iframe hit testing", async () => {
  const [frame, styles] = await Promise.all([
    readFile(pluginFramePath, "utf8"),
    readFile(stylesPath, "utf8")
  ]);
  assert.match(frame, /if \(!captureCanvasWheelOverWidgets\) return;/);
  assert.match(styles, /\.workspace--canvas-override \.plugin-frame \{ pointer-events: none; \}/);
  assert.match(styles, /\.workspace--canvas-override,\s*\.workspace--canvas-override \* \{ cursor: grab !important; \}/);
  assert.match(styles, /\.workspace--panning,\s*\.workspace--panning \* \{ cursor: grabbing !important; \}/);
  assert.doesNotMatch(styles, /^\.plugin-frame \{[^}]*pointer-events: none/m);
  assert.match(frame, /pluginCanvasFocusInput/);
  assert.match(frame, /onFocus\(\)/);
  assert.match(frame, /onHoverChange\(true\)/);
  assert.match(frame, /onHoverChange\(false\)/);
});

test("only input-bearing home widgets opt into logical wheel focus", async () => {
  const source = await readFile(homeZonePath, "utf8");
  assert.match(source, /data-canvas-widget-id=\{homeCanvasWidgetId\(placement\.widgetId\)\}/);
  assert.match(source, /data-canvas-widget-focusable=\{isFocusableHomeWidget\(placement\.widgetId, plugins\) \? "true" : undefined\}/);
  assert.match(source, /if \(widgetId === "core\.sessions"\) return true/);
  assert.match(source, /if \(!widgetId\.startsWith\("plugin:"\)\) return false/);
});

test("native Browser override pointer capture precedes ordinary Browser focus", async () => {
  const [service, router] = await Promise.all([
    readFile(browserServicePath, "utf8"),
    readFile(browserPointerRouterPath, "utf8")
  ]);
  const routing = service.indexOf("this.canvasPointers.handleBrowserMouse");
  const focus = service.indexOf('if (pointerType === "down") {', routing);
  assert.ok(routing >= 0 && focus > routing);
  assert.match(router, /browserCanvasNavigationPointerType\(/);
  assert.match(router, /event\.preventDefault\(\);\s*this\.host\.sendNavigationPointer/);
  assert.match(service.slice(focus), /contents\.focus\(\);\s*this\.setInputFocused\(true\)/);
});

test("canvas pan stays latched while crossing the native Browser boundary", async () => {
  const [pointerNavigation, preload, ipc] = await Promise.all([
    readFile(pointerNavigationPath, "utf8"),
    readFile(preloadPath, "utf8"),
    readFile(ipcPath, "utf8")
  ]);
  assert.match(pointerNavigation, /setPointerGestureActive\(true\)/);
  assert.match(pointerNavigation, /setPointerGestureActive\(false\)/);
  assert.match(pointerNavigation, /if \(panState\.current && event\.type !== "down"\) \{[\s\S]*?event\.type === "move"[\s\S]*?panTo\(event\.clientX, event\.clientY\)/);
  assert.match(preload, /setPointerGestureActive: \(active: boolean\) => ipcRenderer\.send/);
  assert.match(ipc, /browser\.setRendererCanvasGestureActive\(active\)/);
});

test("navigation shortcut editor suspends the active binding and captures both chord forms", async () => {
  const [source, settings] = await Promise.all([
    readFile(shortcutEditorPath, "utf8"),
    readFile(settingsPanelPath, "utf8")
  ]);
  assert.match(source, /setShortcutCaptureActive\(true\)/);
  assert.match(source, /if \(event\.key === "Escape"\)/);
  assert.match(source, /commitInFlight\.current/);
  assert.match(source, /stopCapture\(\);\s*try \{\s*await onChange\(normalized\)/);
  assert.match(source, /allowDisable/);
  assert.match(settings, /value=\{settings\.canvasWheelCaptureMode\}/);
  assert.match(settings, /\[\["off", "Off"\], \["always", "On"\], \["key", "Key"\]\]/);
  assert.match(settings, /settings\.canvasWheelCaptureMode === "key"/);
  assert.match(settings, /binding=\{settings\.canvasWheelOverride\}/);
  assert.match(settings, /allowDisable=\{false\}/);
  assert.match(settings, /binding=\{settings\.canvasNavigationOverride\}/);
  assert.match(settings, /canvasOverrideBindingsMatch/);
});
