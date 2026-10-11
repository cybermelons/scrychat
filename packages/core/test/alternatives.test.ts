import { afterEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { findAlternatives } from "../src/alternatives.js";

// Captured from api.scryfall.com and trimmed to the fields mapCard reads
// (src/scryfall.ts:181-213). This test used to hit the LIVE API, which made it
// fail for reasons unrelated to the code: running the suite a few times in a
// row earns HTTP 429, and the 30s timeout then reads like a regression. It also
// meant the one gate that could not run in CI.
const fixture = JSON.parse(
  readFileSync(new URL("./fixtures/alternatives-doubling-season.json", import.meta.url), "utf8"),
) as {
  expected: { card: string; roles: { slug: string; label: string; members: { name: string; usd: number | null; colorIdentity: string[] }[] }[] };
  responses: { url: string; status: number; body: unknown }[];
};

describe("alternatives (fixture, no network)", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  // Dispatch by URL, never by call order: findAlternatives_live issues a
  // VARIABLE-length sequence (one verifyCardHasTag probe per ranked candidate,
  // breaking at MAX_CONFIRMED_ROLES, then one search per confirmed role), so an
  // ordered mock chain would break on any ranking change. An unknown URL is a
  // hard failure rather than a silent 404 — a fixture that quietly stops
  // matching would let this test pass while exercising nothing.
  function installFixtureFetch(): () => string[] {
    const byUrl = new Map(fixture.responses.map((r) => [r.url, r]));
    const unmatched: string[] = [];
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const hit = byUrl.get(url);
      if (!hit) {
        unmatched.push(url);
        return new Response(JSON.stringify({ object: "error", code: "not_found" }), { status: 404 });
      }
      return new Response(JSON.stringify(hit.body), {
        status: hit.status,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    return () => unmatched;
  }

  it("groups token/counter doubler alternatives to Doubling Season by role", async () => {
    const unmatched = installFixtureFetch();

    const result = await findAlternatives("Doubling Season", {
      colorIdentityWithin: "gw",
      maxPrice: 20,
    });

    expect(unmatched()).toEqual([]);
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
  });

  // The invariants above would still pass on an empty-ish result, so pin the
  // exact shape the captured traffic produced. This is what a fixture buys that
  // the live test could not: the previous version had to avoid asserting card
  // names because live prices drifted them in and out of the usd<20 filter.
  it("reproduces the captured result exactly", async () => {
    const unmatched = installFixtureFetch();

    const result = await findAlternatives("Doubling Season", {
      colorIdentityWithin: "gw",
      maxPrice: 20,
    });

    expect(unmatched()).toEqual([]);
    expect(result).toEqual(fixture.expected);
  });

  it("makes no network call at all", async () => {
    let calls = 0;
    global.fetch = (async () => {
      calls++;
      throw new Error("network access from a fixture test");
    }) as typeof fetch;

    // Every request is unmatched, so the roles come back empty rather than
    // throwing: the assertion that matters is that nothing reached the network
    // beyond the stub, and the stub itself is what fails the test if it does.
    await expect(findAlternatives("Doubling Season", { colorIdentityWithin: "gw" })).rejects.toThrow(
      "network access from a fixture test",
    );
    expect(calls).toBe(1);
  });
});
