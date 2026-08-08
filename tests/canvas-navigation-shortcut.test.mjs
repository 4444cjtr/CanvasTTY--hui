import assert from "node:assert/strict";
import test from "node:test";
import {
  canvasNavigationBindingConflicts,
  activeCanvasWheelBinding,
  canvasWheelBindingConflicts,
  isCanvasNavigationBindingActive,
  normalizeCanvasNavigationBinding,
  normalizeCanvasWheelBinding,
  normalizeCanvasNavigationInputKey,
  parseCanvasNavigationBinding,
  shouldCaptureWidgetWheel
} from "../src/shared/canvasNavigation.ts";

test("accepts modifier-only and modifier-based chords but rejects bare keys", () => {
  assert.deepEqual(parseCanvasNavigationBinding("Alt"), { modifiers: ["Alt"], key: null });
  assert.deepEqual(parseCanvasNavigationBinding("Alt+Ctrl+Space"), {
    modifiers: ["Ctrl", "Alt"],
    key: "Space"
  });
  assert.equal(parseCanvasNavigationBinding("Space"), null);
});

test("wheel capture modes keep Off, On, Key, and full navigation ownership distinct", () => {
  assert.equal(activeCanvasWheelBinding("off", "Meta"), null);
  assert.equal(activeCanvasWheelBinding("always", "Meta"), null);
  assert.equal(activeCanvasWheelBinding("key", "Meta"), "Meta");
  assert.equal(shouldCaptureWidgetWheel("off", true, false), false);
  assert.equal(shouldCaptureWidgetWheel("always", false, false), true);
  assert.equal(shouldCaptureWidgetWheel("key", false, false), false);
  assert.equal(shouldCaptureWidgetWheel("key", true, false), true);
  assert.equal(shouldCaptureWidgetWheel("off", false, true), true);
});

test("normalizes order and accepts the platform zoom modifier by itself", () => {
  assert.equal(normalizeCanvasNavigationBinding("Alt+Ctrl", "darwin"), "Ctrl+Alt");
  assert.equal(normalizeCanvasNavigationBinding("Meta", "darwin"), "Meta");
  assert.equal(normalizeCanvasNavigationBinding("Ctrl", "other"), "Ctrl");
  assert.equal(normalizeCanvasNavigationBinding("Ctrl+Alt", "other"), "Ctrl+Alt");
});

test("wheel override accepts the platform zoom modifier by itself", () => {
  assert.equal(normalizeCanvasWheelBinding("Meta", "darwin"), "Meta");
  assert.equal(normalizeCanvasWheelBinding("Ctrl", "other"), "Ctrl");
  assert.equal(normalizeCanvasNavigationBinding("Meta", "darwin"), "Meta");
  assert.equal(normalizeCanvasNavigationBinding("Ctrl", "other"), "Ctrl");
});

test("extra modifiers keep a configured override active", () => {
  assert.equal(isCanvasNavigationBindingActive({
    altKey: true,
    ctrlKey: false,
    metaKey: true,
    shiftKey: false
  }, "Alt"), true);
  assert.equal(isCanvasNavigationBindingActive({
    altKey: true,
    ctrlKey: true,
    metaKey: false,
    shiftKey: false,
    pressedKeys: new Set(["Space"])
  }, "Alt+Space"), true);
});

test("modifier-only overrides coexist with action shortcuts while ordinary chords conflict", () => {
  assert.equal(canvasNavigationBindingConflicts("Alt", "Alt+R"), false);
  assert.equal(canvasNavigationBindingConflicts("Alt+K", "Ctrl+Alt+K"), true);
  assert.equal(canvasNavigationBindingConflicts("Alt+K", "Alt+R"), false);
  assert.equal(normalizeCanvasNavigationBinding("Alt", "darwin", ["Alt+R"]), "Alt");
  assert.equal(normalizeCanvasNavigationBinding("Meta+H", "darwin", ["Meta+H"]), null);
});

test("modifier-only wheel overrides coexist with keyboard shortcuts", () => {
  assert.equal(canvasWheelBindingConflicts("Meta", "Meta+H"), false);
  assert.equal(canvasWheelBindingConflicts("Ctrl", "Ctrl+R"), false);
  assert.equal(canvasWheelBindingConflicts("Meta+Space", "Meta+Space"), true);
  assert.equal(normalizeCanvasWheelBinding("Meta", "darwin", ["Meta+H"]), "Meta");
  assert.equal(normalizeCanvasWheelBinding("Meta+Space", "darwin", ["Meta+Space"]), null);
});

test("normalizes ordinary chord keys by physical code across keyboard layouts", () => {
  assert.equal(normalizeCanvasNavigationInputKey("ф", "KeyA"), "A");
  assert.equal(normalizeCanvasNavigationInputKey("˚", "KeyK"), "K");
  assert.equal(normalizeCanvasNavigationInputKey(" ", "Space"), "Space");
});
