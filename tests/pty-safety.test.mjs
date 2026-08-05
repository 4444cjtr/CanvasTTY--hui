import assert from "node:assert/strict";
import test from "node:test";
import { tryPtyOperation } from "../src/main/services/ptySafety.ts";

test("returns true when a PTY operation succeeds", () => {
  let called = false;
  assert.equal(tryPtyOperation(() => {
    called = true;
  }), true);
  assert.equal(called, true);
});

test("contains closed PTY errors instead of crashing the main process", () => {
  assert.doesNotThrow(() => {
    assert.equal(tryPtyOperation(() => {
      throw new Error("ioctl(2) failed, EBADFD");
    }), false);
  });
});
