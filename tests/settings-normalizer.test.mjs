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

test("edge panning is off by default for fresh installs", async () => {
  const dir = await mkdtemp(join(tmpdir(), "canvastty-settings-"));
  try {
    const store = new SettingsStore(dir, "en");
    await store.load();
    assert.equal(store.get().edgePan, false);
    assert.equal(store.get().edgePanSpeed, "normal");
    assert.equal(store.get().zoomSensitivity, "normal");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("a saved edge pan preference survives normalization", () => {
  const normalized = normalizeSettings({ edgePan: true, edgePanSpeed: "fast" }, fallback);
  assert.equal(normalized.edgePan, true);
  assert.equal(normalized.edgePanSpeed, "fast");
});
