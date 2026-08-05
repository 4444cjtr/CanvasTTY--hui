import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { posix, win32 } from "node:path";

export function augmentCliPath(
  environment: NodeJS.ProcessEnv = process.env,
  homeDirectory = homedir(),
  platform = process.platform,
  directoryExists: (directory: string) => boolean = existsSync
): void {
  const pathDelimiter = platform === "win32" ? ";" : ":";
  const path = platform === "win32" ? win32 : posix;
  const pathKey = Object.keys(environment).find((key) => key.toLowerCase() === "path") ?? "PATH";
  const currentEntries = (environment[pathKey] ?? "").split(pathDelimiter).filter(Boolean);
  const userCliDirectories = [
    path.join(homeDirectory, ".kimi-code", "bin"),
    path.join(homeDirectory, ".local", "bin"),
    path.join(homeDirectory, ".npm-global", "bin"),
    path.join(homeDirectory, ".bun", "bin"),
    path.join(homeDirectory, ".cargo", "bin"),
    ...(platform === "win32" ? [path.join(homeDirectory, "AppData", "Roaming", "npm")] : [])
  ].filter(directoryExists);

  environment[pathKey] = [...new Set([...currentEntries, ...userCliDirectories])].join(pathDelimiter);
}
