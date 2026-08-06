import assert from "node:assert/strict";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

test("local links in repository documentation resolve", async () => {
  const markdownFiles = [
    ...await markdownIn(root, false, (name) => (
      name.startsWith("README") || name.startsWith("SECURITY") || name.startsWith("CHANGELOG")
    )),
    ...await markdownIn(resolve(root, "docs"), true)
  ];
  const broken = [];

  for (const file of markdownFiles) {
    const content = await readFile(file, "utf8");
    const targets = [
      ...content.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g),
      ...content.matchAll(/(?:href|src)="([^"]+)"/g)
    ].map((match) => match[1]);

    for (const target of targets) {
      if (/^(?:https?:|mailto:|#)/.test(target)) continue;
      const cleanTarget = decodeURIComponent(target.split("#", 1)[0]);
      if (!cleanTarget) continue;
      try {
        await stat(resolve(dirname(file), cleanTarget));
      } catch {
        broken.push(`${file.slice(root.length + 1)} -> ${target}`);
      }
    }
  }

  assert.deepEqual(broken, []);
});

async function markdownIn(directory, recursive, include = () => true) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isFile() && extname(entry.name) === ".md" && include(entry.name)) files.push(path);
    if (recursive && entry.isDirectory() && entry.name !== "assets") {
      files.push(...await markdownIn(path, true));
    }
  }
  return files;
}
