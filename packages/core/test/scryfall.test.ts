import { describe, it, expect } from "vitest";
import { searchCards, getCard } from "../src/scryfall.js";

const TIMEOUT = 30000;

describe("scryfall", () => {
  it(
    "searchCards finds token doublers legal in commander",
    async () => {
      const { total, cards } = await searchCards("otag:token-doubler legal:commander");
      expect(total).toBeGreaterThanOrEqual(10);
      expect(total).toBeLessThanOrEqual(30);
      const names = cards.map((c) => c.name);
      expect(names).toContain("Doubling Season");
      expect(names).toContain("Parallel Lives");
    },
    TIMEOUT,
  );

  it(
    "searchCards supports composed constraints (identity, price, legality)",
    async () => {
      const { total, cards } = await searchCards(
        "otag:sacrifice-outlet id<=bg usd<3 legal:commander",
        { limit: 30 },
      );
      expect(total).toBeGreaterThan(400);
      for (const card of cards) {
        for (const color of card.colorIdentity) {
          expect(["B", "G"]).toContain(color);
        }
      }
    },
    TIMEOUT,
  );

  it(
    "getCard resolves a fuzzy name to the canonical card",
    async () => {
      const card = await getCard("kodama east tree");
      expect(card?.name).toBe("Kodama of the East Tree");
      expect(card?.colorIdentity).toEqual(["G"]);
    },
    TIMEOUT,
  );

  it(
    "searchCards returns an empty result for a query with no matches",
    async () => {
      const { total, cards } = await searchCards("otag:nonexistent-zzz-tag-that-does-not-exist");
      expect(total).toBe(0);
      expect(cards).toEqual([]);
    },
    TIMEOUT,
  );
});
