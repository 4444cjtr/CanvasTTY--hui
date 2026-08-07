import assert from "node:assert/strict";
import test from "node:test";
import {
  SHIFT_ENTER_SEQUENCE,
  shouldCopyTerminalSelection,
  shouldPasteTerminalClipboard,
  shouldRestartExitedTerminal,
  shouldScrollTerminalPage,
  shouldSendTerminalLineBreak
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

test("encodes shift-enter as a modified terminal enter key", () => {
  const enter = { ...keydown, key: "Enter", code: "Enter" };

  assert.equal(shouldSendTerminalLineBreak({ ...enter, shiftKey: true }), true);
  assert.equal(shouldSendTerminalLineBreak(enter), false);
  assert.equal(shouldSendTerminalLineBreak({ ...enter, shiftKey: true, ctrlKey: true }), false);
  assert.equal(shouldSendTerminalLineBreak({ ...enter, shiftKey: true, type: "keyup" }), false);
  assert.equal(SHIFT_ENTER_SEQUENCE, "\u001b[13;2u");
});

test("ctrl-d restarts only an exited terminal session", () => {
  const restart = { ...keydown, key: "d", code: "KeyD", ctrlKey: true };
  assert.equal(shouldRestartExitedTerminal(restart, true), true);
  assert.equal(shouldRestartExitedTerminal(restart, false), false);
  assert.equal(shouldRestartExitedTerminal({ ...restart, shiftKey: true }, true), false);
});

test("plain page-up and page-down page the scrollback viewport", () => {
  assert.equal(shouldScrollTerminalPage({ ...keydown, key: "PageUp", code: "PageUp" }), -1);
  assert.equal(shouldScrollTerminalPage({ ...keydown, key: "PageDown", code: "PageDown" }), 1);
  assert.equal(shouldScrollTerminalPage({ ...keydown, key: "PageUp", code: "" }), -1);
  assert.equal(shouldScrollTerminalPage({ ...keydown, key: "", code: "PageDown" }), 1);
});

test("modified page keys stay with the terminal application", () => {
  const pageUp = { ...keydown, key: "PageUp", code: "PageUp" };

  assert.equal(shouldScrollTerminalPage({ ...pageUp, shiftKey: true }), 0);
  assert.equal(shouldScrollTerminalPage({ ...pageUp, ctrlKey: true }), 0);
  assert.equal(shouldScrollTerminalPage({ ...pageUp, metaKey: true }), 0);
  assert.equal(shouldScrollTerminalPage({ ...pageUp, altKey: true }), 0);
  assert.equal(shouldScrollTerminalPage({ ...pageUp, type: "keyup" }), 0);
  assert.equal(shouldScrollTerminalPage(keydown), 0);
});
