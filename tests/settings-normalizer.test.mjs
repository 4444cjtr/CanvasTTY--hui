import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  normalizeHomeGridSize,
  normalizeHomeLayout,
  normalizeSettings,
  SettingsStore
} from "../src/main/services/SettingsStore.ts";

const fallback = {
  locale: "en",
  palette: "sage",
  pattern: "dots",
  snapToGrid: true,
  edgePan: true,
  edgePanSpeed: "normal",
  zoomSensitivity: "normal",
  focusActivation: "off",
  showShortcutHints: true,
  shortcuts: { home: "Home", renameWindow: "F2" },
  mediaPath: null,
  mediaFit: "cover",
  lastDirectory: "/",
  acknowledgedDangerousProfiles: [],
  homeGridSize: { columns: 16, rows: 12 },
  homeLayout: [
    { widgetId: "core.clock", column: 0, row: 0, columnSpan: 10, rowSpan: 6 },
    { widgetId: "core.settings", column: 10, row: 6, columnSpan: 2, rowSpan: 2 }
  ],
  pluginCanvas: [],
  browserCanvas: null
};

test("keeps valid edge pan and zoom sensitivity values", () => {
  const normalized = normalizeSettings(
    { edgePan: false, edgePanSpeed: "fast", zoomSensitivity: "slow" },
    fallback
  );
  assert.equal(normalized.edgePan, false);
  assert.equal(normalized.edgePanSpeed, "fast");
  assert.equal(normalized.zoomSensitivity, "slow");
});

test("falls back when edge pan and zoom values are garbage", () => {
  const normalized = normalizeSettings(
    { edgePan: "yes", edgePanSpeed: "warp", zoomSensitivity: 11 },
    fallback
  );
  assert.equal(normalized.edgePan, fallback.edgePan);
  assert.equal(normalized.edgePanSpeed, fallback.edgePanSpeed);
  assert.equal(normalized.zoomSensitivity, fallback.zoomSensitivity);
  assert.equal(normalized.focusActivation, fallback.focusActivation);
  assert.equal(normalized.showShortcutHints, fallback.showShortcutHints);
  assert.deepEqual(normalized.shortcuts, fallback.shortcuts);
});

test("older settings files without the new keys inherit defaults", () => {
  const normalized = normalizeSettings({ locale: "ru", snapToGrid: false }, fallback);
  assert.equal(normalized.locale, "ru");
  assert.equal(normalized.snapToGrid, false);
  assert.equal(normalized.edgePan, fallback.edgePan);
  assert.equal(normalized.edgePanSpeed, fallback.edgePanSpeed);
  assert.equal(normalized.zoomSensitivity, fallback.zoomSensitivity);
});

test("a non-object candidate yields the fallback wholesale", () => {
  assert.equal(normalizeSettings(null, fallback), fallback);
  assert.equal(normalizeSettings("settings", fallback), fallback);
});

test("fresh installs keep optional navigation automation off", async () => {
  const dir = await mkdtemp(join(tmpdir(), "canvastty-settings-"));
  try {
    const store = new SettingsStore(dir, "en");
    await store.load();
    assert.equal(store.get().edgePan, false);
    assert.equal(store.get().edgePanSpeed, "normal");
    assert.equal(store.get().zoomSensitivity, "normal");
    assert.equal(store.get().focusActivation, "off");
    assert.equal(store.get().showShortcutHints, true);
    assert.deepEqual(store.get().homeGridSize, { columns: 16, rows: 12 });
    assert.equal(store.get().browserCanvas, null);
    assert.deepEqual(store.get().shortcuts, { home: "Home", renameWindow: "F2" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("normalizes the optional built-in browser canvas bounds", () => {
  assert.deepEqual(normalizeSettings({
    browserCanvas: { position: { x: 320, y: -40 }, size: { width: 900, height: 640 } }
  }, fallback).browserCanvas, {
    position: { x: 320, y: -40 }, size: { width: 900, height: 640 }
  });
  assert.deepEqual(normalizeSettings({
    browserCanvas: { position: { x: 0, y: 0 }, size: { width: 20, height: 9_000 } }
  }, fallback).browserCanvas?.size, { width: 560, height: 1_100 });
});

test("normalizes resizable Home boundaries within generous safety limits", () => {
  assert.deepEqual(normalizeHomeGridSize({ columns: 24, rows: 20 }), { columns: 24, rows: 20 });
  assert.deepEqual(normalizeHomeGridSize({ columns: 2, rows: 80 }), { columns: 12, rows: 36 });
  assert.deepEqual(normalizeHomeGridSize({ columns: "wide", rows: 20 }), { columns: 16, rows: 12 });
});

test("valid custom shortcuts survive normalization", () => {
  const normalized = normalizeSettings({
    focusActivation: "double",
    showShortcutHints: false,
    shortcuts: { home: "Ctrl+H", renameWindow: "Ctrl+Shift+R" }
  }, fallback);
  assert.equal(normalized.focusActivation, "double");
  assert.equal(normalized.showShortcutHints, false);
  assert.deepEqual(normalized.shortcuts, { home: "Ctrl+H", renameWindow: "Ctrl+Shift+R" });
});

test("conflicting or malformed shortcuts fall back together", () => {
  assert.deepEqual(
    normalizeSettings({ shortcuts: { home: "F2", renameWindow: "F2" } }, fallback).shortcuts,
    fallback.shortcuts
  );
  assert.deepEqual(
    normalizeSettings({ shortcuts: { home: "???", renameWindow: "F2" } }, fallback).shortcuts,
    fallback.shortcuts
  );
});

test("a saved edge pan preference survives normalization", () => {
  const normalized = normalizeSettings({ edgePan: true, edgePanSpeed: "fast" }, fallback);
  assert.equal(normalized.edgePan, true);
  assert.equal(normalized.edgePanSpeed, "fast");
});

test("keeps a valid custom Home grid including plugin widgets", () => {
  const layout = normalizeHomeLayout([
    { widgetId: "core.clock", column: 0, row: 0, columnSpan: 8, rowSpan: 4 },
    { widgetId: "plugin:com.example.clock:weather", column: 8, row: 0, columnSpan: 4, rowSpan: 4 },
    { widgetId: "core.settings", column: 10, row: 6, columnSpan: 2, rowSpan: 2 }
  ]);

  assert.deepEqual(layout.map((item) => item.widgetId), [
    "core.clock",
    "plugin:com.example.clock:weather",
    "core.settings"
  ]);
});

test("drops overlapping Home placements and always preserves a Settings entry point", () => {
  const layout = normalizeHomeLayout([
    { widgetId: "core.clock", column: 0, row: 0, columnSpan: 12, rowSpan: 8 },
    { widgetId: "core.media", column: 0, row: 0, columnSpan: 2, rowSpan: 2 }
  ]);

  assert.deepEqual(layout.map((item) => item.widgetId), ["core.settings"]);
});
