import { describe, it, expect } from "vitest";
import { hasKnownCardName, wrapTableNameCells } from "../src/linkify-core.js";

const KNOWN_CARDS = new Set([
  "Skullclamp",
  "Counterspell",
  "Opt",
  "Blood Artist",
  "Yahenni, Undying Partisan",
  "Viscera Seer",
]);

function isKnownCardName(name: string): boolean {
  return KNOWN_CARDS.has(name.trim());
}

describe("hasKnownCardName (Layer 2 cost gate)", () => {
  it("returns false for trivial prose replies", () => {
    expect(hasKnownCardName("thanks, sounds good", isKnownCardName)).toBe(false);
    expect(hasKnownCardName("Sounds good, glad that helped!", isKnownCardName)).toBe(false);
  });

  it("returns true for prose naming a known card", () => {
    expect(hasKnownCardName("You should run Skullclamp in this deck.", isKnownCardName)).toBe(true);
  });

  it("returns true when text contains a markdown table", () => {
    const text = "Here you go:\n| Card | Why |\n| --- | --- |\n| Foo | bar |\n";
    expect(hasKnownCardName(text, isKnownCardName)).toBe(true);
  });

  it("returns true when text contains a bulleted list", () => {
    const text = "Some options:\n- Foo\n- Bar\n";
    expect(hasKnownCardName(text, isKnownCardName)).toBe(true);
  });

  it("returns true when text contains a numbered list", () => {
    const text = "Some options:\n1. Foo\n2. Bar\n";
    expect(hasKnownCardName(text, isKnownCardName)).toBe(true);
  });

  it("returns true for a sentence-initial name behind a capitalized connector", () => {
    // "Skullclamp" only surfaces as a suffix window of the "The Skullclamp"
    // run, not a prefix — regression test for issue #18 review FIX 2.
    expect(hasKnownCardName("The Skullclamp is amazing here.", isKnownCardName)).toBe(true);
  });

  it("returns true for a comma-connected legendary name in prose", () => {
    // "Yahenni, Undying Partisan" must stay one candidate window (comma
    // connector inside the title-case run) — regression test for FIX 3.
    expect(
      hasKnownCardName("Yahenni, Undying Partisan is a great sac outlet.", isKnownCardName)
    ).toBe(true);
  });

  it("still returns false for trivial replies after the windowing/comma changes", () => {
    // Guards against the windowed-candidate extraction over-matching: "The",
    // "Sounds", etc. must not spuriously hit the known-card set.
    expect(hasKnownCardName("thanks, sounds good", isKnownCardName)).toBe(false);
    expect(hasKnownCardName("Sounds good, glad that helped!", isKnownCardName)).toBe(false);
  });
});

describe("wrapTableNameCells (Layer 3 deterministic pre-pass)", () => {
  it("wraps bare known-card-name cells in the name column, leaves header/separator untouched", () => {
    const input = [
      "| Card | Why |",
      "| --- | --- |",
      "| Skullclamp | card draw |",
      "| Blood Artist | drain |",
    ].join("\n");

    const output = wrapTableNameCells(input, isKnownCardName);
    const lines = output.split("\n");

    expect(lines[0]).toBe("| Card | Why |");
    expect(lines[1]).toBe("| --- | --- |");
    expect(lines[2]).toContain("[[Skullclamp]]");
    expect(lines[3]).toContain("[[Blood Artist]]");
  });

  it("does not double-wrap a cell already wrapped in [[...]]", () => {
    const input = [
      "| Card | Why |",
      "| --- | --- |",
      "| [[Skullclamp]] | card draw |",
    ].join("\n");

    const output = wrapTableNameCells(input, isKnownCardName);
    expect(output).not.toContain("[[[[");
    expect(output).toContain("[[Skullclamp]]");
    expect(output.match(/\[\[Skullclamp\]\]/g)?.length).toBe(1);
  });

  it("does not wrap generic card-name words used in prose (not a table)", () => {
    const input = "You could run Opt or Counterspell in a control shell.";
    const output = wrapTableNameCells(input, isKnownCardName);
    expect(output).toBe(input);
  });

  it("only wraps the name column, not a card name appearing in a non-name column", () => {
    const input = [
      "| Card | Why |",
      "| --- | --- |",
      "| Skullclamp | pairs well with Counterspell |",
    ].join("\n");

    const output = wrapTableNameCells(input, isKnownCardName);
    const lines = output.split("\n");
    expect(lines[2]).toContain("[[Skullclamp]]");
    expect(lines[2]).not.toContain("[[Counterspell]]");
    expect(lines[2]).toContain("pairs well with Counterspell");
  });

  it("wraps multiple rows of the same card in the name column", () => {
    const input = [
      "| Card | Why |",
      "| --- | --- |",
      "| Skullclamp | draw |",
      "| Skullclamp | draw again |",
    ].join("\n");

    const output = wrapTableNameCells(input, isKnownCardName);
    expect(output.match(/\[\[Skullclamp\]\]/g)?.length).toBe(2);
  });

  it("is idempotent: running twice equals running once", () => {
    const input = [
      "Here's a table:",
      "| Card | Why |",
      "| --- | --- |",
      "| Skullclamp | draw |",
      "| Blood Artist | drain |",
      "",
      "And some prose mentioning Opt and Counterspell.",
    ].join("\n");

    const once = wrapTableNameCells(input, isKnownCardName);
    const twice = wrapTableNameCells(once, isKnownCardName);
    expect(twice).toBe(once);
  });

  it("defaults to the first column as the name column when no card/name header is present", () => {
    const input = ["| Foo | Bar |", "| --- | --- |", "| Skullclamp | something |"].join("\n");
    const output = wrapTableNameCells(input, isKnownCardName);
    expect(output.split("\n")[2]).toContain("[[Skullclamp]]");
  });

  it("handles an escaped pipe inside a cell (splitTableRow's escape branch)", () => {
    const input = [
      "| Card | Why |",
      "| --- | --- |",
      String.raw`| Skullclamp | draw \| discard synergy |`,
    ].join("\n");

    const output = wrapTableNameCells(input, isKnownCardName);
    const lines = output.split("\n");
    expect(lines[2]).toContain("[[Skullclamp]]");
    // the escaped pipe survives as a literal "|" inside the cell, unsplit
    expect(lines[2]).toContain("draw | discard synergy");
  });

  it("still treats a matching 1-column header/separator as a valid table (FIX 4 counts match)", () => {
    const input = ["|Something|", "|-|", "|Skullclamp|"].join("\n");
    const output = wrapTableNameCells(input, isKnownCardName);
    expect(output.split("\n")[2]).toContain("[[Skullclamp]]");
  });

  it("does not treat a mismatched header/separator cell count as a table (FIX 4)", () => {
    // 2-cell header vs 1-cell separator: not a real separator row, so the
    // region is skipped entirely and nothing gets wrapped.
    const input = ["| Card | Why |", "|-|", "| Skullclamp | draw |"].join("\n");
    const output = wrapTableNameCells(input, isKnownCardName);
    expect(output).toBe(input);
  });
});
