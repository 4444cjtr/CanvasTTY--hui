import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const contractsPath = new URL("../src/shared/contracts.ts", import.meta.url);
const preloadPath = new URL("../src/preload/index.ts", import.meta.url);
const pluginPreloadPath = new URL("../src/preload/plugin.ts", import.meta.url);
const ipcPath = new URL("../src/main/ipc/registerIpc.ts", import.meta.url);
const framePath = new URL("../src/renderer/src/features/plugins/PluginFrame.tsx", import.meta.url);

test("plugin storage writes broadcast change events to every plugin context", async () => {
  const [contracts, preload, pluginPreload, ipc, frame] = await Promise.all([
    readFile(contractsPath, "utf8"),
    readFile(preloadPath, "utf8"),
    readFile(pluginPreloadPath, "utf8"),
    readFile(ipcPath, "utf8"),
    readFile(framePath, "utf8")
  ]);

  assert.match(contracts, /pluginsStorageChanged: "plugins:storage-changed"/);
  assert.match(contracts, /onStorageChanged\(listener: \(event: PluginStorageChangeEvent\) => void\)/);
  assert.match(preload, /onStorageChanged:.*subscribe\(IPC\.pluginsStorageChanged, listener\)/);
  // Both the renderer storage.set path and the plugin-window host-invoke path broadcast.
  assert.equal(ipc.match(/broadcastPluginStorageChange\(pluginId, key/g)?.length, 2);
  // Separate plugin windows forward the broadcast into the page as a host storage-change message.
  assert.match(pluginPreload, /ipcRenderer\.on\(PLUGIN_STORAGE_CHANGED/);
  assert.match(pluginPreload, /type: "storage-change", key: change\.key, value: change\.value/);
  // Embedded frames receive changes only from the main-process broadcast, not a local echo.
  assert.match(frame, /onStorageChanged\(\(event\) =>/);
  assert.doesNotMatch(frame, /await window\.canvasTTY\.plugins\.storageSet\([^)]*\);\s*emitStorage/);
});
