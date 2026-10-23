import { describe, it, expect } from "vitest";
import { createTurnLimiter, isUsageLimitError, pauseUntilFromError, DEFAULT_PAUSE_MS, MAX_CONCURRENT_TURNS, DAILY_TURNS } from "../src/limits-core.js";

describe("limits constants", () => {
  it("match the plan", () => {
    expect(MAX_CONCURRENT_TURNS).toBe(2);
    expect(DAILY_TURNS).toBe(40);
  });
});

describe("semaphore", () => {
  it("refuses a 3rd concurrent turn and frees on release", () => {
    const l = createTurnLimiter({ ownerId: "o" });
    const a = l.tryAcquire("a");
    const b = l.tryAcquire("b");
    expect(a.ok && b.ok).toBe(true);
    expect(l.tryAcquire("c")).toEqual({ ok: false, reason: "busy" });
    expect(l.tryAcquire("o")).toEqual({ ok: false, reason: "busy" }); // owner is not exempt from the cap
    if (a.ok) a.release();
    expect(l.tryAcquire("c").ok).toBe(true);
  });
  it("allows one turn per user; double release is harmless", () => {
    const l = createTurnLimiter();
    const a = l.tryAcquire("a");
    expect(l.tryAcquire("a")).toEqual({ ok: false, reason: "user-busy" });
    if (a.ok) {
      a.release();
      a.release();
    }
    expect(l.usage().activeTurns).toBe(0);
  });
});

describe("daily budget", () => {
  it("stops at N for users, not for the owner, and resets next day", () => {
    let t = Date.parse("2026-10-23T10:00:00Z");
    const l = createTurnLimiter({ ownerId: "o", dailyTurns: 3, now: () => t });
    for (let i = 0; i < 3; i++) {
      const r = l.tryAcquire("u");
      expect(r.ok).toBe(true);
      if (r.ok) r.release();
    }
    expect(l.tryAcquire("u")).toEqual({ ok: false, reason: "budget" });
    for (let i = 0; i < 5; i++) {
      const r = l.tryAcquire("o");
      expect(r.ok).toBe(true);
      if (r.ok) r.release();
    }
    t = Date.parse("2026-10-24T00:00:01Z");
    expect(l.tryAcquire("u").ok).toBe(true);
  });
  it("a refused turn does not consume budget", () => {
    const l = createTurnLimiter({ dailyTurns: 1, maxConcurrent: 1 });
    const a = l.tryAcquire("a");
    l.tryAcquire("b"); // busy
    if (a.ok) a.release();
    expect(l.tryAcquire("b").ok).toBe(true);
  });
});

describe("pause", () => {
  it("refuses non-owners until the reset, owner still allowed", () => {
    let t = 1_000_000;
    const l = createTurnLimiter({ ownerId: "o", now: () => t });
    l.pause(t + 60_000);
    expect(l.tryAcquire("u")).toEqual({ ok: false, reason: "paused" });
    expect(l.tryAcquire("o").ok).toBe(true);
    expect(l.usage().pausedUntil).not.toBeNull();
    t += 60_001;
    expect(l.tryAcquire("u").ok).toBe(true);
    expect(l.usage().pausedUntil).toBeNull();
  });
});

describe("usage-limit error parsing", () => {
  it("detects usage-limit messages", () => {
    expect(isUsageLimitError("Claude AI usage limit reached|1761400000")).toBe(true);
    expect(isUsageLimitError("You've hit your limit")).toBe(true);
    expect(isUsageLimitError("ECONNRESET")).toBe(false);
  });
  it("uses the epoch reset time, else 15 minutes", () => {
    const now = 1_761_000_000_000;
    expect(pauseUntilFromError("usage limit reached|1761400000", now)).toBe(1_761_400_000_000);
    expect(pauseUntilFromError("usage limit reached|1000000000", now)).toBe(now + DEFAULT_PAUSE_MS); // past
    expect(pauseUntilFromError("You've hit your limit", now)).toBe(now + DEFAULT_PAUSE_MS);
  });
});
