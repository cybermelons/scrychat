import { describe, it, expect } from "vitest";
import { getCollectionHealth, getDbHealth } from "../src/health-core.js";

// Fixtures are plain injected values, so this test touches no sqlite driver
// and never opens data/scrychat.db.
const DB = "/virtual/scrychat.db";
const present = () => new Date("2026-01-02T03:04:05.000Z");
const absent = () => null;

describe("getDbHealth", () => {
  it("absent file: exists false, cardCount null, not usable", () => {
    let called = false;
    const h = getDbHealth(DB, {
      statMtime: absent,
      readCounts: () => {
        called = true;
        return { cardCount: 0, arenaPopulated: 0 };
      },
      isUsableAsMirror: () => false,
    });
    expect(h.exists).toBe(false);
    expect(h.cardCount).toBeNull();
    expect(h.arenaPopulated).toBeNull();
    expect(h.ingestStamp).toBeNull();
    expect(h.usableAsMirror).toBe(false);
    expect(called).toBe(false); // diagnostic must not open a file that isn't there
  });

  it("present but empty: exists true, cardCount 0, not usable (empty != absent)", () => {
    const h = getDbHealth(DB, {
      statMtime: present,
      readCounts: () => ({ cardCount: 0, arenaPopulated: 0 }),
      isUsableAsMirror: () => false,
    });
    expect(h.exists).toBe(true);
    expect(h.cardCount).toBe(0);
    expect(h.arenaPopulated).toBe(0);
    expect(h.usableAsMirror).toBe(false);
    expect(h.ingestStamp).not.toBeNull();
  });

  it("present with cards: exists true, cardCount >= 1, usable", () => {
    const h = getDbHealth(DB, {
      statMtime: present,
      readCounts: () => ({ cardCount: 2, arenaPopulated: 1 }),
      isUsableAsMirror: () => true,
    });
    expect(h.exists).toBe(true);
    expect(h.cardCount).toBe(2);
    expect(h.arenaPopulated).toBe(1);
    expect(h.usableAsMirror).toBe(true);
  });

  it("present but no cards table: cardCount null (undeterminable), exists true", () => {
    const h = getDbHealth(DB, {
      statMtime: present,
      readCounts: () => ({ cardCount: null, arenaPopulated: null }),
      isUsableAsMirror: () => false,
    });
    expect(h.exists).toBe(true);
    expect(h.cardCount).toBeNull();
    expect(h.arenaPopulated).toBeNull();
  });

  it("never reports an ingestStamp while exists is false", () => {
    for (const statMtime of [absent, present]) {
      const h = getDbHealth(DB, {
        statMtime,
        readCounts: () => ({ cardCount: 0, arenaPopulated: 0 }),
        isUsableAsMirror: () => false,
      });
      if (h.ingestStamp !== null) expect(h.exists).toBe(true);
    }
    const a = getDbHealth(DB, { statMtime: absent, isUsableAsMirror: () => false });
    expect(a.ingestStamp).toBeNull();
    expect(a.exists).toBe(false);
    const p = getDbHealth(DB, {
      statMtime: present,
      readCounts: () => ({ cardCount: 0, arenaPopulated: 0 }),
      isUsableAsMirror: () => false,
    });
    expect(p.ingestStamp).not.toBeNull();
    expect(p.exists).toBe(true);
  });
});

describe("getCollectionHealth", () => {
  const NOW = Date.parse("2026-06-01T12:00:00.000Z");
  const DAY = 86_400_000;
  const CP = "/virtual/collection.json";
  const daysAgo = (d: number) => new Date(NOW - d * DAY).toISOString();
  const at = (d: number, extra: { uniqueOwned?: number } = {}) =>
    getCollectionHealth(CP, {
      readStats: () => ({ exists: true, importedAt: daysAgo(d), ...extra }),
      now: () => NOW,
    });

  it("absent file: exists false, unknown, ageDays null, uniqueOwned null, staleAfterDays 14", () => {
    const h = getCollectionHealth(CP, { readStats: () => ({ exists: false }), now: () => NOW });
    expect(h.exists).toBe(false);
    expect(h.importedAt).toBeNull();
    expect(h.freshness).toBe("unknown");
    expect(h.ageDays).toBeNull();
    expect(h.label).toBe("unknown");
    expect(h.uniqueOwned).toBeNull();
    expect(h.staleAfterDays).toBe(14);
    expect(h.path).toBe(CP);
  });

  it("fresh snapshot (2 days) -> fresh, ageDays 2", () => {
    const h = at(2);
    expect(h.freshness).toBe("fresh");
    expect(h.ageDays).toBe(2);
    expect(h.exists).toBe(true);
  });

  it("stale snapshot (200 days) -> stale, ageDays 200", () => {
    const h = at(200);
    expect(h.freshness).toBe("stale");
    expect(h.ageDays).toBe(200);
  });

  // LITERAL 13 and 14 on purpose. Do NOT rewrite in terms of SNAPSHOT_STALE_DAYS
  // or staleAfterDays: a test derived from the constant moves with it and can
  // never fail when the threshold is wrong.
  it("literal boundary: 13 days is fresh, 14 days is stale", () => {
    expect(at(13).freshness).toBe("fresh");
    expect(at(13).ageDays).toBe(13);
    expect(at(14).freshness).toBe("stale");
    expect(at(14).ageDays).toBe(14);
  });

  it("importedAt beyond tolerance in the future -> future, ageDays null", () => {
    const h = at(-3);
    expect(h.freshness).toBe("future");
    expect(h.ageDays).toBeNull();
  });

  it("uniqueOwned passes through when present", () => {
    expect(at(1, { uniqueOwned: 1234 }).uniqueOwned).toBe(1234);
  });

  it("never reports a non-null ageDays while exists is false", () => {
    const cases = [
      { exists: false },
      { exists: false, importedAt: daysAgo(2) },
      { exists: true, importedAt: daysAgo(2) },
    ];
    for (const stats of cases) {
      const h = getCollectionHealth(CP, { readStats: () => stats, now: () => NOW });
      if (!h.exists) {
        expect(h.ageDays).toBeNull();
        expect(h.importedAt).toBeNull();
      }
    }
  });
});
