import assert from "node:assert/strict";
import test from "node:test";
import { augmentCliPath } from "../src/main/services/cliEnvironment.ts";

test("adds existing Linux user CLI directories without replacing desktop PATH", () => {
  const kimiBin = "/test-home/.kimi-code/bin";
  const environment = { PATH: "/usr/local/bin:/usr/bin" };

  augmentCliPath(environment, "/test-home", "linux", (directory) => directory === kimiBin);

  assert.equal(environment.PATH, `/usr/local/bin:/usr/bin:${kimiBin}`);
});

test("uses Windows PATH casing, separators, and user directories", () => {
  const kimiBin = "C:\\Users\\Kisa\\.kimi-code\\bin";
  const npmBin = "C:\\Users\\Kisa\\AppData\\Roaming\\npm";
  const environment = { Path: "C:\\Windows\\System32;C:\\Program Files\\nodejs" };
  const existing = new Set([kimiBin, npmBin]);

  augmentCliPath(environment, "C:\\Users\\Kisa", "win32", (directory) => existing.has(directory));

  assert.equal(
    environment.Path,
    `C:\\Windows\\System32;C:\\Program Files\\nodejs;${kimiBin};${npmBin}`
  );
  assert.equal("PATH" in environment, false);
});

test("does not duplicate CLI directories already present in PATH", () => {
  const kimiBin = "/test-home/.kimi-code/bin";
  const environment = { PATH: `${kimiBin}:/usr/bin` };

  augmentCliPath(environment, "/test-home", "linux", (directory) => directory === kimiBin);

  assert.equal(environment.PATH.split(":").filter((entry) => entry === kimiBin).length, 1);
});
