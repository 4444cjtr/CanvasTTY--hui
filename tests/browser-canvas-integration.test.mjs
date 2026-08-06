import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { HOVER_FOCUS_DELAYS, shouldActivateCanvasFromClick } from "../src/renderer/src/features/workspace/focus.ts";

const browserCardPath = new URL("../src/renderer/src/features/browser/BrowserCard.tsx", import.meta.url);
const browserServicePath = new URL("../src/main/services/BrowserService.ts", import.meta.url);
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

test("browser native input participates in canvas selection and hover focus", async () => {
  const [card, service, workspace] = await Promise.all([
    readFile(browserCardPath, "utf8"),
    readFile(browserServicePath, "utf8"),
    readFile(workspacePath, "utf8")
  ]);

  assert.match(service, /contents\.on\("before-mouse-event"/);
  assert.match(service, /IPC\.browserCanvasPointer/);
  assert.match(service, /mouse\.type === "mouseMove" && this\.pointerTabId !== tab\.id/);
  assert.match(card, /window\.canvasTTY\.browser\.onCanvasPointer/);
  assert.match(card, /browser-card--selected/);
  assert.match(workspace, /selected=\{browserSelected\}/);
  assert.match(workspace, /focusActivation=\{settings\.focusActivation\}/);
  assert.match(workspace, /hoverFocus=\{settings\.hoverFocus\}/);
  assert.match(workspace, /closest\("\.terminal-card, \.browser-card"\)/);
});

test("browser motion hides the native view and keeps a stable canvas surface", async () => {
  const [card, service, workspace, styles] = await Promise.all([
    readFile(browserCardPath, "utf8"),
    readFile(browserServicePath, "utf8"),
    readFile(workspacePath, "utf8"),
    readFile(stylesPath, "utf8")
  ]);

  assert.match(card, /&& !canvasMoving\s*&& !manipulating/);
  assert.match(card, /browser-card__motion-surface/);
  assert.match(workspace, /canvasMoving=\{cameraMoving \|\| panning\}/);
  assert.match(service, /if \(this\.clipTabId !== active\.id\)/);
  assert.match(styles, /\.browser-card__viewport \{[^}]*inset: 140px 8px 8px;[^}]*background: #272934;/);
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
