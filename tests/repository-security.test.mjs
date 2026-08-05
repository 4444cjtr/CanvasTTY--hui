import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { collectRepositoryIssues } from "../scripts/audit-secrets.mjs";

test("publishable repository files contain no high-confidence secrets or personal paths", async () => {
  assert.deepEqual(await collectRepositoryIssues(), []);
});

test("gitignore excludes local credentials, logs, builds, and agent context", async () => {
  const gitignore = await readFile(new URL("../.gitignore", import.meta.url), "utf8");
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
  const config = await readFile(new URL("../electron-builder.yml", import.meta.url), "utf8");

  assert.match(config, /^files:\n(?:[\s\S]*?)^  - out\/\*\*\/\*$/m);
  assert.match(config, /^  - package\.json$/m);
  assert.doesNotMatch(config, /^  - \*\*\/\*$/m);
  for (const privatePath of [".agents", ".codex", ".planning", "AGENTS.md", "IDEA-DRAFT.md"]) {
    assert.doesNotMatch(config, new RegExp(`^  - .*${escapeRegExp(privatePath)}`, "m"));
  }
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
