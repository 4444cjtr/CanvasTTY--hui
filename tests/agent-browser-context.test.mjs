import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeAgentBrowserContext } from "../src/main/services/agent-browser/ProviderLaunch.ts";

const MARKER_START = "<!-- canvas-tty-browser-context-start -->";
const MARKER_END = "<!-- canvas-tty-browser-context-end -->";

test("writeAgentBrowserContext creates AGENTS.md with the browser section", async () => {
  const root = await mkdtemp(join(tmpdir(), "agents-ctx-"));
  try {
    writeAgentBrowserContext(root);
    const content = await readFile(join(root, "AGENTS.md"), "utf8");
    assert.match(content, /## CanvasTTY browser \(MCP\)/);
    assert.match(content, /mcp__canvastty_browser__browser_\*/);
    assert.ok(content.includes(MARKER_START));
    assert.ok(content.includes(MARKER_END));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writeAgentBrowserContext preserves existing AGENTS.md content", async () => {
  const root = await mkdtemp(join(tmpdir(), "agents-ctx-"));
  try {
    await writeFile(join(root, "AGENTS.md"), "# My project\n\nRules here.\n");
    writeAgentBrowserContext(root);
    const content = await readFile(join(root, "AGENTS.md"), "utf8");
    assert.match(content, /# My project/);
    assert.match(content, /Rules here\./);
    assert.match(content, /## CanvasTTY browser \(MCP\)/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("writeAgentBrowserContext is idempotent (no duplicate sections)", async () => {
  const root = await mkdtemp(join(tmpdir(), "agents-ctx-"));
  try {
    writeAgentBrowserContext(root);
    writeAgentBrowserContext(root);
    writeAgentBrowserContext(root);
    const content = await readFile(join(root, "AGENTS.md"), "utf8");
    assert.equal(content.split(MARKER_START).length - 1, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
