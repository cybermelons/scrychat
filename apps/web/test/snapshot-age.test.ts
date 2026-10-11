import { describe, it, expect } from "vitest";
import { snapshotAge, SNAPSHOT_STALE_DAYS } from "../src/snapshot-age.js";

const NOW = Date.parse("2026-10-10T12:00:00Z");
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe("snapshotAge freshness", () => {
  it.each([0, 1, SNAPSHOT_STALE_DAYS - 1])("%i days old is fresh", (d) => {
    const r = snapshotAge(ago(d * DAY), NOW);
    expect(r.freshness).toBe("fresh");
    expect(r.ageDays).toBe(d);
  });

  it("boundary: just under the threshold is fresh, exactly at it is stale", () => {
    expect(snapshotAge(ago(SNAPSHOT_STALE_DAYS * DAY - 1), NOW).freshness).toBe("fresh");
    expect(snapshotAge(ago(SNAPSHOT_STALE_DAYS * DAY), NOW).freshness).toBe("stale");
  });

  it("threshold is two weeks: 13d fresh, 14d stale (literal, not the constant)", () => {
    expect(snapshotAge(ago(13 * DAY), NOW).freshness).toBe("fresh");
    expect(snapshotAge(ago(14 * DAY), NOW).freshness).toBe("stale");
  });

  it("200 days old is stale", () => {
    const r = snapshotAge(ago(200 * DAY), NOW);
    expect(r.freshness).toBe("stale");
    expect(r.ageDays).toBe(200);
    expect(r.label).toBe("200d ago");
  });
});

describe("snapshotAge future timestamps", () => {
  it("beyond tolerance is clock skew, not 'just now'", () => {
    const r = snapshotAge(new Date(NOW + 2 * HOUR).toISOString(), NOW);
    expect(r).toEqual({ freshness: "future", ageDays: null, label: "clock skew" });
  });

  it("within the 60s tolerance is fresh and just now", () => {
    const r = snapshotAge(new Date(NOW + 30_000).toISOString(), NOW);
    expect(r.freshness).toBe("fresh");
    expect(r.label).toBe("just now");
  });
});

describe("snapshotAge unknown input", () => {
  it.each([null, undefined, "", "garbage"])("%j is unknown", (v) => {
    expect(snapshotAge(v, NOW)).toEqual({ freshness: "unknown", ageDays: null, label: "unknown" });
  });
});

describe("snapshotAge label vocabulary", () => {
  it("covers just now, minutes, hours, days", () => {
    expect(snapshotAge(ago(30_000), NOW).label).toBe("just now");
    expect(snapshotAge(ago(5 * MIN), NOW).label).toBe("5m ago");
    expect(snapshotAge(ago(3 * HOUR), NOW).label).toBe("3h ago");
    expect(snapshotAge(ago(12 * DAY), NOW).label).toBe("12d ago");
  });
});
