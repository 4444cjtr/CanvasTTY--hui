import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collectRepositoryIssues } from "../scripts/audit-secrets.mjs";

test("publishable repository files contain no high-confidence secrets or personal paths", async () => {
  assert.deepEqual(await collectRepositoryIssues(), []);
});

test("gitignore excludes local credentials, logs, builds, and agent context", async () => {
  const gitignore = normalizeLineEndings(
    await readFile(new URL("../.gitignore", import.meta.url), "utf8")
  );
  const requiredEntries = [
    ".env",
    ".env.*",
    "*.log",
    "credentials.json",
    "auth.json",
    "release/",
    ".agents/",
    ".codex/",
    ".planning/",
    "AGENTS.md",
    "IDEA-DRAFT.md"
  ];

  for (const entry of requiredEntries) {
    assert.match(gitignore, new RegExp(`^${escapeRegExp(entry)}$`, "m"), `missing ${entry}`);
  }
});

test("packaged app uses an explicit production allowlist", async () => {
  const config = normalizeLineEndings(
    await readFile(new URL("../electron-builder.yml", import.meta.url), "utf8")
  );

  assert.match(config, /^files:\n(?:[\s\S]*?)^  - out\/\*\*\/\*$/m);
  assert.match(config, /^  - package\.json$/m);
  assert.match(config, /^  - LICENSE$/m);
  assert.doesNotMatch(config, /^  - \*\*\/\*$/m);
  for (const privatePath of [".agents", ".codex", ".planning", "AGENTS.md", "IDEA-DRAFT.md"]) {
    assert.doesNotMatch(config, new RegExp(`^  - .*${escapeRegExp(privatePath)}`, "m"));
  }
});

test("package manifest and lockfile publish the same version", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  const lockfile = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));

  assert.equal(lockfile.version, manifest.version);
  assert.equal(lockfile.packages[""].version, manifest.version);
  assert.equal(manifest.license, "MIT");
  assert.equal(lockfile.packages[""].license, manifest.license);
});

test("release workflow uploads installers only and keeps Windows targets distinct", async () => {
  const config = normalizeLineEndings(
    await readFile(new URL("../electron-builder.yml", import.meta.url), "utf8")
  );
  const workflow = normalizeLineEndings(
    await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8")
  );

  assert.match(config, /^  artifactName: .*windows-\$\{arch\}-setup\.\$\{ext\}$/m);
  assert.match(config, /^  artifactName: .*windows-\$\{arch\}-portable\.\$\{ext\}$/m);
  assert.doesNotMatch(workflow, /^\s+release\/\*$/m);
  for (const extension of ["AppImage", "deb", "exe", "dmg", "zip"]) {
    assert.match(workflow, new RegExp(`^\\s+release/\\*\\.${extension}$`, "m"));
  }
});

test("AppImage avoids maximum XZ compression and is smoke-tested before upload", async () => {
  const config = normalizeLineEndings(
    await readFile(new URL("../electron-builder.yml", import.meta.url), "utf8")
  );
  const workflow = normalizeLineEndings(
    await readFile(new URL("../.github/workflows/release.yml", import.meta.url), "utf8")
  );
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));

  assert.match(config, /^compression: normal$/m);
  assert.match(config, /^appImage:\n  compression: gzip$/m);
  assert.doesNotMatch(config, /^compression: maximum$/m);
  assert.equal(manifest.scripts["smoke:appimage"], "node scripts/smoke-appimage.mjs");
  assert.match(workflow, /sudo apt-get install --no-install-recommends -y libfuse2t64/);
  assert.match(workflow, /xvfb-run -a npm run smoke:appimage/);
  assert.ok(workflow.indexOf("Install AppImage runtime dependency") < workflow.indexOf("Smoke-test packaged AppImage"));
  assert.ok(workflow.indexOf("Smoke-test packaged AppImage") < workflow.indexOf("Upload installers"));
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeLineEndings(value) {
  return value.replaceAll("\r\n", "\n");
}
