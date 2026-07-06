import { describe, it, expect } from "vitest";
import { findCombos } from "../src/spellbook.js";

const TIMEOUT = 30000;

describe("spellbook", () => {
  it(
    "findCombos returns OK-status combos using the given card",
    async () => {
      const combos = await findCombos(["Hullbreaker Horror"]);
      expect(combos.length).toBeGreaterThan(0);
      for (const combo of combos) {
        expect(combo.pieces.length).toBeGreaterThan(0);
        expect(combo.produces.length).toBeGreaterThan(0);
        expect(combo.pieces).toContain("Hullbreaker Horror");
      }
    },
    TIMEOUT,
  );
});
