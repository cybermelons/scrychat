import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseSlideSpec } from "../ui/src/slides-core.js";

// parseSlideSpec logs every rejection at debug level; silence it so the suite output stays readable.
beforeEach(() => vi.spyOn(console, "debug").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const chart = (over: Record<string, unknown> = {}) => ({
  type: "bar",
  data: [
    { x: "1", y: 3 },
    { x: "2", y: 5 },
  ],
  x: "mana value",
  y: "cards",
  ...over,
});
const make = (slides: unknown, over: Record<string, unknown> = {}) => ({
  kind: "slides",
  deck: "d",
  slides,
  ...over,
});
const j = (o: unknown) => JSON.stringify(o);
const one = (slide: unknown) => parseSlideSpec(j(make([slide])));

describe("parseSlideSpec accepts", () => {
  it("a multi-slide spec, dropping unread fields", () => {
    const spec = parseSlideSpec(
      j(make([{ title: "Curve", text: "99/100", chart: chart(), extra: 1 }, { title: "Quotas", text: "lands ok" }])),
    );
    expect(spec).not.toBeNull();
    expect(spec!.slides).toHaveLength(2);
    expect(spec!.slides[0].title).toBe("Curve");
    expect(spec!.slides[0].chart!.data[1].y).toBe(5);
    expect(spec!.slides[0]).not.toHaveProperty("extra");
    expect(spec).not.toHaveProperty("kind");
    expect(spec).not.toHaveProperty("deck");
  });

  it("a slide with only text", () => {
    const spec = one({ title: "T", text: "hello" });
    expect(spec!.slides[0].text).toBe("hello");
    expect(spec!.slides[0]).not.toHaveProperty("chart");
  });

  it("a slide with only a chart", () => {
    const spec = one({ title: "T", chart: chart() });
    expect(spec!.slides[0].chart!.type).toBe("bar");
    expect(spec!.slides[0]).not.toHaveProperty("text");
  });

  it("a slide with both", () => {
    const spec = one({ title: "T", text: "x", chart: chart({ caption: "c" }) });
    expect(spec!.slides[0].text).toBe("x");
    expect(spec!.slides[0].chart!.caption).toBe("c");
  });

  it("exactly 6 slides", () => {
    const slides = Array.from({ length: 6 }, (_, i) => ({ title: `S${i}`, text: "x" }));
    expect(parseSlideSpec(j(make(slides)))!.slides).toHaveLength(6);
  });

  it("a title of exactly 40 chars", () => {
    expect(one({ title: "t".repeat(40), text: "x" })).not.toBeNull();
  });

  it("a text of exactly 320 chars", () => {
    expect(one({ title: "T", text: "x".repeat(320) })).not.toBeNull();
  });
});

describe("parseSlideSpec rejects", () => {
  it("undefined, empty, non-JSON, JSON scalars and null", () => {
    expect(parseSlideSpec(undefined)).toBeNull();
    expect(parseSlideSpec("")).toBeNull();
    expect(parseSlideSpec("not json")).toBeNull();
    expect(parseSlideSpec("42")).toBeNull();
    expect(parseSlideSpec("null")).toBeNull();
    expect(parseSlideSpec('"slides"')).toBeNull();
  });

  it("a truncated result (2048 chars + ellipsis)", () => {
    const slides = Array.from({ length: 6 }, (_, i) => ({ title: `S${i}`, text: "x".repeat(320) }));
    const full = j(make(slides));
    expect(full.length).toBeGreaterThan(2048);
    expect(parseSlideSpec(full.slice(0, 2048) + "…")).toBeNull();
  });

  it("the wrong kind", () => {
    expect(parseSlideSpec(j(make([{ title: "T", text: "x" }], { kind: "goldfish_compare" })))).toBeNull();
    expect(parseSlideSpec(j({ slides: [{ title: "T", text: "x" }] }))).toBeNull();
  });

  it("slides not an array, empty, or 7 long", () => {
    expect(parseSlideSpec(j(make("nope")))).toBeNull();
    expect(parseSlideSpec(j(make({ title: "T", text: "x" })))).toBeNull();
    expect(parseSlideSpec(j(make([])))).toBeNull();
    const seven = Array.from({ length: 7 }, (_, i) => ({ title: `S${i}`, text: "x" }));
    expect(parseSlideSpec(j(make(seven)))).toBeNull();
  });

  it("a slide that is not an object", () => {
    expect(one(null)).toBeNull();
    expect(one("slide")).toBeNull();
    expect(one(7)).toBeNull();
  });

  it("a missing, empty, non-string or 41-char title", () => {
    expect(one({ text: "x" })).toBeNull();
    expect(one({ title: "", text: "x" })).toBeNull();
    expect(one({ title: 5, text: "x" })).toBeNull();
    expect(one({ title: "t".repeat(41), text: "x" })).toBeNull();
  });

  it("text of 321 chars or a non-string", () => {
    expect(one({ title: "T", text: "x".repeat(321) })).toBeNull();
    expect(one({ title: "T", text: 5 })).toBeNull();
  });

  it("a slide with neither text nor chart", () => {
    expect(one({ title: "T" })).toBeNull();
    expect(one({ title: "T", text: "" })).toBeNull();
  });

  it("a malformed chart, even alongside valid text", () => {
    expect(one({ title: "T", text: "x", chart: chart({ type: "pie" }) })).toBeNull();
    expect(one({ title: "T", text: "x", chart: chart({ data: [] }) })).toBeNull();
    expect(one({ title: "T", text: "x", chart: chart({ data: [{ x: "1", y: -1 }] }) })).toBeNull();
    expect(one({ title: "T", text: "x", chart: "bar" })).toBeNull();
    expect(one({ title: "T", chart: null })).toBeNull();
  });

  it("one bad slide among good ones", () => {
    expect(parseSlideSpec(j(make([{ title: "A", text: "x" }, { title: "B" }])))).toBeNull();
  });
});
