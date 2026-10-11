import { describe, it, expect } from "vitest";
import { getDbHealth } from "../src/health-core.js";

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
