import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export function augmentCliPath(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = homedir(),
  platform = process.platform
): void {
  const pathDelimiter = platform === "win32" ? ";" : ":";
  const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const currentEntries = (environment[pathKey] ?? "").split(pathDelimiter).filter(Boolean);
  const userCliDirectories = [
    join(homeDirectory, ".kimi-code", "bin"),
    join(homeDirectory, ".local", "bin"),
    join(homeDirectory, ".npm-global", "bin"),
    join(homeDirectory, ".bun", "bin"),
    join(homeDirectory, ".cargo", "bin"),
    ...(platform === "win32" ? [join(homeDirectory, "AppData", "Roaming", "npm")] : [])
  ].filter((directory) => existsSync(directory));

  environment[pathKey] = [...new Set([...currentEntries, ...userCliDirectories])].join(pathDelimiter);
}
