import { describe, it, expect } from "vitest";
import { parseDecklist, type DeckImportEntry } from "../src/import.js";

/** Helper: assert every non-blank/non-comment/non-excluded-section input line is
 * accounted for as either an entry or an unparsed line. We verify this per-test
 * by checking entries.length + unparsed.length against a hand count where noted. */

describe("parseDecklist: plain count formats", () => {
  it("parses '<count> <name>'", () => {
    const result = parseDecklist("1 Sol Ring");
    expect(result.entries).toEqual<DeckImportEntry[]>([{ name: "Sol Ring", count: 1 }]);
    expect(result.unparsed).toEqual([]);
  });

  it("parses '<count>x <name>' (lowercase x)", () => {
    const result = parseDecklist("1x Sol Ring");
    expect(result.entries).toEqual([{ name: "Sol Ring", count: 1 }]);
    expect(result.unparsed).toEqual([]);
  });

  it("parses '<count>X <name>' (uppercase X)", () => {
    const result = parseDecklist("1X Sol Ring");
    expect(result.entries).toEqual([{ name: "Sol Ring", count: 1 }]);
    expect(result.unparsed).toEqual([]);
  });

  it("parses counts greater than 1 (basics)", () => {
    const result = parseDecklist("2 Forest");
    expect(result.entries).toEqual([{ name: "Forest", count: 2 }]);
  });

  it("parses double-digit counts", () => {
    const result = parseDecklist("10 Island");
    expect(result.entries).toEqual([{ name: "Island", count: 10 }]);
  });

  it("parses multiple plain lines preserving order", () => {
    const text = ["1 Sol Ring", "10 Forest", "1x Lightning Bolt", "2 Island"].join("\n");
    const result = parseDecklist(text);
    expect(result.entries).toEqual([
      { name: "Sol Ring", count: 1 },
      { name: "Forest", count: 10 },
      { name: "Lightning Bolt", count: 1 },
      { name: "Island", count: 2 },
    ]);
    expect(result.unparsed).toEqual([]);
  });
});

describe("parseDecklist: bare name with no leading count", () => {
  it("defaults count to 1 for a bare card name", () => {
    const result = parseDecklist("Sol Ring");
    expect(result.entries).toEqual([{ name: "Sol Ring", count: 1 }]);
    expect(result.unparsed).toEqual([]);
  });

  it("handles a mix of bare names and counted lines", () => {
    const text = ["Sol Ring", "1 Lightning Bolt", "Arcane Signet"].join("\n");
    const result = parseDecklist(text);
    expect(result.entries).toEqual([
      { name: "Sol Ring", count: 1 },
      { name: "Lightning Bolt", count: 1 },
      { name: "Arcane Signet", count: 1 },
    ]);
    expect(result.unparsed).toEqual([]);
  });
});

describe("parseDecklist: Moxfield export", () => {
  const moxfieldExport = [
    "Commander",
    "1 Atraxa, Praetors' Voice",
    "",
    "Deck",
    "1 Sol Ring (C21) 263",
    "1 Lightning Bolt (2X2) 117",
    "1 Ancestral Recall (LEA) 48",
    "10 Forest",
  ].join("\n");

  it("strips (SET) collector suffixes and assigns commander via section", () => {
    const result = parseDecklist(moxfieldExport);
    expect(result.entries).toEqual([
      { name: "Atraxa, Praetors' Voice", count: 1, commander: true },
      { name: "Sol Ring", count: 1 },
      { name: "Lightning Bolt", count: 1 },
      { name: "Ancestral Recall", count: 1 },
      { name: "Forest", count: 10 },
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("supports *CMDR* suffix marker directly on a card line", () => {
    const text = ["1 Atraxa, Praetors' Voice *CMDR*", "1 Sol Ring"].join("\n");
    const result = parseDecklist(text);
    expect(result.entries).toEqual([
      { name: "Atraxa, Praetors' Voice", count: 1, commander: true },
      { name: "Sol Ring", count: 1 },
    ]);
  });

  it("supports inline 'Commander: Name' header form", () => {
    const text = ["Commander: Atraxa, Praetors' Voice", "", "Deck", "1 Sol Ring"].join("\n");
    const result = parseDecklist(text);
    expect(result.entries).toEqual([
      { name: "Atraxa, Praetors' Voice", count: 1, commander: true },
      { name: "Sol Ring", count: 1 },
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("supports bare 'Commander:' header with the name on the next line", () => {
    const text = ["Commander:", "1 Atraxa, Praetors' Voice", "", "Deck", "1 Sol Ring"].join("\n");
    const result = parseDecklist(text);
    expect(result.entries).toEqual([
      { name: "Atraxa, Praetors' Voice", count: 1, commander: true },
      { name: "Sol Ring", count: 1 },
    ]);
  });
});

describe("parseDecklist: Archidekt export", () => {
  it("strips (SET) collector number and foil marker together", () => {
    const result = parseDecklist("1x Sol Ring (C21) 263 *F*");
    expect(result.entries).toEqual([{ name: "Sol Ring", count: 1 }]);
    expect(result.unparsed).toEqual([]);
  });

  it("strips a trailing #Category tag", () => {
    const result = parseDecklist("1x Arcane Signet (C21) 264 #Ramp");
    expect(result.entries).toEqual([{ name: "Arcane Signet", count: 1 }]);
  });

  it("strips category tag and foil marker combined with set/collector", () => {
    // Category tag appended after foil marker, exercising strip order robustness.
    const result = parseDecklist("1x Sol Ring (C21) 263 *F* #Ramp");
    expect(result.entries).toEqual([{ name: "Sol Ring", count: 1 }]);
  });

  it("does not treat a leading '#' comment line as a category-tag card", () => {
    const text = ["# this is a comment", "1x Sol Ring (C21) 263"].join("\n");
    const result = parseDecklist(text);
    expect(result.entries).toEqual([{ name: "Sol Ring", count: 1 }]);
    expect(result.unparsed).toEqual([]);
  });
});

describe("parseDecklist: MTGO .txt export", () => {
  const mtgoExport = [
    "1 Sol Ring (LEA) 161",
    "10 Island",
    "",
    "Sideboard",
    "1 Rest in Peace (V17) 14",
    "2 Grafdigger's Cage (C16) 24",
  ].join("\n");

  it("parses set+collector lines and fully skips a Sideboard section", () => {
    const result = parseDecklist(mtgoExport);
    expect(result.entries).toEqual([
      { name: "Sol Ring", count: 1 },
      { name: "Island", count: 10 },
    ]);
    expect(result.unparsed).toEqual([]);
    // Sideboard contents must be entirely absent, not entries and not unparsed.
    const allNames = result.entries.map((e) => e.name);
    expect(allNames).not.toContain("Rest in Peace");
    expect(allNames).not.toContain("Grafdigger's Cage");
    expect(result.unparsed.join(" ")).not.toMatch(/Rest in Peace|Grafdigger/);
  });
});

describe("parseDecklist: commander markers", () => {
  it("*CMDR* suffix sets commander:true (case-insensitive)", () => {
    const result = parseDecklist("1 Atraxa, Praetors' Voice *cmdr*");
    expect(result.entries[0].commander).toBe(true);
  });

  it("non-commander cards have commander undefined (not false)", () => {
    const result = parseDecklist("1 Sol Ring");
    expect(result.entries[0].commander).toBeUndefined();
  });
});

describe("parseDecklist: Commander header forms", () => {
  it("bare 'Commander' header marks following lines commander:true until blank/next section", () => {
    const text = [
      "Commander",
      "1 Korvold, Fae-Cursed King",
      "",
      "Deck",
      "1 Sol Ring",
    ].join("\n");
    const result = parseDecklist(text);
    expect(result.entries).toEqual([
      { name: "Korvold, Fae-Cursed King", count: 1, commander: true },
      { name: "Sol Ring", count: 1 },
    ]);
  });

  it("inline 'Commander: Name' produces a commander:true entry", () => {
    const result = parseDecklist("Commander: Korvold, Fae-Cursed King");
    expect(result.entries).toEqual([
      { name: "Korvold, Fae-Cursed King", count: 1, commander: true },
    ]);
  });

  it("stops commander carry-over at the next section header even without a blank line", () => {
    const text = ["Commander", "1 Korvold, Fae-Cursed King", "Deck", "1 Sol Ring"].join("\n");
    const result = parseDecklist(text);
    expect(result.entries).toEqual([
      { name: "Korvold, Fae-Cursed King", count: 1, commander: true },
      { name: "Sol Ring", count: 1 },
    ]);
  });
});

describe("parseDecklist: excluded sections (Sideboard/Maybeboard/Considering/Tokens)", () => {
  it("skips a Sideboard section (with count header) entirely", () => {
    const text = [
      "Deck",
      "1 Sol Ring",
      "",
      "Sideboard (2)",
      "1 Rest in Peace",
      "1 Tormod's Crypt",
    ].join("\n");
    const result = parseDecklist(text);
    expect(result.entries).toEqual([{ name: "Sol Ring", count: 1 }]);
    expect(result.unparsed).toEqual([]);
    const names = result.entries.map((e) => e.name);
    expect(names).not.toContain("Rest in Peace");
    expect(names).not.toContain("Tormod's Crypt");
  });

  it("skips a Maybeboard section entirely", () => {
    const text = ["Deck", "1 Sol Ring", "Maybeboard", "1 Cyclonic Rift"].join("\n");
    const result = parseDecklist(text);
    expect(result.entries).toEqual([{ name: "Sol Ring", count: 1 }]);
    expect(result.entries.map((e) => e.name)).not.toContain("Cyclonic Rift");
    expect(result.unparsed).toEqual([]);
  });

  it("skips a Considering section entirely", () => {
    const text = ["Deck", "1 Sol Ring", "Considering", "1 Smothering Tithe"].join("\n");
    const result = parseDecklist(text);
    expect(result.entries).toEqual([{ name: "Sol Ring", count: 1 }]);
    expect(result.entries.map((e) => e.name)).not.toContain("Smothering Tithe");
    expect(result.unparsed).toEqual([]);
  });

  it("skips a Tokens section entirely", () => {
    const text = ["Deck", "1 Sol Ring", "Tokens", "1 Treasure"].join("\n");
    const result = parseDecklist(text);
    expect(result.entries).toEqual([{ name: "Sol Ring", count: 1 }]);
    expect(result.entries.map((e) => e.name)).not.toContain("Treasure");
    expect(result.unparsed).toEqual([]);
  });

  it("excluded section absorbs blank lines within its own block without exiting early", () => {
    const text = [
      "Deck",
      "1 Sol Ring",
      "Sideboard",
      "1 Rest in Peace",
      "",
      "1 Tormod's Crypt",
    ].join("\n");
    const result = parseDecklist(text);
    expect(result.entries).toEqual([{ name: "Sol Ring", count: 1 }]);
    expect(result.unparsed).toEqual([]);
  });
});

describe("parseDecklist: foil markers stripped from name", () => {
  it("strips *F*", () => {
    const result = parseDecklist("1 Sol Ring *F*");
    expect(result.entries).toEqual([{ name: "Sol Ring", count: 1 }]);
  });

  it("strips *Foil*", () => {
    const result = parseDecklist("1 Sol Ring *Foil*");
    expect(result.entries).toEqual([{ name: "Sol Ring", count: 1 }]);
  });
});

describe("parseDecklist: comment and blank lines skipped", () => {
  it("skips blank/whitespace-only lines", () => {
    const text = ["1 Sol Ring", "", "   ", "1 Lightning Bolt"].join("\n");
    const result = parseDecklist(text);
    expect(result.entries).toEqual([
      { name: "Sol Ring", count: 1 },
      { name: "Lightning Bolt", count: 1 },
    ]);
    expect(result.unparsed).toEqual([]);
  });

  it("skips '#' comment lines", () => {
    const text = ["# my deck", "1 Sol Ring"].join("\n");
    const result = parseDecklist(text);
    expect(result.entries).toEqual([{ name: "Sol Ring", count: 1 }]);
    expect(result.unparsed).toEqual([]);
  });

  it("skips '//' comment lines", () => {
    const text = ["// my deck", "1 Sol Ring"].join("\n");
    const result = parseDecklist(text);
    expect(result.entries).toEqual([{ name: "Sol Ring", count: 1 }]);
    expect(result.unparsed).toEqual([]);
  });
});

describe("parseDecklist: freeform junk lands in unparsed verbatim", () => {
  it("pushes an un-parseable freeform line to unparsed, trimmed", () => {
    const result = parseDecklist("  3 copies of that green ramp rock  ");
    expect(result.entries).toEqual([]);
    expect(result.unparsed).toEqual(["3 copies of that green ramp rock"]);
  });

  it("pushes garbage punctuation-only content to unparsed", () => {
    const result = parseDecklist("!!! ???");
    expect(result.entries).toEqual([]);
    expect(result.unparsed).toEqual(["!!! ???"]);
  });
});

describe("parseDecklist: nothing is silently dropped", () => {
  it("every non-blank, non-comment, non-excluded-section line becomes an entry or unparsed", () => {
    const lines = [
      "1 Sol Ring",
      "Lightning Bolt",
      "3 copies of that green ramp rock",
      "1 Forest (LEA) 261",
    ];
    const result = parseDecklist(lines.join("\n"));
    expect(result.entries.length + result.unparsed.length).toBe(lines.length);
  });
});

describe("parseDecklist: mixed realistic paste", () => {
  it("parses a combined realistic decklist with exact entries and unparsed", () => {
    const text = [
      "// Exported from Archidekt",
      "Commander: Atraxa, Praetors' Voice",
      "",
      "Deck",
      "1 Sol Ring (C21) 263 *F*",
      "1x Arcane Signet (C21) 264 #Ramp",
      "1 Lightning Bolt (2X2) 117",
      "10 Forest",
      "Command Tower",
      "3 copies of that green ramp rock",
      "",
      "Sideboard (2)",
      "1 Rest in Peace",
      "1 Tormod's Crypt",
      "",
      "Maybeboard",
      "1 Cyclonic Rift",
    ].join("\n");

    const result = parseDecklist(text);

    expect(result.entries).toEqual([
      { name: "Atraxa, Praetors' Voice", count: 1, commander: true },
      { name: "Sol Ring", count: 1 },
      { name: "Arcane Signet", count: 1 },
      { name: "Lightning Bolt", count: 1 },
      { name: "Forest", count: 10 },
      { name: "Command Tower", count: 1 },
    ]);

    expect(result.unparsed).toEqual(["3 copies of that green ramp rock"]);

    const names = result.entries.map((e) => e.name);
    expect(names).not.toContain("Rest in Peace");
    expect(names).not.toContain("Tormod's Crypt");
    expect(names).not.toContain("Cyclonic Rift");
    expect(result.unparsed.join(" ")).not.toMatch(/Rest in Peace|Tormod|Cyclonic Rift/);
  });
});
