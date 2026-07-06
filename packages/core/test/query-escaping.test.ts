import { describe, it, expect } from "vitest";
import { escapeQuotedTerm } from "../src/scryfall.js";
import { buildCardsQuery } from "../src/spellbook.js";

describe("query escaping (no network)", () => {
  it("escapeQuotedTerm escapes literal double quotes", () => {
    expect(escapeQuotedTerm('Ach! Hans, Run!')).toBe('Ach! Hans, Run!');
    expect(escapeQuotedTerm('"Ach! Hans, Run!"')).toBe('\\"Ach! Hans, Run!\\"');
  });

  it("buildCardsQuery escapes embedded quotes in each term", () => {
    const query = buildCardsQuery(['"Ach! Hans, Run!"', "Sol Ring"]);
    expect(query).toBe('"\\"Ach! Hans, Run!\\"" "Sol Ring"');
  });

  it("buildCardsQuery leaves ordinary names untouched", () => {
    expect(buildCardsQuery(["Hullbreaker Horror"])).toBe('"Hullbreaker Horror"');
  });
});
