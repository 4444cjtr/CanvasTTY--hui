import assert from "node:assert/strict";
import test from "node:test";
import { remapTerminalMouseCoordinates } from "../src/renderer/src/features/terminal/terminalMouseCoordinates.ts";

test("keeps terminal coordinates unchanged at one-to-one scale", () => {
  assert.deepEqual(
    remapTerminalMouseCoordinates(
      { x: 190, y: 240 },
      { left: 100, top: 100, width: 700, height: 400 },
      { width: 700, height: 400 }
    ),
    { x: 190, y: 240 }
  );
});

test("maps visual coordinates back into xterm layout coordinates when zoomed out", () => {
  assert.deepEqual(
    remapTerminalMouseCoordinates(
      { x: 170, y: 170 },
      { left: 100, top: 100, width: 490, height: 280 },
      { width: 700, height: 400 }
    ),
    { x: 200, y: 200 }
  );
});

test("maps visual coordinates back into xterm layout coordinates when zoomed in", () => {
  assert.deepEqual(
    remapTerminalMouseCoordinates(
      { x: 240, y: 240 },
      { left: 100, top: 100, width: 840, height: 480 },
      { width: 700, height: 400 }
    ),
    { x: 216.66666666666669, y: 216.66666666666669 }
  );
});
