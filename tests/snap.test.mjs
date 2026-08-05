import assert from "node:assert/strict";
import test from "node:test";
import {
  constrainResize,
  snapMove,
  snapResize
} from "../src/renderer/src/features/workspace/snap.ts";

const target = {
  position: { x: 0, y: 0 },
  size: { width: 700, height: 430 }
};

test("magnetically aligns matching window edges inside the threshold", () => {
  assert.deepEqual(snapMove(
    { x: 4, y: 7 },
    { width: 700, height: 430 },
    [target]
  ), { x: 0, y: 0 });
});

test("prefers a symmetric gap near another window and otherwise uses the hidden grid", () => {
  assert.deepEqual(snapMove(
    { x: 711, y: 126 },
    { width: 700, height: 430 },
    [target]
  ), { x: 720, y: 130 });
});

test("resizing snaps the dragged edge and keeps the opposite edge fixed at minimum size", () => {
  assert.deepEqual(snapResize(
    { position: { x: 0, y: 500 }, size: { width: 795, height: 430 } },
    "e",
    [{ position: { x: 800, y: 0 }, size: { width: 700, height: 430 } }]
  ).size.width, 800);

  assert.deepEqual(constrainResize(
    { position: { x: 690, y: 0 }, size: { width: 10, height: 430 } },
    "w"
  ), {
    position: { x: 280, y: 0 },
    size: { width: 420, height: 430 }
  });
});
