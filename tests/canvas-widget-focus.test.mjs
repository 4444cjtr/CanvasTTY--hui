import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  browserCanvasWidgetId,
  canvasWidgetFocusAfterClick,
  homeCanvasWidgetId,
  pluginCanvasWidgetId,
  terminalCanvasWidgetId
} from "../src/renderer/src/features/workspace/canvasWidgetFocus.ts";

const workspacePath = new URL(
  "../src/renderer/src/features/workspace/WorkspaceCanvas.tsx",
  import.meta.url
);
const terminalPath = new URL(
  "../src/renderer/src/features/terminal/TerminalCard.tsx",
  import.meta.url
);
const browserPath = new URL(
  "../src/renderer/src/features/browser/BrowserCard.tsx",
  import.meta.url
);

test("canvas widget ids are stable across each focusable input surface", () => {
  assert.equal(terminalCanvasWidgetId("pty-1"), "terminal:pty-1");
  assert.equal(pluginCanvasWidgetId("canvas-1"), "plugin-canvas:canvas-1");
  assert.equal(homeCanvasWidgetId("core.sessions"), "home:core.sessions");
  assert.equal(browserCanvasWidgetId, "browser");
});

test("only a click outside every widget clears logical input focus", () => {
  assert.equal(canvasWidgetFocusAfterClick("terminal:one", {
    isWidget: true,
    focusableWidgetId: "browser"
  }), "browser");
  assert.equal(canvasWidgetFocusAfterClick("terminal:one", {
    isWidget: true,
    focusableWidgetId: null
  }), "terminal:one");
  assert.equal(canvasWidgetFocusAfterClick("terminal:one", {
    isWidget: false,
    focusableWidgetId: null
  }), null);
});

test("workspace keeps wheel focus independent from selection and transfers it after hover delay", async () => {
  const [workspace, terminal, browser] = await Promise.all([
    readFile(workspacePath, "utf8"),
    readFile(terminalPath, "utf8"),
    readFile(browserPath, "utf8")
  ]);

  assert.match(workspace, /const \[widgetFocus, setWidgetFocus\] = useState/);
  assert.match(workspace, /HOVER_FOCUS_DELAYS\[settingsRef\.current\.hoverFocusSpeed\]/);
  assert.match(workspace, /canvasWidgetFocusAfterClick/);
  assert.match(workspace, /overFocusedWidget/);
  assert.match(workspace, /focused=\{widgetFocus\.id === terminalCanvasWidgetId\(session\.id\)\}/);
  assert.match(workspace, /focused=\{widgetFocus\.id === browserCanvasWidgetId\}/);
  assert.match(workspace, /if \(activeSessionId !== null\) focusWidget\(terminalCanvasWidgetId\(activeSessionId\), "explicit"\)/);
  assert.match(workspace, /if \(browserSelected\) focusWidget\(browserCanvasWidgetId, "explicit"\)/);
  assert.match(terminal, /focused: boolean/);
  assert.match(terminal, /if \(focused && !renaming && !summaryMode\) terminal\.focus\(\)/);
  assert.doesNotMatch(terminal, /if \(selected && !renaming && !summaryMode\) terminal\.focus\(\)/);
  assert.match(browser, /focused: boolean/);
  assert.match(browser, /if \(!focused \|\| !nativeViewVisible\) return/);
});

test("hover leave only cancels a pending focus transfer and never clears assigned focus", async () => {
  const workspace = await readFile(workspacePath, "utf8");
  assert.match(workspace, /cancelWidgetHoverFocus/);
  assert.doesNotMatch(workspace, /onPointerLeave=\{scheduleHoverBlur\}/);
  assert.doesNotMatch(workspace, /setWidgetFocus\([^)]*null[^)]*hover/);
});

test("canvas drag does not masquerade as the outside click that clears focus", async () => {
  const workspace = await readFile(workspacePath, "utf8");
  assert.match(workspace, /state\.moved = true/);
  assert.match(workspace, /suppressClick: override/);
  assert.match(workspace, /if \(state\.moved \|\| state\.suppressClick\)/);
  assert.match(workspace, /if \(suppressCanvasClick\.current\) \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?event\.stopPropagation\(\);/);
});
