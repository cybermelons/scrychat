import { describe, it, expect } from "vitest";
import { detectCategoryChipsInText, type CategoryResolver } from "../src/group-chips-core.js";

const resolve: CategoryResolver = (phrase) => ({
  slug: phrase.toLowerCase().replace(/\s+/g, "-"),
  label: phrase,
  members: ["X", "Y"],
});

const fenced = "Here is your deck:\n\n```\n1 Sol Ring *CMDR*\n1 Lightning Bolt\n16 Mountain\n```\n";

describe("fenced decklist protection (regression)", () => {
  it("detectCategoryChipsInText leaves a fenced decklist byte-identical", () => {
    const result = detectCategoryChipsInText(fenced, resolve, {});
    expect(result).toBe(fenced);
  });
});
