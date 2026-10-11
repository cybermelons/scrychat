import { describe, it, expect } from "vitest";
import { healthPills, type HealthResponse } from "../src/health-pills.js";

function make(over: {
  skillLoaded?: boolean;
  db?: Partial<HealthResponse["db"]>;
  collection?: Partial<HealthResponse["collection"]>;
} = {}): HealthResponse {
  return {
    ok: true,
    repoRoot: "/virtual/repo",
    skillLoaded: over.skillLoaded ?? true,
    skillPath: "/virtual/repo/.claude/skills/edh-deck-builder/SKILL.md",
    db: {
      exists: true,
      path: "/virtual/scrychat.db",
      cardCount: 12345,
      arenaPopulated: 0,
      ingestStamp: "2026-01-02T03:04:05.000Z",
      usableAsMirror: true,
      ...over.db,
    },
    collection: {
      exists: true,
      path: "/virtual/collection.json",
      importedAt: "2026-01-01T00:00:00.000Z",
      freshness: "fresh",
      ageDays: 2,
      label: "2d ago",
      staleAfterDays: 14,
      uniqueOwned: 100,
      ...over.collection,
    },
  };
}

const [mirror, skill, arena] = [0, 1, 2];
const pill = (h: HealthResponse, i: number) => healthPills(h)[i]!;

describe("healthPills shape", () => {
  it("always 3 pills in order mirror, skill, arena", () => {
    for (const h of [
      make(),
      make({ db: { exists: false, cardCount: null, usableAsMirror: false }, skillLoaded: false }),
      make({ collection: { exists: false, freshness: "unknown", label: "unknown" } }),
    ]) {
      const p = healthPills(h);
      expect(p).toHaveLength(3);
      expect(p.map((x) => x.id)).toEqual(["health-mirror", "health-skill", "health-arena"]);
    }
  });
});

describe("mirror pill", () => {
  it("absent -> warn", () => {
    const p = pill(make({ db: { exists: false, cardCount: null, usableAsMirror: false } }), mirror);
    expect(p.tone).toBe("warn");
    expect(p.label).toBe("mirror: absent");
  });
  it("present but empty -> warn, distinct label", () => {
    const p = pill(make({ db: { cardCount: 0, usableAsMirror: false } }), mirror);
    expect(p.tone).toBe("warn");
    expect(p.label).toBe("mirror: empty");
  });
  it("populated and usable -> ok with count", () => {
    const p = pill(make(), mirror);
    expect(p.tone).toBe("ok");
    expect(p.label).toBe("mirror: 12,345 cards");
  });
  it("mentions arena tags when arenaPopulated > 0", () => {
    const p = pill(make({ db: { arenaPopulated: 4321 } }), mirror);
    expect(p.tone).toBe("ok");
    expect(p.label).toBe("mirror: 12,345 cards + 4,321 arena");
  });
  it("populated but NOT usable -> warn, never ok (#50)", () => {
    const p = pill(make({ db: { cardCount: 500, usableAsMirror: false } }), mirror);
    expect(p.tone).toBe("warn");
    expect(p.label).toContain("500");
    expect(p.title).toContain("NOT usable");
  });
  it("cardCount null while exists -> dim, unknown", () => {
    const p = pill(make({ db: { cardCount: null, usableAsMirror: false } }), mirror);
    expect(p.tone).toBe("dim");
    expect(p.label).toBe("mirror: unknown");
  });
});

describe("skill pill", () => {
  it("loaded -> ok", () => {
    const p = pill(make(), skill);
    expect(p.tone).toBe("ok");
    expect(p.label).toBe("skill: readable");
  });
  it("not loaded -> warn", () => {
    const p = pill(make({ skillLoaded: false }), skill);
    expect(p.tone).toBe("warn");
    expect(p.label).toBe("skill: missing");
  });
});

describe("arena pill", () => {
  it("fresh -> ok, uses server label", () => {
    const p = pill(make(), arena);
    expect(p.tone).toBe("ok");
    expect(p.label).toBe("arena: 2d ago");
  });
  it("stale -> warn", () => {
    const p = pill(make({ collection: { freshness: "stale", ageDays: 20, label: "20d ago" } }), arena);
    expect(p.tone).toBe("warn");
    expect(p.label).toBe("arena: 20d ago");
  });
  it("future -> warn", () => {
    const p = pill(make({ collection: { freshness: "future", ageDays: null, label: "clock skew" } }), arena);
    expect(p.tone).toBe("warn");
    expect(p.label).toBe("arena: clock skew");
  });
  it("unknown freshness -> dim", () => {
    const p = pill(make({ collection: { freshness: "unknown", ageDays: null, label: "unknown" } }), arena);
    expect(p.tone).toBe("dim");
  });
  it("snapshot absent -> dim, 'arena: none'", () => {
    const p = pill(make({ collection: { exists: false, freshness: "unknown", ageDays: null, label: "unknown" } }), arena);
    expect(p.tone).toBe("dim");
    expect(p.label).toBe("arena: none");
  });
  it("threshold comes from the server echo, not a client copy", () => {
    const p = pill(make({ collection: { freshness: "stale", staleAfterDays: 30 } }), arena);
    expect(p.title).toContain("30 days");
    expect(p.title).not.toContain("14");
  });
});
