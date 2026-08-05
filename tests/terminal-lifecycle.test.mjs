import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const terminalCardPath = new URL(
  "../src/renderer/src/features/terminal/TerminalCard.tsx",
  import.meta.url
);
const appStylesPath = new URL("../src/renderer/src/styles/app.css", import.meta.url);

test("palette changes retheme the live xterm without recreating it", async () => {
  const source = await readFile(terminalCardPath, "utf8");
  const mountDependencies = effectDependenciesContaining(source, "new Terminal({");

  assert.equal(mountDependencies, "session.id");
  assert.match(source, /terminal\.options\.theme = terminalTheme\(palette\)/);
});

test("terminal copy shortcuts write the xterm selection without reaching the PTY", async () => {
  const source = await readFile(terminalCardPath, "utf8");

  assert.match(source, /terminal\.attachCustomKeyEventHandler/);
  assert.match(source, /window\.canvasTTY\.clipboard\.writeText\(terminal\.getSelection\(\)\)/);
  assert.match(source, /return false;/);
});

test("terminal viewport keeps the palette background after row-sized fits", async () => {
  const [source, styles] = await Promise.all([
    readFile(terminalCardPath, "utf8"),
    readFile(appStylesPath, "utf8")
  ]);

  assert.match(source, /"--terminal-background": terminalBackground/);
  assert.match(styles, /\.terminal-card__surface \.xterm-viewport \{ background-color: var\(--terminal-background, #202430\); \}/);
});

function effectDependenciesContaining(source, marker) {
  const markerIndex = source.indexOf(marker);
  assert.notEqual(markerIndex, -1, `Could not find ${marker}`);

  const effectStart = source.lastIndexOf("useEffect(() => {", markerIndex);
  assert.notEqual(effectStart, -1, "Could not find the xterm mount effect");

  const dependencyStart = source.indexOf("}, [", markerIndex);
  const dependencyEnd = source.indexOf("]);", dependencyStart);
  assert.notEqual(dependencyStart, -1, "Could not find the xterm mount dependencies");
  assert.notEqual(dependencyEnd, -1, "Could not parse the xterm mount dependencies");

  return source.slice(dependencyStart + 4, dependencyEnd).trim();
}
