import { describe, it, expect } from "vitest";
import { goldfish } from "../src/goldfish.js";
import type { ResolvedCard } from "../src/decks.js";

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
