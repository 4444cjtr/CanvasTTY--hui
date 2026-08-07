import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBrowserViewportBounds } from "../src/main/services/browser/BrowserViewport.ts";

test("browser viewport expands fractional edges instead of exposing compositor gaps", () => {
  assert.deepEqual(normalizeBrowserViewportBounds({
    x: 10.4,
    y: 20.6,
    width: 100.2,
    height: 50.1,
    visible: true,
    canvasScale: 0.92,
    captureCanvasWheel: true,
    showAgentPresence: true
  }), {
    x: 10,
    y: 20,
    width: 101,
    height: 51,
    visible: true,
    canvasScale: 0.92,
    captureCanvasWheel: true,
    showAgentPresence: true
  });
});

test("browser viewport rejects invalid geometry and clamps negative sizes", () => {
  assert.equal(normalizeBrowserViewportBounds(null), null);
  assert.equal(normalizeBrowserViewportBounds({ x: 0, y: 0, width: Number.NaN, height: 10 }), null);
  assert.deepEqual(normalizeBrowserViewportBounds({
    x: -2.2,
    y: 3.8,
    width: -20,
    height: -10,
    visible: "yes",
    captureCanvasWheel: 1
  }), {
    x: -3,
    y: 3,
    width: 0,
    height: 0,
    visible: false,
    captureCanvasWheel: false,
    showAgentPresence: false
  });
});

test("browser viewport keeps page scaling inside Chromium's supported range", () => {
  assert.equal(normalizeBrowserViewportBounds({
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    visible: false,
    canvasScale: 0.2
  })?.canvasScale, 0.5);
  assert.equal(normalizeBrowserViewportBounds({
    x: 0,
    y: 0,
    width: 400,
    height: 300,
    visible: true,
    canvasScale: 8
  })?.canvasScale, 3);
});
