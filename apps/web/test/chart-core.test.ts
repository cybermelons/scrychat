import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseChartSpec, MAX_CHART_ROWS } from "../ui/src/chart-core.js";

// parseChartSpec logs every rejection at debug level. The tests assert on the
// return value, not the log, but an unsilenced console.debug makes the suite
// output unreadable.
beforeEach(() => vi.spyOn(console, "debug").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const wrap = (chart: unknown) => JSON.stringify({ chart });
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ x: String(i + 1), y: i }));
const good = { type: "bar", data: rows(3), x: "turn", y: "spells cast", caption: "seed 0" };

describe("parseChartSpec accepts a well-formed spec", () => {
  it("returns the chart object itself, not the envelope", () => {
    expect(parseChartSpec(wrap(good))).toEqual(good);
  });

  it("caption is optional", () => {
    const { caption, ...noCaption } = good;
    expect(parseChartSpec(wrap(noCaption))).toEqual(noCaption);
  });

  it("accepts exactly MAX_CHART_ROWS rows", () => {
    const spec = { ...good, data: rows(MAX_CHART_ROWS) };
    expect(parseChartSpec(wrap(spec))?.data).toHaveLength(MAX_CHART_ROWS);
  });

  it("accepts y === 0", () => {
    expect(parseChartSpec(wrap({ ...good, data: [{ x: "1", y: 0 }] }))).not.toBeNull();
  });
});

describe("parseChartSpec rejects", () => {
  // Each case is a defect a malformed or hostile tool result could carry.
  const cases: [string, string | undefined][] = [
    ["undefined", undefined],
    ["the empty string", ""],
    ["non-JSON", "not json at all"],
    ["a truncated result", `${JSON.stringify({ chart: good }).slice(0, 40)}…`],
    ["JSON null", "null"],
    ["a JSON scalar", "42"],
    ["a JSON array", "[]"],
    ["no chart key", JSON.stringify({ other: good })],
    ["a null chart", wrap(null)],
    ["a scalar chart", wrap("bar")],
    ["an unsupported type", wrap({ ...good, type: "line" })],
    ["a missing type", wrap({ ...good, type: undefined })],
    ["data that is not an array", wrap({ ...good, data: "nope" })],
    ["empty data", wrap({ ...good, data: [] })],
    ["more than MAX_CHART_ROWS rows", wrap({ ...good, data: rows(MAX_CHART_ROWS + 1) })],
    ["a null row", wrap({ ...good, data: [null] })],
    ["a scalar row", wrap({ ...good, data: ["1"] })],
    ["a non-string row x", wrap({ ...good, data: [{ x: 1, y: 1 }] })],
    ["an overlong row x", wrap({ ...good, data: [{ x: "x".repeat(17), y: 1 }] })],
    ["a non-number row y", wrap({ ...good, data: [{ x: "1", y: "1" }] })],
    ["a negative row y", wrap({ ...good, data: [{ x: "1", y: -1 }] })],
    ["a non-finite row y", wrap({ ...good, data: [{ x: "1", y: 1e999 }] })],
    ["a non-string x label", wrap({ ...good, x: 7 })],
    ["an overlong x label", wrap({ ...good, x: "x".repeat(81) })],
    ["a non-string y label", wrap({ ...good, y: 7 })],
    ["an overlong y label", wrap({ ...good, y: "y".repeat(81) })],
    ["a non-string caption", wrap({ ...good, caption: 7 })],
    ["an overlong caption", wrap({ ...good, caption: "c".repeat(121) })],
  ];

  for (const [why, input] of cases) {
    it(`rejects ${why}`, () => expect(parseChartSpec(input)).toBeNull());
  }

  // NaN does not survive JSON, so it can only arrive as a non-number.
  it("rejects NaN arriving as null through JSON", () => {
    expect(parseChartSpec(`{"chart":{"type":"bar","data":[{"x":"1","y":null}],"x":"t","y":"s"}}`)).toBeNull();
  });
});
