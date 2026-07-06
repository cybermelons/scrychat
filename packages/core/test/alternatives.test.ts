import { describe, it, expect } from "vitest";
import { findAlternatives } from "../src/alternatives.js";

const TIMEOUT = 30000;

describe("alternatives", () => {
  it(
    "findAlternatives groups token/counter doubler alternatives to Doubling Season by role",
    async () => {
      const result = await findAlternatives("Doubling Season", {
        colorIdentityWithin: "gw",
        maxPrice: 20,
      });

      expect(result.roles.length).toBeGreaterThan(0);
      expect(result.roles.some((r) => r.slug === "token-doubler")).toBe(true);

      const allMembers = result.roles.flatMap((r) => r.members.map((c) => c.name));
      // Doubling Season itself must never appear among its own alternatives.
      expect(allMembers).not.toContain("Doubling Season");
      expect(allMembers.length).toBeGreaterThan(0);

      for (const role of result.roles) {
        for (const member of role.members) {
          expect(member.usd === null || member.usd < 20).toBe(true);
          for (const color of member.colorIdentity) {
            expect(["G", "W"]).toContain(color);
          }
        }
      }

      // NOTE: at spec-authoring time, "Parallel Lives"/"Anointed Procession"
      // were the expected token-doubler alternatives under $20. Both have
      // since risen above $20 on the live market (Parallel Lives ~$38.60,
      // Anointed Procession ~$55.66 as of this run), so a strict usd<20
      // filter correctly excludes them now. We assert the algorithm's
      // invariants (grouped by the right role, self-excluded, price/identity
      // respected, non-empty) instead of pinning to specific card names that
      // are subject to live price drift.
    },
    TIMEOUT,
  );
});
