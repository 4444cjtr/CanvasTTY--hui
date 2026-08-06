import assert from "node:assert/strict";
import test from "node:test";
import {
  shouldCopyTerminalSelection,
  shouldPasteTerminalClipboard
} from "../src/renderer/src/features/terminal/terminalShortcuts.ts";

const keydown = {
  type: "keydown",
  key: "c",
  code: "KeyC",
  ctrlKey: false,
  shiftKey: false,
  metaKey: false,
  altKey: false
};

test("copies a terminal selection with platform copy shortcuts", () => {
  assert.equal(shouldCopyTerminalSelection({ ...keydown, ctrlKey: true }, true), true);
  assert.equal(shouldCopyTerminalSelection({ ...keydown, ctrlKey: true, shiftKey: true }, true), true);
  assert.equal(shouldCopyTerminalSelection({ ...keydown, ctrlKey: true, shiftKey: true, key: "C" }, true), true);
  assert.equal(shouldCopyTerminalSelection({ ...keydown, ctrlKey: true, shiftKey: true, key: "С" }, true), true);
  assert.equal(shouldCopyTerminalSelection({ ...keydown, metaKey: true }, true), true);
});

test("leaves control-c without a selection and unrelated chords to the PTY", () => {
  assert.equal(shouldCopyTerminalSelection({ ...keydown, ctrlKey: true }, false), false);
  assert.equal(shouldCopyTerminalSelection({ ...keydown, ctrlKey: true, key: "Insert", code: "Insert" }, true), false);
  assert.equal(shouldCopyTerminalSelection({ ...keydown, ctrlKey: true, altKey: true }, true), false);
  assert.equal(shouldCopyTerminalSelection({ ...keydown, ctrlKey: true, key: "v", code: "KeyV" }, true), false);
  assert.equal(shouldCopyTerminalSelection({ ...keydown, ctrlKey: true, type: "keyup" }, true), false);
});

test("pastes with terminal shortcuts independently of the active layout", () => {
  const paste = { ...keydown, key: "v", code: "KeyV" };

  assert.equal(shouldPasteTerminalClipboard({ ...paste, ctrlKey: true, shiftKey: true }), true);
  assert.equal(shouldPasteTerminalClipboard({ ...paste, key: "М", ctrlKey: true, shiftKey: true }), true);
  assert.equal(shouldPasteTerminalClipboard({ ...paste, metaKey: true }), true);
  assert.equal(shouldPasteTerminalClipboard({ ...paste, key: "Insert", code: "Insert", shiftKey: true }), true);
});

test("leaves literal control-v and unrelated paste chords to the PTY", () => {
  const paste = { ...keydown, key: "v", code: "KeyV" };

  assert.equal(shouldPasteTerminalClipboard({ ...paste, ctrlKey: true }), false);
  assert.equal(shouldPasteTerminalClipboard({ ...paste, ctrlKey: true, shiftKey: true, altKey: true }), false);
  assert.equal(shouldPasteTerminalClipboard({ ...paste, ctrlKey: true, shiftKey: true, type: "keyup" }), false);
});
