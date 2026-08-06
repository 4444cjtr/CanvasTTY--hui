import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { startupPageUrl } from "../src/main/startupPage.ts";

const mainPath = new URL("../src/main/index.ts", import.meta.url);

test("main process acquires the single-instance lock before readiness", async () => {
  const source = await readFile(mainPath, "utf8");
  const lock = source.indexOf("app.requestSingleInstanceLock()");
  const ready = source.indexOf("app.whenReady()");

  assert.notEqual(lock, -1);
  assert.notEqual(ready, -1);
  assert.ok(lock < ready);
  assert.match(source, /app\.on\("second-instance", focusMainWindow\)/);
});

test("startup window is visible immediately and failures remain visible", async () => {
  const source = await readFile(mainPath, "utf8");

  assert.match(source, /show: true/);
  assert.match(source, /startupPageUrl\(\{ locale: app\.getLocale\(\) \}\)/);
  assert.match(source, /showStartupFailure/);
  assert.doesNotMatch(source, /ready-to-show/);
});

test("startup failure page escapes diagnostic text", () => {
  const url = startupPageUrl({ locale: "ru", error: '<script>alert("x")</script>' });
  const html = decodeURIComponent(url.slice(url.indexOf(",") + 1));

  assert.match(html, /CanvasTTY не удалось запустить/);
  assert.match(html, /&lt;script&gt;alert\(&quot;x&quot;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
});
