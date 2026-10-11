import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseCompareSpec, compareVerdict, MAX_LABEL_LEN } from "../ui/src/compare-core.js";
import type { CompareSpec } from "../ui/src/types.js";

// parseCompareSpec logs every rejection at debug level; silence it so the suite output stays readable.
beforeEach(() => vi.spyOn(console, "debug").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const build = (label: string, t: number) => ({
  label,
  turnsToOnline: t,
  mulliganRate: 0.2,
  stalledGames: 3,
});
const make = (over: Record<string, unknown> = {}) => ({
  kind: "goldfish_compare",
  seed: 0,
  iterations: 1000,
  maxTurns: 15,
  onlineThreshold: 3,
  builds: [build("A", 4.1), build("B", 4.8)],
  delta: 4.1 - 4.8,
  unresolved: { deckA: [], deckB: [] },
  ...over,
});
const j = (o: unknown) => JSON.stringify(o);

describe("parseCompareSpec accepts", () => {
  it("a well-formed result, dropping unread fields", () => {
    const spec = parseCompareSpec(j(make()));
    expect(spec).not.toBeNull();
    expect(spec!.builds[0].label).toBe("A");
    expect(spec!.builds[1].turnsToOnline).toBe(4.8);
    expect(spec).not.toHaveProperty("unresolved");
    expect(spec).not.toHaveProperty("kind");
  });

  it("a NEGATIVE delta (first build faster)", () => {
    const spec = parseCompareSpec(j(make()));
    expect(spec?.delta).toBeCloseTo(-0.7, 9);
  });

  it("mulliganRate at the 0 and 1 edges", () => {
    const b0 = { ...build("A", 4), mulliganRate: 0 };
    const b1 = { ...build("B", 4), mulliganRate: 1 };
    expect(parseCompareSpec(j(make({ builds: [b0, b1], delta: 0 })))).not.toBeNull();
  });

  it("a label of exactly 80 chars", () => {
    expect(MAX_LABEL_LEN).toBe(80);
    const b = build("x".repeat(80), 4.1);
    expect(parseCompareSpec(j(make({ builds: [b, build("B", 4.8)], delta: -0.7 })))).not.toBeNull();
  });
});

describe("parseCompareSpec rejects", () => {
  const withBuild = (i: 0 | 1, over: Record<string, unknown>, delta?: number) => {
    const builds = [build("A", 4.1), build("B", 4.8)] as Record<string, unknown>[];
    builds[i] = { ...builds[i], ...over };
    return j(make(delta === undefined ? { builds } : { builds, delta }));
  };
  const cases: [string, string | undefined][] = [
    ["undefined", undefined],
    ["the empty string", ""],
    ["non-JSON", "not json at all"],
    ["a truncated result", `${j(make()).slice(0, 60)}…`],
    ["JSON null", "null"],
    ["a JSON scalar", "42"],
    ["wrong kind", j(make({ kind: "goldfish_deck" }))],
    ["missing kind", j(make({ kind: undefined }))],
    ["builds not an array", j(make({ builds: "nope" }))],
    ["one build", j(make({ builds: [build("A", 4.1)] }))],
    ["three builds", j(make({ builds: [build("A", 4.1), build("B", 4.8), build("C", 5)] }))],
    ["a null build", j(make({ builds: [null, build("B", 4.8)] }))],
    ["an empty label", withBuild(0, { label: "" })],
    ["a non-string label", withBuild(0, { label: 7 })],
    ["an 81-char label", withBuild(1, { label: "x".repeat(81) })],
    ["negative turnsToOnline", withBuild(0, { turnsToOnline: -1 }, -5.8)],
    ["non-finite turnsToOnline", withBuild(0, { turnsToOnline: 1e999 })],
    ["string turnsToOnline", withBuild(0, { turnsToOnline: "4" })],
    ["null turnsToOnline", withBuild(1, { turnsToOnline: null })],
    ["negative mulliganRate", withBuild(0, { mulliganRate: -0.1 })],
    ["mulliganRate above 1 (percent, not fraction)", withBuild(0, { mulliganRate: 20 })],
    ["negative stalledGames", withBuild(1, { stalledGames: -1 })],
    ["negative iterations", j(make({ iterations: -1 }))],
    ["negative maxTurns", j(make({ maxTurns: -15 }))],
    ["negative onlineThreshold", j(make({ onlineThreshold: -3 }))],
    ["non-number seed", j(make({ seed: "0" }))],
    ["negative seed", j(make({ seed: -1 }))],
    ["non-finite delta", j(make({ delta: 1e999 }))],
    ["missing delta", j(make({ delta: undefined }))],
    ["a delta that disagrees with the builds", j(make({ delta: 0.7 }))],
  ];
  for (const [why, input] of cases) {
    it(`rejects ${why}`, () => expect(parseCompareSpec(input)).toBeNull());
  }
});

describe("compareVerdict", () => {
  const spec = (delta: number): CompareSpec => ({
    seed: 0, iterations: 1000, maxTurns: 15, onlineThreshold: 3,
    builds: [build("A", 5), build("B", 5 - delta)], delta,
  });

  it("names the first build faster on a clearly negative delta", () => {
    expect(compareVerdict(spec(-0.7))).toEqual({ fasterIndex: 0, magnitude: 0.7 });
  });
  it("names the second build faster on a clearly positive delta", () => {
    expect(compareVerdict(spec(0.7))).toEqual({ fasterIndex: 1, magnitude: 0.7 });
  });
  it("is a tie for a 0.05 delta either way", () => {
    expect(compareVerdict(spec(0.05)).fasterIndex).toBeNull();
    expect(compareVerdict(spec(-0.05)).fasterIndex).toBeNull();
  });
  it("is a tie at exactly 0", () => {
    expect(compareVerdict(spec(0)).fasterIndex).toBeNull();
  });
  // Literal boundary values on purpose: the floor is 0.25 turns.
  it("is a tie just under 0.25 and a winner at 0.25", () => {
    expect(compareVerdict(spec(-0.24)).fasterIndex).toBeNull();
    expect(compareVerdict(spec(0.24)).fasterIndex).toBeNull();
    expect(compareVerdict(spec(-0.25)).fasterIndex).toBe(0);
    expect(compareVerdict(spec(0.25)).fasterIndex).toBe(1);
  });
});
