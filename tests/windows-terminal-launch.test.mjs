import assert from "node:assert/strict";
import test from "node:test";
import { resolveTerminalLaunch } from "../src/main/services/terminalLaunch.ts";

function existing(...paths) {
  const entries = new Set(paths.map((path) => path.toLowerCase()));
  return (path) => entries.has(path.toLowerCase());
}

test("Windows terminal selects the built-in PowerShell instead of /bin/bash", () => {
  const powershell = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  const launch = resolveTerminalLaunch("terminal", "normal", [], {
    platform: "win32",
    environment: { SystemRoot: "C:\\Windows" },
    fileExists: existing(powershell)
  });

  assert.deepEqual(launch, {
    command: powershell,
    args: ["-NoLogo", "-NoProfile"]
  });
});

test("Windows terminal falls back to the configured command prompt", () => {
  const commandPrompt = "D:\\Windows\\System32\\cmd.exe";
  const launch = resolveTerminalLaunch("terminal", "normal", [], {
    platform: "win32",
    environment: { ComSpec: commandPrompt },
    fileExists: existing(commandPrompt)
  });

  assert.deepEqual(launch, { command: commandPrompt, args: ["/d"] });
});

test("Unix terminal keeps the configured login shell", () => {
  assert.deepEqual(
    resolveTerminalLaunch("terminal", "normal", [], {
      platform: "linux",
      environment: { SHELL: "/usr/bin/zsh" }
    }),
    { command: "/usr/bin/zsh", args: ["-l"] }
  );
});

test("Windows Codex resolves an absolute native executable and preserves bridge arguments", () => {
  const codex = "C:\\Users\\dev\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe";
  const launch = resolveTerminalLaunch("codex", "yolo", ["--bridge", "C:\\runtime path\\helper"], {
    platform: "win32",
    homeDirectory: "C:\\Users\\dev",
    environment: { LOCALAPPDATA: "C:\\Users\\dev\\AppData\\Local" },
    fileExists: existing(codex)
  });

  assert.deepEqual(launch, {
    command: codex,
    args: [
      "--dangerously-bypass-approvals-and-sandbox",
      "--bridge",
      "C:\\runtime path\\helper"
    ]
  });
});

test("Windows provider lookup supports a native executable from PATH", () => {
  const kimi = "D:\\Tools\\kimi.exe";
  const launch = resolveTerminalLaunch("kimi", "normal", [], {
    platform: "win32",
    homeDirectory: "C:\\Users\\dev",
    environment: { Path: '"D:\\Tools";C:\\Windows' },
    fileExists: existing(kimi)
  });

  assert.deepEqual(launch, { command: kimi, args: [] });
});

test("Windows provider lookup respects PATH before known fallback directories", () => {
  const preferred = "D:\\Tools\\codex.exe";
  const fallback = "C:\\Users\\dev\\.local\\bin\\codex.exe";
  const launch = resolveTerminalLaunch("codex", "normal", [], {
    platform: "win32",
    homeDirectory: "C:\\Users\\dev",
    environment: { Path: "D:\\Tools" },
    fileExists: existing(preferred, fallback)
  });

  assert.equal(launch.command, preferred);
});

test("Windows batch provider shims are launched through cmd.exe", () => {
  const claude = "C:\\Users\\dev user\\AppData\\Roaming\\npm\\claude.cmd";
  const commandPrompt = "C:\\Windows\\System32\\cmd.exe";
  const launch = resolveTerminalLaunch("claude", "normal", ["--bridge"], {
    platform: "win32",
    homeDirectory: "C:\\Users\\dev user",
    environment: {
      APPDATA: "C:\\Users\\dev user\\AppData\\Roaming",
      ComSpec: commandPrompt
    },
    fileExists: existing(claude, commandPrompt)
  });

  assert.deepEqual(launch, {
    command: commandPrompt,
    args: '/d /s /c "C:\\Users\\dev^ user\\AppData\\Roaming\\npm\\claude.cmd ^"--bridge^""'
  });
});

test("missing Windows providers report an actionable error before node-pty", () => {
  assert.throws(
    () => resolveTerminalLaunch("kimi", "normal", [], {
      platform: "win32",
      homeDirectory: "C:\\Users\\dev",
      environment: {},
      fileExists: () => false
    }),
    /Kimi CLI was not found on Windows\. Install it, then restart CanvasTTY\. Checked PATH and these directories:.*Supported launchers: \.exe, \.com, \.cmd, and \.bat\./u
  );
});
