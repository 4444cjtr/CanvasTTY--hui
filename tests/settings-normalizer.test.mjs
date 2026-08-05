import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { normalizeSettings, SettingsStore } from "../src/main/services/SettingsStore.ts";

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
  acknowledgedDangerousProfiles: []
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
    assert.deepEqual(store.get().shortcuts, { home: "Home", renameWindow: "F2" });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
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
