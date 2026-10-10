import { describe, it, expect } from "vitest";
import { goldfish } from "../src/goldfish.js";
import type { ResolvedCard } from "../src/decks.js";

const card = (name: string, cmc: number, typeLine: string): ResolvedCard => ({
  name, cmc, typeLine, colorIdentity: [], legalCommander: false,
});
const land = (i: number) => card(`Forest ${i}`, 0, "Basic Land — Forest");
const elf = (i: number) => card(`Elf ${i}`, 1 + (i % 3), "Creature — Elf");
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
});
