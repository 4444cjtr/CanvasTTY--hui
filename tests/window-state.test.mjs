import assert from "node:assert/strict";
import test from "node:test";
import { observeWindowState, readWindowState } from "../src/main/windowState.ts";

function windowStub({ maximized = false, fullScreen = false } = {}) {
  return {
    maximized,
    fullScreen,
    listeners: new Map(),
    isMaximized() { return this.maximized; },
    isFullScreen() { return this.fullScreen; },
    on(event, listener) { this.listeners.set(event, listener); },
    emit(event) { this.listeners.get(event)?.(); }
  };
}

test("reports platform and native window state", () => {
  const window = windowStub({ maximized: true, fullScreen: true });

  assert.deepEqual(readWindowState(window, "darwin"), {
    isMacOS: true,
    maximized: true,
    fullscreen: true
  });
  assert.deepEqual(readWindowState(null, "win32"), {
    isMacOS: false,
    maximized: false,
    fullscreen: false
  });
});

test("publishes native fullscreen changes", () => {
  const window = windowStub();
  const states = [];
  observeWindowState(window, (state) => states.push(state), "darwin");

  window.fullScreen = true;
  window.emit("enter-full-screen");
  window.fullScreen = false;
  window.emit("leave-full-screen");

  assert.deepEqual(states, [
    { isMacOS: true, maximized: false, fullscreen: true },
    { isMacOS: true, maximized: false, fullscreen: false }
  ]);
});
