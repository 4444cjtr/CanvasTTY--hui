import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gzipSync } from "node:zlib";
import {
  PluginManager,
  downloadGithubRepository,
  extractGithubTarball,
  normalizeGithubUrl,
  validatePluginManifest
} from "../src/main/services/PluginManager.ts";

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
    "secrets",
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
      defaultSize: { width: 680, height: 440 },
      minSize: { width: 320, height: 180 }
    },
    {
      id: "focus",
      kind: "window",
      title: "Focus window",
      entry: "windows/focus.html",
      defaultSize: { width: 900, height: 620 }
    }
  ],
  settingsContribution: "notes"
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
  assert.throws(() => validatePluginManifest({
    ...manifest,
    settingsContribution: "focus"
  }), /canvas-app/);
  assert.throws(() => validatePluginManifest({
    ...manifest,
    contributions: manifest.contributions.map((contribution) => contribution.id === "notes"
      ? { ...contribution, minSize: { width: 700, height: 180 } }
      : contribution)
  }), /must not exceed/);
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

    await manager.storageSet(installed.manifest.id, "draft", { text: "real storage" });
    assert.deepEqual(await manager.storageGet(installed.manifest.id, "draft"), { text: "real storage" });

    const asset = await manager.protocolResponse(
      "canvastty-plugin://com.example.studio-kit/widgets/status.html"
    );
    assert.equal(asset.status, 200);
    assert.match(await asset.text(), /Session status/);
    assert.match(asset.headers.get("content-security-policy"), /connect-src 'none'/);

    const sdk = await manager.protocolResponse("canvastty-plugin://host/sdk.js");
    const sdkSource = await sdk.text();
    assert.match(sdkSource, /secrets: Object\.freeze/);
    assert.match(sdkSource, /canvas: Object\.freeze/);
    assert.match(sdkSource, /onStorageChange/);

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

test("installs only selected integrity-checked modules and can change the selection", async () => {
  const userData = await mkdtemp(join(tmpdir(), "canvastty-plugin-modules-user-"));
  const fixture = await mkdtemp(join(tmpdir(), "canvastty-plugin-modules-source-"));
  const core = Buffer.from("<h1>Core</h1>");
  const extra = Buffer.from("export const extra = true;");
  const manifest = {
    apiVersion: 1,
    id: "com.example.modular",
    name: "Modular",
    version: "1.0.0",
    description: "A modular fixture.",
    permissions: ["storage"],
    coreFiles: [{ path: "index.html", bytes: core.length, sha256: sha256(core) }],
    modules: [{
      id: "extra",
      title: "Extra",
      defaultSelected: false,
      permissions: ["network"],
      files: [{ path: "extra.js", bytes: extra.length, sha256: sha256(extra) }]
    }],
    contributions: [{
      id: "core",
      kind: "canvas-app",
      title: "Core",
      entry: "index.html",
      defaultSize: { width: 480, height: 300 }
    }]
  };
  await writeFile(join(fixture, "canvastty.plugin.json"), JSON.stringify(manifest));
  await writeFile(join(fixture, "index.html"), core);
  await writeFile(join(fixture, "extra.js"), extra);
  const copyFiles = async (_url, destination, files) => {
    for (const file of files) {
      await mkdir(join(destination, file.path.split("/").slice(0, -1).join("/")), { recursive: true });
      await cp(join(fixture, file.path), join(destination, file.path));
    }
  };
  const manager = new PluginManager(
    userData,
    async (_url, destination) => cp(fixture, destination, { recursive: true }),
    copyFiles
  );
  try {
    await manager.load();
    const preview = await manager.previewInstall("https://github.com/example/modular");
    const installed = await manager.install(preview.token, []);
    assert.deepEqual(installed.selectedModules, []);
    assert.deepEqual(installed.manifest.permissions, ["storage"]);
    assert.equal((await manager.protocolResponse("canvastty-plugin://com.example.modular/extra.js")).status, 404);

    const updated = await manager.setModules(installed.manifest.id, ["extra"]);
    assert.deepEqual(updated.selectedModules, ["extra"]);
    assert.deepEqual(updated.manifest.permissions, ["storage", "network"]);
    assert.equal((await manager.protocolResponse("canvastty-plugin://com.example.modular/extra.js")).status, 200);
  } finally {
    await manager.dispose();
    await rm(userData, { recursive: true, force: true });
    await rm(fixture, { recursive: true, force: true });
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

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}
