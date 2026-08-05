import assert from "node:assert/strict";
import test from "node:test";
import {
  EDGE_PAN_MAX_SPEED,
  EDGE_PAN_ZONE,
  edgePanVelocity
} from "../src/renderer/src/features/workspace/edgePan.ts";

const viewport = { left: 100, top: 50, width: 1000, height: 600 };
const options = { zone: 56, maxSpeed: 900 };

test("returns null while the pointer rests in the middle of the viewport", () => {
  assert.equal(edgePanVelocity({ x: 600, y: 350 }, viewport, options), null);
});

test("returns null while the pointer is outside the viewport", () => {
  assert.equal(edgePanVelocity({ x: 99, y: 350 }, viewport, options), null);
  assert.equal(edgePanVelocity({ x: 600, y: 651 }, viewport, options), null);
});

test("hugging the left edge pushes the camera right at full speed", () => {
  assert.deepEqual(edgePanVelocity({ x: 100, y: 350 }, viewport, options), { x: 900, y: 0 });
});

test("hugging the right edge pushes the camera left at full speed", () => {
  assert.deepEqual(edgePanVelocity({ x: 1100, y: 350 }, viewport, options), { x: -900, y: 0 });
});

test("hugging the top edge pushes the camera down at full speed", () => {
  assert.deepEqual(edgePanVelocity({ x: 600, y: 50 }, viewport, options), { x: 0, y: 900 });
});

test("hugging the bottom edge pushes the camera up at full speed", () => {
  assert.deepEqual(edgePanVelocity({ x: 600, y: 650 }, viewport, options), { x: 0, y: -900 });
});

test("speed ramps linearly with depth inside the zone", () => {
  const halfway = edgePanVelocity({ x: 100 + 28, y: 350 }, viewport, options);
  assert.ok(halfway);
  assert.equal(halfway.x, 450);
  assert.equal(halfway.y, 0);
});

test("the zone boundary itself produces no motion", () => {
  assert.equal(edgePanVelocity({ x: 100 + 56, y: 350 }, viewport, options), null);
  assert.equal(edgePanVelocity({ x: 600, y: 650 - 56 }, viewport, options), null);
});

test("corners pan diagonally on both axes", () => {
  const corner = edgePanVelocity({ x: 100, y: 650 }, viewport, options);
  assert.ok(corner);
  assert.equal(corner.x, 900);
  assert.equal(corner.y, -900);
});

test("defaults apply when options are omitted", () => {
  const velocity = edgePanVelocity({ x: 100, y: 350 }, viewport);
  assert.ok(velocity);
  assert.equal(velocity.x, EDGE_PAN_MAX_SPEED);
  assert.equal(velocity.y, 0);
  assert.equal(edgePanVelocity({ x: 100 + EDGE_PAN_ZONE, y: 350 }, viewport), null);
});

test("the zone never exceeds half of a tiny viewport axis", () => {
  const tiny = { left: 0, top: 0, width: 40, height: 600 };
  const velocity = edgePanVelocity({ x: 0, y: 300 }, tiny, options);
  assert.ok(velocity);
  assert.equal(velocity.x, 900);
  assert.equal(velocity.y, 0);
});
