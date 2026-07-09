import { describe, it, expect } from "vitest";
import {
  hasKnownCardName,
  wrapTableNameCells,
  wrapNamesInText,
  classifyLinkifyCandidates,
} from "../src/linkify-core.js";

const KNOWN_CARDS = new Set([
  "Skullclamp",
  "Counterspell",
  "Opt",
  "Fog",
  "Blood Artist",
  "Yahenni, Undying Partisan",
  "Viscera Seer",
  "Bastion of Remembrance",
  "Remembrance",
  "Island",
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

describe("wrapNamesInText (DB-validated, word-boundary-anchored auto-wrap)", () => {
  it("wraps a bare known name in prose", () => {
    expect(wrapNamesInText("You should run Skullclamp here.", ["Skullclamp"], isKnownCardName)).toBe(
      "You should run [[Skullclamp]] here."
    );
  });

  it("wraps multiple distinct names, longest-first, without double-wrapping", () => {
    const out = wrapNamesInText(
      "Blood Artist and Viscera Seer are a classic combo.",
      ["Blood Artist", "Viscera Seer"],
      isKnownCardName
    );
    expect(out).toBe("[[Blood Artist]] and [[Viscera Seer]] are a classic combo.");
  });

  it("leaves an already-wrapped [[Name]] untouched (idempotent)", () => {
    const input = "Run [[Skullclamp]] for value.";
    expect(wrapNamesInText(input, ["Skullclamp"], isKnownCardName)).toBe(input);
  });

  it("leaves ![[Name]] embeds and [[group:...]] chips untouched", () => {
    const input = "See ![[Skullclamp]] and [[group:ramp|Skullclamp; Opt]] for context.";
    expect(wrapNamesInText(input, ["Skullclamp", "Opt"], isKnownCardName)).toBe(input);
  });

  it("only wraps names that pass isKnownCardName", () => {
    const out = wrapNamesInText("Run Skullclamp and Fakecard here.", ["Skullclamp", "Fakecard"], isKnownCardName);
    expect(out).toBe("Run [[Skullclamp]] and Fakecard here.");
  });

  it("returns text unchanged when names list is empty", () => {
    const input = "Nothing to wrap here.";
    expect(wrapNamesInText(input, [], isKnownCardName)).toBe(input);
  });

  it("wraps a comma-containing legendary name in prose", () => {
    const out = wrapNamesInText(
      "Yahenni, Undying Partisan is a great sac outlet.",
      ["Yahenni, Undying Partisan"],
      isKnownCardName
    );
    expect(out).toBe("[[Yahenni, Undying Partisan]] is a great sac outlet.");
  });

  it("does not nest wraps when a proposed name is a substring of a longer proposed name", () => {
    // Regression: sequential per-name replace let "Remembrance" match inside
    // the just-inserted [[Bastion of Remembrance]] brackets, producing
    // "[[Bastion of [[Remembrance]]]]".
    const out = wrapNamesInText(
      "Bastion of Remembrance serves a similar role.",
      ["Bastion of Remembrance", "Remembrance"],
      isKnownCardName
    );
    expect(out).toBe("[[Bastion of Remembrance]] serves a similar role.");
    expect(out).not.toContain("[[[[");
    expect(out).not.toMatch(/\[\[[^\]]*\[\[/);
  });

  it("still wraps a shorter name's own standalone occurrence elsewhere in the same text", () => {
    const out = wrapNamesInText(
      "Remembrance is fine. Bastion of Remembrance too.",
      ["Bastion of Remembrance", "Remembrance"],
      isKnownCardName
    );
    expect(out).toBe("[[Remembrance]] is fine. [[Bastion of Remembrance]] too.");
  });

  it("classify -> wrap end-to-end produces a single clean wrap for nested candidates", () => {
    const text = "Bastion of Remembrance serves a similar role.";
    const { unambiguous, ambiguous } = classifyLinkifyCandidates(text, isKnownCardName);
    // classify surfaces both the full name and the inner substring name
    expect(unambiguous).toContain("Bastion of Remembrance");
    expect(unambiguous).toContain("Remembrance");
    const out = wrapNamesInText(text, [...unambiguous, ...ambiguous], isKnownCardName);
    expect(out).toBe("[[Bastion of Remembrance]] serves a similar role.");
    expect(out).not.toMatch(/\[\[[^\]]*\[\[/);
  });
});

describe("classifyLinkifyCandidates (deterministic-first matcher)", () => {
  it("classifies a multi-word known name as unambiguous", () => {
    const { unambiguous, ambiguous } = classifyLinkifyCandidates(
      "Blood Artist is great in sacrifice decks.",
      isKnownCardName
    );
    expect(unambiguous).toContain("Blood Artist");
    expect(ambiguous).not.toContain("Blood Artist");
  });

  it("classifies a single common-English-word known name as ambiguous", () => {
    const r1 = classifyLinkifyCandidates("You could run Opt in this deck.", isKnownCardName);
    expect(r1.ambiguous).toContain("Opt");
    expect(r1.unambiguous).not.toContain("Opt");

    const r2 = classifyLinkifyCandidates("Fog can save you from combat damage.", isKnownCardName);
    expect(r2.ambiguous).toContain("Fog");
    expect(r2.unambiguous).not.toContain("Fog");
  });

  it("classifies a basic land name in prose as ambiguous (never auto-wrapped)", () => {
    const { unambiguous, ambiguous } = classifyLinkifyCandidates(
      "Tap an Island for mana.",
      isKnownCardName
    );
    expect(ambiguous).toContain("Island");
    expect(unambiguous).not.toContain("Island");
  });

  it("classifies a single non-common-English known name as unambiguous", () => {
    const { unambiguous, ambiguous } = classifyLinkifyCandidates(
      "Skullclamp is a strong card draw engine.",
      isKnownCardName
    );
    expect(unambiguous).toContain("Skullclamp");
    expect(ambiguous).not.toContain("Skullclamp");
  });

  it("does not list an unknown candidate in either list", () => {
    const { unambiguous, ambiguous } = classifyLinkifyCandidates(
      "Totally Madeup Cardname is not real.",
      isKnownCardName
    );
    expect(unambiguous).not.toContain("Totally Madeup Cardname");
    expect(ambiguous).not.toContain("Totally Madeup Cardname");
  });

  it("does not re-list a name that only occurs already wrapped in [[...]]", () => {
    const { unambiguous, ambiguous } = classifyLinkifyCandidates(
      "See [[Opt]] for details, no other mention here.",
      isKnownCardName
    );
    expect(unambiguous).not.toContain("Opt");
    expect(ambiguous).not.toContain("Opt");
  });

  it("does list a name that appears both wrapped and bare elsewhere", () => {
    const { ambiguous } = classifyLinkifyCandidates(
      "See [[Opt]] here, and also consider Opt in another slot.",
      isKnownCardName
    );
    expect(ambiguous).toContain("Opt");
  });

  it("dedups repeated occurrences of the same name", () => {
    const { unambiguous } = classifyLinkifyCandidates(
      "Skullclamp is good. Skullclamp is really good. Skullclamp wins games.",
      isKnownCardName
    );
    expect(unambiguous.filter((n) => n === "Skullclamp").length).toBe(1);
  });

  it("handles mixed unambiguous and ambiguous candidates in the same text", () => {
    const { unambiguous, ambiguous } = classifyLinkifyCandidates(
      "Blood Artist pairs well with Opt and Skullclamp.",
      isKnownCardName
    );
    expect(unambiguous.sort()).toEqual(["Blood Artist", "Skullclamp"]);
    expect(ambiguous).toEqual(["Opt"]);
  });
});
