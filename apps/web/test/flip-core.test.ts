import { describe, it, expect } from "vitest";
import {
  riffleTop, riffleProgress, riffleFront, cardPose, cutStack, groupStarts, groupOf, jumpGroupStart,
} from "../ui/src/flip-core.js";

const S = 220;

describe("riffle geometry", () => {
  it("first card is front at max scrollTop; scrollTop falls as cards advance", () => {
    expect(riffleTop(0, 10, S)).toBe(9 * S);
    expect(riffleTop(9, 10, S)).toBe(0);
    expect(riffleTop(0, 1, S)).toBe(0);
  });
  it("riffleFront inverts riffleTop and rounds between", () => {
    for (let i = 0; i < 10; i++) expect(riffleFront(riffleTop(i, 10, S), 10, S)).toBe(i);
    expect(riffleFront(riffleTop(3, 10, S) + 50, 10, S)).toBe(3);
    expect(riffleFront(riffleTop(3, 10, S) - 150, 10, S)).toBe(4);
    expect(riffleFront(-50, 10, S)).toBe(9);
    expect(riffleFront(1e9, 10, S)).toBe(0);
    expect(riffleFront(5, 0, S)).toBe(0);
    expect(riffleProgress(riffleTop(2, 10, S) - 110, 10, S)).toBeCloseTo(2.5);
  });
});

describe("cardPose", () => {
  const H = 48, CAP = 6;
  it("front parks at the bottom slot, upcoming headers cascade above, cap collapses", () => {
    expect(cardPose(0, H, CAP).y).toBe(288);
    expect(cardPose(1, H, CAP).y).toBe(240);
    expect(cardPose(6, H, CAP).y).toBe(0);
    expect(cardPose(20, H, CAP).y).toBe(0);
    expect(cardPose(-1, H, CAP).y).toBe(288);
  });
  it("pulling the next card moves it down smoothly", () => {
    expect(cardPose(0.5, H, CAP).y).toBe(264);
  });
  it("z order: front > next > later; pulled card > the one it leaves", () => {
    const z = (d: number) => cardPose(d, H, CAP).z;
    expect(z(0)).toBeGreaterThan(z(1));
    expect(z(1)).toBeGreaterThan(z(2));
    expect(z(0)).toBeGreaterThan(z(-1));
    expect(z(0.3)).toBeGreaterThan(z(-0.7));
  });
  it("hides cards far outside the window", () => {
    expect(cardPose(-3, H, CAP).show).toBe(false);
    expect(cardPose(-1, H, CAP).show).toBe(true);
    expect(cardPose(CAP + 3, H, CAP).show).toBe(false);
  });
});

type C = { n: string; t: string; v: number };
const cards: C[] = [
  { n: "b", t: "Instant", v: 2 }, { n: "a", t: "Creature", v: 3 }, { n: "c", t: "Creature", v: 1 },
  { n: "d", t: "Instant", v: 3 }, { n: "e", t: "Land", v: 0 }, { n: "f", t: "Creature", v: 3 },
];
const rank = (k: string) => ["Creature", "Instant", "Land"].indexOf(k);
const cmp = (a: C, b: C) => a.n.localeCompare(b.n);

describe("cutStack", () => {
  it("no k1: one unnamed group, sorted", () => {
    const r = cutStack(cards, { cmp });
    expect(r.order.map((c) => c.n).join("")).toBe("abcdef");
    expect(r.groups).toEqual([{ key: "", start: 0, count: 6, subs: [{ key: "", start: 0, count: 6 }] }]);
  });
  it("one cut: ranked group order, sorted inside, contiguous starts", () => {
    const r = cutStack(cards, { k1: (c) => c.t, r1: rank, cmp });
    expect(r.order.map((c) => c.n).join("")).toBe("acfbde");
    expect(r.groups.map((g) => [g.key, g.start, g.count])).toEqual([["Creature", 0, 3], ["Instant", 3, 2], ["Land", 5, 1]]);
  });
  it("nested cut: sub-groups by rank inside each group; sort inside the innermost", () => {
    const r = cutStack(cards, { k1: (c) => c.t, r1: rank, k2: (c) => `MV ${c.v}`, r2: (k) => +k.slice(3), cmp });
    expect(r.order.map((c) => c.n).join("")).toBe("caf" + "bd" + "e");
    const cr = r.groups[0];
    expect(cr.subs).toEqual([{ key: "MV 1", start: 0, count: 1 }, { key: "MV 3", start: 1, count: 2 }]);
    expect(r.groups[1].subs.map((s) => [s.key, s.start])).toEqual([["MV 2", 3], ["MV 3", 4]]);
    expect(r.groups.reduce((n, g) => n + g.count, 0)).toBe(cards.length);
  });
  it("k2 without k1 is ignored; empty input gives one empty group", () => {
    expect(cutStack(cards, { k2: (c) => c.t, cmp }).groups).toHaveLength(1);
    expect(cutStack([], { k1: (c: C) => c.t, cmp }).groups).toEqual([]);
  });
});

describe("group boundaries", () => {
  it("starts, groupOf, jumps", () => {
    const st = groupStarts([3, 4, 2]);
    expect(st).toEqual([0, 3, 7]);
    expect([0, 2, 3, 6, 7, 8].map((f) => groupOf(f, st))).toEqual([0, 0, 1, 1, 2, 2]);
    expect(groupOf(5, [])).toBe(0);
    expect(jumpGroupStart(1, st, 1)).toBe(3);
    expect(jumpGroupStart(8, st, 1)).toBe(7);
    expect(jumpGroupStart(4, st, -1)).toBe(3);
    expect(jumpGroupStart(3, st, -1)).toBe(0);
    expect(jumpGroupStart(0, st, -1)).toBe(0);
    expect(jumpGroupStart(0, [], 1)).toBe(0);
  });
});
