import assert from "node:assert/strict";
import test from "node:test";
import { shouldCopyTerminalSelection } from "../src/renderer/src/features/terminal/terminalShortcuts.ts";

const keydown = {
  type: "keydown",
  key: "c",
  ctrlKey: false,
  shiftKey: false,
  metaKey: false,
  altKey: false
};

test("copies a terminal selection with platform copy shortcuts", () => {
  assert.equal(shouldCopyTerminalSelection({ ...keydown, ctrlKey: true, shiftKey: true }, true), true);
  assert.equal(shouldCopyTerminalSelection({ ...keydown, ctrlKey: true, shiftKey: true, key: "C" }, true), true);
  assert.equal(shouldCopyTerminalSelection({ ...keydown, metaKey: true }, true), true);
});

test("leaves control-c and unrelated chords to the PTY", () => {
  assert.equal(shouldCopyTerminalSelection({ ...keydown, ctrlKey: true }, true), false);
  assert.equal(shouldCopyTerminalSelection({ ...keydown, ctrlKey: true }, false), false);
  assert.equal(shouldCopyTerminalSelection({ ...keydown, ctrlKey: true, key: "Insert" }, true), false);
  assert.equal(shouldCopyTerminalSelection({ ...keydown, ctrlKey: true, altKey: true }, true), false);
  assert.equal(shouldCopyTerminalSelection({ ...keydown, ctrlKey: true, key: "v" }, true), false);
  assert.equal(shouldCopyTerminalSelection({ ...keydown, ctrlKey: true, type: "keyup" }, true), false);
});
