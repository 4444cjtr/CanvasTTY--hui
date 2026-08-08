import assert from "node:assert/strict";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import {
  PluginManager,
  downloadGithubRepository,
  extractGithubTarball,
  injectPluginInputBridge,
  normalizeGithubUrl,
  validatePluginManifest
} from "../src/main/services/PluginManager.ts";

test("injects one trusted input bridge before plugin scripts", () => {
  const html = "<!doctype html><html><head><script src='plugin.js'></script></head><body></body></html>";
  const injected = injectPluginInputBridge(html);
  const bridge = "canvastty-plugin://host/input-bridge.js";
  assert.equal(injected.split(bridge).length - 1, 1);
  assert.ok(injected.indexOf(bridge) < injected.indexOf("plugin.js"));
  assert.equal(injectPluginInputBridge(injected), injected);
});

const manifest = {
  apiVersion: 1,
  id: "com.example.studio-clock",
  name: "Studio Clock",
  version: "1.2.0",
  description: "A small collection of CanvasTTY surfaces.",
  author: "Example",
  homepage: "https://example.com/plugin",
  permissions: [
    "storage",
    "sessions:read",
    "limits:read",
    "launcher:open",
    "external:open",
    "media:library",
    "playlists:read",
    "playlists:write",
    "network"
  ],
  contributions: [
    {
      id: "clock",
      kind: "home-widget",
      title: "Clock",
      entry: "widgets/clock.html",
      defaultSize: { columns: 4, rows: 2 }
    },
    {
      id: "notes",
      kind: "canvas-app",
      title: "Notes",
      entry: "apps/notes.html",
      defaultSize: { width: 680, height: 440 }
    },
    {
      id: "focus",
      kind: "window",
      title: "Focus window",
      entry: "windows/focus.html",
      defaultSize: { width: 900, height: 620 }
    }
  ]
};

test("normalizes only GitHub repository root links", () => {
  assert.equal(
    normalizeGithubUrl("https://github.com/example/canvastty-clock"),
    "https://github.com/example/canvastty-clock.git"
  );
  assert.equal(
    normalizeGithubUrl("https://github.com/example/canvastty-clock.git/"),
    "https://github.com/example/canvastty-clock.git"
  );
  assert.throws(() => normalizeGithubUrl("git@github.com:example/plugin.git"));
  assert.throws(() => normalizeGithubUrl("https://gitlab.com/example/plugin"));
  assert.throws(() => normalizeGithubUrl("https://github.com/example/plugin/tree/main"));
  assert.throws(() => normalizeGithubUrl("https://user:token@github.com/example/plugin"));
});

test("validates all supported contribution shapes and permissions", () => {
  assert.deepEqual(validatePluginManifest(manifest), manifest);
});

test("rejects executable escapes, unknown permissions, and unsupported API versions", () => {
  assert.throws(() => validatePluginManifest({ ...manifest, apiVersion: 2 }));
  assert.throws(() => validatePluginManifest({ ...manifest, permissions: ["filesystem"] }));
  assert.throws(() => validatePluginManifest({
    ...manifest,
    contributions: [{
      ...manifest.contributions[0],
      entry: "../outside.html"
    }]
  }));
});

test("requires unique contribution ids and bounded default sizes", () => {
  assert.throws(() => validatePluginManifest({
    ...manifest,
    contributions: [manifest.contributions[0], manifest.contributions[0]]
  }));
  assert.throws(() => validatePluginManifest({
    ...manifest,
    contributions: [{
      ...manifest.contributions[0],
      defaultSize: { columns: 49, rows: 1 }
    }]
  }));
});

test("previews, installs, serves, stores, disables, and uninstalls a static package", async () => {
  const userData = await mkdtemp(join(tmpdir(), "canvastty-plugin-manager-"));
  const fixture = new URL("../examples/plugins/studio-kit/", import.meta.url);
  const manager = new PluginManager(userData, async (_url, destination) => {
    await cp(fixture, destination, { recursive: true });
  });

  try {
    await manager.load();
    const preview = await manager.previewInstall("https://github.com/example/studio-kit");
    assert.equal(preview.manifest.id, "com.example.studio-kit");
    assert.deepEqual(manager.list(), []);

    const installed = await manager.install(preview.token);
    assert.equal(installed.enabled, true);
    assert.equal(manager.list().length, 1);

    const inputBridge = await manager.protocolResponse("canvastty-plugin://host/input-bridge.js");
    assert.equal(inputBridge.status, 200);
    const inputBridgeSource = await inputBridge.text();
    assert.match(inputBridgeSource, /addEventListener\("wheel"/);
    assert.match(inputBridgeSource, /addEventListener\("pointerdown"/);
    assert.match(inputBridgeSource, /type: "canvas-focus"/);
    assert.match(inputBridgeSource, /type: "canvas-hover", active: true/);
    assert.match(inputBridgeSource, /type: "canvas-hover", active: false/);
    const pointerStart = inputBridgeSource.indexOf('addEventListener("pointerdown"');
    assert.doesNotMatch(inputBridgeSource.slice(pointerStart), /event\.preventDefault\(\)/);

    await manager.storageSet(installed.manifest.id, "draft", { text: "real storage" });
    assert.deepEqual(await manager.storageGet(installed.manifest.id, "draft"), { text: "real storage" });

    const asset = await manager.protocolResponse(
      "canvastty-plugin://com.example.studio-kit/widgets/status.html"
    );
    assert.equal(asset.status, 200);
    const assetHtml = await asset.text();
    assert.match(assetHtml, /Session status/);
    assert.match(assetHtml, /canvastty-plugin:\/\/host\/input-bridge\.js/);
    assert.match(asset.headers.get("content-security-policy"), /connect-src 'none'/);

    await manager.setEnabled(installed.manifest.id, false);
    assert.equal((await manager.protocolResponse(
      "canvastty-plugin://com.example.studio-kit/widgets/status.html"
    )).status, 404);

    await manager.setEnabled(installed.manifest.id, true);
    await manager.uninstall(installed.manifest.id);
    assert.deepEqual(manager.list(), []);
  } finally {
    await manager.dispose();
    await rm(userData, { recursive: true, force: true });
  }
});

test("extracts a bounded GitHub tar root and rejects traversal or links", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvastty-plugin-tar-"));
  try {
    await extractGithubTarball(tarArchive([
      { name: "repository-hash/", type: "5", content: "" },
      { name: "repository-hash/plugin/index.html", type: "0", content: "safe" }
    ]), directory);
    assert.equal(await readFile(join(directory, "plugin/index.html"), "utf8"), "safe");

    await assert.rejects(() => extractGithubTarball(tarArchive([
      { name: "repository-hash/../escape.txt", type: "0", content: "escape" }
    ]), join(directory, "traversal")));
    await assert.rejects(() => extractGithubTarball(tarArchive([
      { name: "repository-hash/link", type: "2", content: "" }
    ]), join(directory, "link")));
    await assert.rejects(() => extractGithubTarball(tarArchive(
      Array.from({ length: 501 }, (_value, index) => ({
        name: `repository-hash/directory-${index}/`,
        type: "5",
        content: ""
      }))
    ), join(directory, "too-many-directories")), /500 entry/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("plugin download retries transient failures but not permanent ones", async () => {
  const directory = await mkdtemp(join(tmpdir(), "canvastty-plugin-download-"));
  const tarball = gzipSync(tarArchive([
    { name: "repository-hash/", type: "5", content: "" },
    { name: "repository-hash/index.html", type: "0", content: "ok" }
  ]));
  const originalFetch = globalThis.fetch;
  let calls = 0;

  try {
    globalThis.fetch = async () => {
      calls += 1;
      if (calls === 1) throw new TypeError("fetch failed");
      return new Response(tarball, { status: 200 });
    };
    await downloadGithubRepository("https://github.com/example/repository.git", directory);
    assert.equal(calls, 2);
    assert.equal(await readFile(join(directory, "index.html"), "utf8"), "ok");

    calls = 0;
    globalThis.fetch = async () => {
      calls += 1;
      return new Response("nope", { status: 404 });
    };
    await assert.rejects(
      () => downloadGithubRepository("https://github.com/example/missing.git", join(directory, "missing")),
      /not found or is not public/
    );
    assert.equal(calls, 1);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(directory, { recursive: true, force: true });
  }
});

function tarArchive(entries) {
  const blocks = [];
  for (const entry of entries) {
    const content = Buffer.from(entry.content);
    const header = Buffer.alloc(512);
    header.write(entry.name, 0, 100, "utf8");
    writeOctal(header, 100, 8, 0o644);
    writeOctal(header, 108, 8, 0);
    writeOctal(header, 116, 8, 0);
    writeOctal(header, 124, 12, content.length);
    writeOctal(header, 136, 12, 0);
    header.fill(32, 148, 156);
    header[156] = entry.type.charCodeAt(0);
    header.write("ustar\0", 257, 6, "ascii");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    header.write(checksum.toString(8).padStart(6, "0"), 148, 6, "ascii");
    header[154] = 0;
    header[155] = 32;
    blocks.push(header, content, Buffer.alloc((512 - content.length % 512) % 512));
  }
  blocks.push(Buffer.alloc(1_024));
  return Buffer.concat(blocks);
}

function writeOctal(header, offset, length, value) {
  const text = value.toString(8).padStart(length - 1, "0");
  header.write(text, offset, length - 1, "ascii");
  header[offset + length - 1] = 0;
}
