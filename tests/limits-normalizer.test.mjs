import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeClaudeLimits,
  normalizeCodexLimits,
  normalizeKimiLimits
} from "../src/main/services/LimitsService.ts";

test("normalizes primary and secondary windows without duplicating the legacy bucket", () => {
  const windows = normalizeCodexLimits({
    rateLimits: {
      limitId: "codex",
      limitName: null,
      primary: { usedPercent: 39, windowDurationMins: 300, resetsAt: 1_786_160_179 },
      secondary: { usedPercent: 12, windowDurationMins: 10_080, resetsAt: 1_786_473_230 }
    },
    rateLimitsByLimitId: {
      codex: {
        limitId: "codex",
        primary: { usedPercent: 39, windowDurationMins: 300, resetsAt: 1_786_160_179 }
      },
      codex_spark: {
        limitId: "codex_spark",
        limitName: "Codex Spark",
        primary: { usedPercent: 4, windowDurationMins: 10_080, resetsAt: 1_786_473_230 }
      }
    }
  });

  assert.deepEqual(windows.map((window) => window.id), [
    "codex:primary",
    "codex:secondary",
    "codex_spark:primary"
  ]);
  assert.deepEqual(windows.map((window) => window.isDefaultBucket), [true, true, false]);
  assert.deepEqual(windows.map((window) => window.slot), ["primary", "secondary", "primary"]);
  assert.equal(windows[0].resetsAt, 1_786_160_179_000);
  assert.equal(windows[2].label, "Codex Spark");
});

test("clamps a real percentage and preserves millisecond reset timestamps", () => {
  const [window] = normalizeCodexLimits({
    rateLimits: {
      limitId: "codex",
      primary: { usedPercent: 140, windowDurationMins: 60, resetsAt: 1_786_160_179_123 }
    }
  });

  assert.equal(window.usedPercent, 100);
  assert.equal(window.resetsAt, 1_786_160_179_123);
});

test("does not invent windows from absent data", () => {
  assert.deepEqual(normalizeCodexLimits({ rateLimits: null, rateLimitsByLimitId: {} }), []);
  assert.throws(() => normalizeCodexLimits({ unrelated: true }));
  assert.throws(() => normalizeCodexLimits(null));
});

test("normalizes Claude statusline and usage API windows", () => {
  const windows = normalizeClaudeLimits({
    five_hour: { utilization: 23.5, resets_at: "2026-08-05T09:00:00Z" },
    seven_day: { utilization: 41.2, resets_at: "2026-08-09T09:00:00Z" }
  });

  assert.deepEqual(windows.map((window) => ({
    id: window.id,
    usedPercent: window.usedPercent,
    windowMinutes: window.windowMinutes,
    resetsAt: window.resetsAt
  })), [
    { id: "claude:five_hour", usedPercent: 23.5, windowMinutes: 300, resetsAt: Date.parse("2026-08-05T09:00:00Z") },
    { id: "claude:seven_day", usedPercent: 41.2, windowMinutes: 10_080, resetsAt: Date.parse("2026-08-09T09:00:00Z") }
  ]);
});

test("normalizes Kimi weekly and rolling usage without exposing account metadata", () => {
  const windows = normalizeKimiLimits({
    user: { userId: "ignored" },
    usage: { limit: "100", used: "36", remaining: "64", resetTime: "2026-08-08T18:09:15Z" },
    limits: [{
      window: { duration: 300, timeUnit: "TIME_UNIT_MINUTE" },
      detail: { limit: "100", remaining: "88", resetTime: "2026-08-05T10:09:15Z" }
    }]
  });

  assert.deepEqual(windows.map((window) => ({
    id: window.id,
    usedPercent: window.usedPercent,
    used: window.used,
    limit: window.limit,
    windowMinutes: window.windowMinutes
  })), [
    { id: "kimi:weekly", usedPercent: 36, used: 36, limit: 100, windowMinutes: 10_080 },
    { id: "kimi:rolling:300:0", usedPercent: 12, used: 12, limit: 100, windowMinutes: 300 }
  ]);
});
