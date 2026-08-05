import assert from "node:assert/strict";
import test from "node:test";
import {
  matchesShortcut,
  shortcutFromKeyboardEvent
} from "../src/renderer/src/lib/shortcuts.ts";

const keyEvent = (key, modifiers = {}) => ({
  key,
  altKey: false,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  ...modifiers
});

test("captures plain defaults and canonical modifier order", () => {
  assert.equal(shortcutFromKeyboardEvent(keyEvent("Home")), "Home");
  assert.equal(shortcutFromKeyboardEvent(keyEvent("F2")), "F2");
  assert.equal(
    shortcutFromKeyboardEvent(keyEvent("r", { altKey: true, ctrlKey: true, shiftKey: true })),
    "Ctrl+Alt+Shift+R"
  );
});

test("ignores modifier-only and unsupported keys", () => {
  assert.equal(shortcutFromKeyboardEvent(keyEvent("Control", { ctrlKey: true })), null);
  assert.equal(shortcutFromKeyboardEvent(keyEvent("Unidentified")), null);
});

test("matches shortcuts without casing drift", () => {
  assert.equal(matchesShortcut(keyEvent("h", { ctrlKey: true }), "Ctrl+H"), true);
  assert.equal(matchesShortcut(keyEvent("h", { ctrlKey: true }), "Alt+H"), false);
});
