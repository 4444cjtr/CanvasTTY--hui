import assert from "node:assert/strict";
import test from "node:test";
import { constrainPluginResize } from "../src/renderer/src/features/plugins/pluginBounds.ts";

test("uses the platform minimum for older plugin manifests", () => {
  assert.deepEqual(constrainPluginResize({
    position: { x: 10, y: 20 },
    size: { width: 100, height: 80 }
  }, "se"), {
    position: { x: 10, y: 20 },
    size: { width: 320, height: 220 }
  });
});

test("respects a contribution-specific minimum and preserves north-west edges", () => {
  assert.deepEqual(constrainPluginResize({
    position: { x: 500, y: 400 },
    size: { width: 120, height: 90 }
  }, "nw", { width: 280, height: 160 }), {
    position: { x: 340, y: 330 },
    size: { width: 280, height: 160 }
  });
});
