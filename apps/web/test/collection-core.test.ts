import { describe, it, expect } from "vitest";
import { parseCollectionBody, buildImportResult } from "../src/collection-core.js";

describe("parseCollectionBody", () => {
  it("treats a string body as a log", () => {
    const result = parseCollectionBody("text/plain", "[UnityCrossThreadLogger]<== GetPlayerCardsV3(1)\n{}");
    expect(result).toEqual({ kind: "log", text: "[UnityCrossThreadLogger]<== GetPlayerCardsV3(1)\n{}" });
  });

  it("rejects an empty string body", () => {
    const result = parseCollectionBody("text/plain", "");
    expect("error" in result).toBe(true);
  });

  it("accepts a valid {cards} JSON object", () => {
    const result = parseCollectionBody("application/json", { cards: { "66091": 4, "66093": 2 } });
    expect(result).toEqual({ kind: "cards", cards: { "66091": 4, "66093": 2 } });
  });

  it("rejects a body missing 'cards'", () => {
    const result = parseCollectionBody("application/json", { foo: 1 });
    expect("error" in result).toBe(true);
  });

  it("rejects a non-numeric key", () => {
    const result = parseCollectionBody("application/json", { cards: { abc: 1 } });
    expect("error" in result).toBe(true);
  });

  it("rejects a negative count", () => {
    const result = parseCollectionBody("application/json", { cards: { "123": -1 } });
    expect("error" in result).toBe(true);
  });

  it("rejects a non-integer count", () => {
    const result = parseCollectionBody("application/json", { cards: { "123": 1.5 } });
    expect("error" in result).toBe(true);
  });

  it("rejects an array body", () => {
    const result = parseCollectionBody("application/json", [1, 2, 3]);
    expect("error" in result).toBe(true);
  });

  it("rejects cards being an array", () => {
    const result = parseCollectionBody("application/json", { cards: [1, 2, 3] });
    expect("error" in result).toBe(true);
  });

  it("rejects an empty cards object", () => {
    const result = parseCollectionBody("application/json", { cards: {} });
    expect("error" in result).toBe(true);
  });

  it("rejects null body", () => {
    const result = parseCollectionBody("application/json", null);
    expect("error" in result).toBe(true);
  });

  it("rejects undefined body", () => {
    const result = parseCollectionBody(undefined, undefined);
    expect("error" in result).toBe(true);
  });
});

describe("buildImportResult", () => {
  it("computes counts from cards and mapResult", () => {
    const cards = { "1": 4, "2": 2, "3": 1 };
    const mapResult = {
      byArenaId: new Map([
        ["1", { oracleId: "a", name: "Foo" }],
        ["2", { oracleId: "b", name: "Bar" }],
      ]),
      unmatched: ["3"],
    };
    const result = buildImportResult(cards, mapResult);
    expect(result).toEqual({
      uniqueOwned: 2,
      totalCards: 7,
      unmatchedCount: 1,
      unmatchedIds: ["3"],
    });
  });

  it("caps unmatchedIds at 100", () => {
    const cards: Record<string, number> = {};
    const unmatched: string[] = [];
    for (let i = 0; i < 150; i++) {
      cards[String(i)] = 1;
      unmatched.push(String(i));
    }
    const mapResult = { byArenaId: new Map(), unmatched };
    const result = buildImportResult(cards, mapResult);
    expect(result.unmatchedCount).toBe(150);
    expect(result.unmatchedIds).toHaveLength(100);
    expect(result.totalCards).toBe(150);
  });
});
