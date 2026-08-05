import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import test from "node:test";
import { augmentCliPath } from "../src/main/services/cliEnvironment.ts";

test("adds existing user CLI directories without replacing desktop PATH", async () => {
  const home = await mkdtemp(join(tmpdir(), "canvastty-cli-path-"));
  const kimiBin = join(home, ".kimi-code", "bin");
  try {
    await mkdir(kimiBin, { recursive: true });
    const environment = { PATH: ["/usr/local/bin", "/usr/bin"].join(delimiter) };

    augmentCliPath(environment, home, "linux");

    assert.deepEqual(environment.PATH.split(delimiter), ["/usr/local/bin", "/usr/bin", kimiBin]);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("does not duplicate CLI directories already present in PATH", async () => {
  const home = await mkdtemp(join(tmpdir(), "canvastty-cli-path-"));
  const kimiBin = join(home, ".kimi-code", "bin");
  try {
    await mkdir(kimiBin, { recursive: true });
    const environment = { PATH: [kimiBin, "/usr/bin"].join(delimiter) };

    augmentCliPath(environment, home, "linux");

    assert.equal(environment.PATH.split(delimiter).filter((entry) => entry === kimiBin).length, 1);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
