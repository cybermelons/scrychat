import { describe, it, expect } from "vitest";
import { goldfish, goldfishChart, resolveDeckLibrary } from "../src/goldfish.js";
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
