import { describe, it, expect } from "vitest";
import { goldfish, goldfishChart, resolveDeckLibrary, CHART_MAX_ROWS, ONLINE_THRESHOLD } from "../src/goldfish.js";
import type { GoldfishResult } from "../src/goldfish.js";
import type { CardResolver, Deck, ResolvedCard } from "../src/decks.js";

const card = (name: string, cmc: number, typeLine: string): ResolvedCard => ({
  name, cmc, typeLine, colorIdentity: [], legalCommander: false,
});
const land = (i: number) => card(`Forest ${i}`, 0, "Basic Land — Forest");
const elf = (i: number) => card(`Elf ${i}`, 1 + (i % 3), "Creature — Elf");
const coloured = (name: string, cmc: number, typeLine: string, manaCost: string | null, producedMana: string[] | null): ResolvedCard => ({
  ...card(name, cmc, typeLine), manaCost, producedMana,
});
const mixed = () => [
  ...Array.from({ length: 36 }, (_, i) => land(i)),
  ...Array.from({ length: 24 }, (_, i) => elf(i)),
];

describe("goldfish", () => {
  it("is deterministic for same deck + seed", () => {
    expect(goldfish(mixed(), { seed: 7 })).toEqual(goldfish(mixed(), { seed: 7 }));
    expect(JSON.stringify(goldfish(mixed(), { seed: 7 }))).toBe(JSON.stringify(goldfish(mixed(), { seed: 7 })));
  });

  it("differs across seeds", () => {
    expect(goldfish(mixed(), { seed: 1 })).not.toEqual(goldfish(mixed(), { seed: 2 }));
  });

  // Breaking it: a result that echoed defaults instead of its real options would let
  // goldfish_compare report a seed neither run used.
  it("echoes back the options it ran under", () => {
    const r = goldfish(mixed(), { iterations: 50, seed: 11, maxTurns: 9 });
    expect(r.seed).toBe(11);
    expect(r.iterations).toBe(50);
    expect(r.maxTurns).toBe(9);
  });

  const cheap = () => Array.from({ length: 60 }, (_, i) => (i < 20 ? land(i) : elf(i)));
  const opts = { iterations: 50, seed: 11, maxTurns: 9 };

  // Breaking it: without this, a delta between two decks could be RNG drift rather
  // than a real difference.
  it("two different decks under one seed are each reproducible", () => {
    expect(goldfish(mixed(), opts).turnsToOnline).toBe(goldfish(mixed(), opts).turnsToOnline);
    expect(goldfish(cheap(), opts).turnsToOnline).toBe(goldfish(cheap(), opts).turnsToOnline);
  });

  // Breaking it: this is the number goldfish_compare reports; if it moved between runs
  // the tool would be reporting noise as a finding.
  it("the delta between two decks is stable across repeat runs", () => {
    const deltaFirst = goldfish(mixed(), opts).turnsToOnline - goldfish(cheap(), opts).turnsToOnline;
    const deltaSecond = goldfish(mixed(), opts).turnsToOnline - goldfish(cheap(), opts).turnsToOnline;
    expect(deltaSecond).toBe(deltaFirst);
  });

  // Breaking it: a simulation that ignored its seed would make every comparison look
  // perfectly stable while being meaningless.
  it("a different seed is allowed to give a different answer", () => {
    const seen = new Set([1, 2, 3, 4, 5, 6].map((seed) => goldfish(mixed(), { iterations: 50, seed, maxTurns: 9 }).turnsToOnline));
    expect(seen.size).toBeGreaterThan(1);
  });

  it("all-lands deck never casts", () => {
    const r = goldfish(Array.from({ length: 40 }, (_, i) => land(i)));
    expect(r.castByTurn.every((x) => x === 0)).toBe(true);
    expect(r.turnToCast).toEqual({});
    expect(r.stalledGames).toBe(0);
  });

  it("land-heavy cheap deck casts by turn 3", () => {
    const r = goldfish(mixed(), { seed: 3 });
    expect(r.castByTurn[3]).toBeGreaterThan(0);
    expect(r.manaAvailable[3]).toBeGreaterThan(1);
    expect(r.seed).toBe(3);
    expect(r.iterations).toBe(1000);
  });

  it("does not throw on degenerate input", () => {
    expect(() => goldfish([])).not.toThrow();
    const noLands = goldfish(Array.from({ length: 30 }, (_, i) => elf(i)));
    expect(noLands.manaAvailable.every((x) => x === 0)).toBe(true);
    expect(noLands.stalledGames).toBe(1000);
    expect(goldfish([], { iterations: 0 }).mulliganRate).toBe(0);
  });

  it("colour requirements bite: {W}{W} needs white sources", () => {
    const ww = Array.from({ length: 24 }, (_, i) => coloured(`Knight ${i}`, 2, "Creature — Knight", "{W}{W}", null));
    const forest = (i: number) => coloured(`Forest ${i}`, 0, "Basic Land — Forest", null, ["G"]);
    const plains = (i: number) => coloured(`Plains ${i}`, 0, "Basic Land — Plains", null, ["W"]);
    const a = goldfish([...Array.from({ length: 36 }, (_, i) => forest(i)), ...ww], { seed: 5 });
    expect(a.castByTurn.every((x) => x === 0)).toBe(true);
    expect(a.turnToCast["2"]).toBeUndefined();
    const b = goldfish([
      ...Array.from({ length: 18 }, (_, i) => forest(i)),
      ...Array.from({ length: 18 }, (_, i) => plains(i)),
      ...ww,
    ], { seed: 5 });
    expect(b.castByTurn[15]).toBeGreaterThan(0);
    expect(b.turnToCast["2"]).toBeDefined();
  });

  // Regression: the land drop first shipped asking "is this colour missing entirely?"
  // (`!src[m]`), so a {W}{W} deck holding one Plains stopped seeking a SECOND white
  // source and played a Forest instead. Demand has to be the pip COUNT, not a boolean.
  // Measured at the time: median cast turn 9-10 with the boolean, 8-9 with the count.
  it("land drop seeks a second source of a colour needed twice", () => {
    const ww = Array.from({ length: 24 }, (_, i) => coloured(`Knight ${i}`, 2, "Creature — Knight", "{W}{W}", null));
    const forest = (i: number) => coloured(`Forest ${i}`, 0, "Basic Land — Forest", null, ["G"]);
    const plains = (i: number) => coloured(`Plains ${i}`, 0, "Basic Land — Plains", null, ["W"]);
    // White is scarce: 4 Plains against 32 Forests. The only way to cast on curve is to
    // take every Plains that turns up, even once one is already in play.
    const scarce = [
      ...Array.from({ length: 4 }, (_, i) => plains(i)),
      ...Array.from({ length: 32 }, (_, i) => forest(i)),
      ...ww,
    ];
    for (const seed of [1, 2, 3, 7]) {
      const r = goldfish(scarce, { seed, maxTurns: 15 });
      expect(r.turnToCast["2"]).toBeLessThanOrEqual(9);
    }
  });

  // Breaks if: the bar silently changes (decks scored against different bars stop being
  // comparable) or the result stops reporting which bar it used.
  it("ONLINE_THRESHOLD is 3 and is echoed as onlineThreshold", () => {
    expect(ONLINE_THRESHOLD).toBe(3);
    expect(goldfish(mixed(), { seed: 3 }).onlineThreshold).toBe(3);
  });

  // Breaks if: the turn is never recorded (stays at the penalty) or is recorded as 0/1 regardless of play.
  it("a land-heavy cheap deck gets online within maxTurns", () => {
    const r = goldfish(mixed(), { seed: 3 });
    expect(r.turnsToOnline).toBeGreaterThan(1);
    expect(r.turnsToOnline).toBeLessThan(r.maxTurns);
  });

  // Breaks if: never-online games stop being charged maxTurns + 1 (e.g. count as 0, making a
  // deck that does nothing look fastest). Key assertion: pins the penalty.
  it("an all-lands deck never gets online: turnsToOnline is exactly maxTurns + 1", () => {
    const r = goldfish(Array.from({ length: 40 }, (_, i) => land(i)));
    expect(r.maxTurns).toBe(15);
    expect(r.turnsToOnline).toBe(16);
  });

  // Breaks if: the number does not order decks by speed, which is its whole purpose.
  it("a faster deck scores lower turnsToOnline than a slower one", () => {
    const lands = Array.from({ length: 36 }, (_, i) => land(i));
    const cheap = [...lands, ...Array.from({ length: 24 }, (_, i) => card(`Cheap ${i}`, 1, "Creature — Elf"))];
    const dear = [...lands, ...Array.from({ length: 24 }, (_, i) => card(`Dear ${i}`, 6, "Creature — Giant"))];
    const fast = goldfish(cheap, { seed: 4 }).turnsToOnline;
    const slow = goldfish(dear, { seed: 4 }).turnsToOnline;
    expect(fast).toBeLessThan(slow);
  });

  // Breaks if: turnsToOnline draws on anything but the seeded PRNG.
  it("turnsToOnline is deterministic for same deck + seed", () => {
    expect(goldfish(mixed(), { seed: 9 }).turnsToOnline).toBe(goldfish(mixed(), { seed: 9 }).turnsToOnline);
  });
});

const deckOf = (cards: Deck["cards"]): Deck => ({
  name: "t", commander: "c", commanderIdentity: [], cards, updatedAt: "2026-01-01T00:00:00.000Z",
});
const byName = (cards: ResolvedCard[]): CardResolver => async (n) => cards.find((c) => c.name === n) ?? null;

describe("resolveDeckLibrary", () => {
  it("expands count into copies", async () => {
    const deck = deckOf([{ name: "Forest 0", count: 4 }, { name: "Elf 0" }, { name: "Elf 1", count: 2 }]);
    const { library, unresolved } = await resolveDeckLibrary(deck, byName([land(0), elf(0), elf(1)]));
    expect(library.length).toBe(7);
    expect(library.filter((c) => c.name === "Forest 0").length).toBe(4);
    expect(unresolved).toEqual([]);
  });

  it("calls the resolver once per distinct name", async () => {
    let calls = 0;
    const resolver: CardResolver = async (n) => { calls++; return byName([land(0)])(n); };
    await resolveDeckLibrary(deckOf([{ name: "Forest 0", count: 4 }]), resolver);
    expect(calls).toBe(1);
  });

  it("skips and reports unresolved names once", async () => {
    const deck = deckOf([{ name: "Forest 0" }, { name: "Nope", count: 3 }, { name: "Also Nope" }]);
    const { library, unresolved } = await resolveDeckLibrary(deck, byName([land(0)]));
    expect(unresolved).toEqual(["Nope", "Also Nope"]);
    expect(library.map((c) => c.name)).toEqual(["Forest 0"]);
  });
});

describe("goldfishChart", () => {
  const result = (over: Partial<GoldfishResult> = {}): GoldfishResult => ({
    iterations: 1000, seed: 0, maxTurns: 3, mulliganRate: 0.12, turnToCast: {},
    manaAvailable: [0, 1, 2, 3], stalledGames: 3, castByTurn: [0, 0.5, 1.5, 2.5], ...over,
  });

  it("drops the unused index 0", () => {
    const { data } = goldfishChart(result());
    expect(data.length).toBe(3);
    expect(data[0]!.x).toBe("1");
    expect(data.some((d) => d.x === "0")).toBe(false);
    expect(data.map((d) => d.y)).toEqual([0.5, 1.5, 2.5]);
  });

  it("composes the caption from the scalars", () => {
    expect(goldfishChart(result()).caption).toBe("mulligan 12% · 3/1000 games stalled · seed 0");
  });

  // The consumer (apps/web chart-core MAX_CHART_ROWS) REJECTS a spec longer than
  // 32 rows, so an unclamped producer loses the entire chart rather than drawing
  // a long one. The MCP schema caps maxTurns at 20 so no shipped path hits this;
  // a direct goldfish() caller does. These two assertions are the only thing
  // tying the two bounds together across the package boundary.
  it("clamps data to CHART_MAX_ROWS so the consumer cannot reject the spec", () => {
    expect(CHART_MAX_ROWS).toBe(32);
    const long = goldfishChart(result({ maxTurns: 60, castByTurn: Array.from({ length: 61 }, () => 1) }));
    expect(long.data.length).toBe(CHART_MAX_ROWS);
    // Still turn-indexed from 1, not resampled or windowed to the tail.
    expect(long.data[0]!.x).toBe("1");
    expect(long.data[CHART_MAX_ROWS - 1]!.x).toBe(String(CHART_MAX_ROWS));
    // The scalars stay valid at any maxTurns, so the caption is unaffected.
    expect(long.caption).toContain("seed 0");
  });

  it("leaves a spec at or under the bound untouched", () => {
    expect(goldfishChart(result({ maxTurns: 32, castByTurn: Array.from({ length: 33 }, () => 1) })).data.length).toBe(32);
    expect(goldfishChart(result({ maxTurns: 15, castByTurn: Array.from({ length: 16 }, () => 1) })).data.length).toBe(15);
  });

  it("end to end: deck -> library -> goldfish -> chart", async () => {
    const deck = deckOf([{ name: "Forest 0", count: 36 }, { name: "Elf 0", count: 24 }]);
    const { library } = await resolveDeckLibrary(deck, byName([land(0), elf(0)]));
    const r = goldfish(library, { seed: 3 });
    const spec = goldfishChart(r);
    expect(library.length).toBe(60);
    expect(spec.type).toBe("bar");
    expect(spec.data.length).toBe(r.maxTurns);
  });
});
