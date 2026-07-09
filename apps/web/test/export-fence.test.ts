import { describe, it, expect } from "vitest";
import { wrapNamesInText } from "../src/linkify-core.js";
import { detectCategoryChipsInText, type CategoryResolver } from "../src/group-chips-core.js";

const KNOWN_CARDS = new Set(["sol ring", "lightning bolt", "mountain"]);

function isKnownCardName(name: string): boolean {
  return KNOWN_CARDS.has(name.trim().toLowerCase());
}

const resolve: CategoryResolver = (phrase) => ({
  slug: phrase.toLowerCase().replace(/\s+/g, "-"),
  label: phrase,
  members: ["X", "Y"],
});

const fenced = "Here is your deck:\n\n```\n1 Sol Ring *CMDR*\n1 Lightning Bolt\n16 Mountain\n```\n";

describe("fenced decklist protection (regression)", () => {
  it("wrapNamesInText leaves a fenced decklist byte-identical", () => {
    const result = wrapNamesInText(fenced, ["Sol Ring", "Lightning Bolt", "Mountain"], isKnownCardName);
    expect(result).toBe(fenced);
  });

  it("detectCategoryChipsInText leaves a fenced decklist byte-identical", () => {
    const result = detectCategoryChipsInText(fenced, resolve, {});
    expect(result).toBe(fenced);
  });

  it("positive control: wrapNamesInText DOES wrap a bare name outside a fence", () => {
    const result = wrapNamesInText("Play Sol Ring now.", ["Sol Ring"], isKnownCardName);
    expect(result).toContain("[[Sol Ring]]");
  });
});
