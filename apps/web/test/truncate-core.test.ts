import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  truncateForDisplay,
  isTruncatedResult,
  TOOL_RESULT_MAX_CHARS,
} from "../src/truncate-core.js";
import { fetchedCardNames, isLossyTruncated, type ToolCall } from "../src/grounding-core.js";

/**
 * deck_get-shaped result (packages/mcp/src/tools.ts): scalars, a byTag map of
 * arrays, a report summary. Built from the repo's real deck so the numbers in
 * these tests are the measured ones, not invented: the full result is >2048
 * and carries 75 cards + 1 commander.
 */
function realDeckGetResult(): { text: string; cardCount: number } {
  const deckPath = path.resolve(__dirname, "../../../decks/grothama-fight-draw.json");
  const deck = JSON.parse(fs.readFileSync(deckPath, "utf8"));
  const byTag: Record<string, unknown[]> = {};
  for (const c of deck.cards) {
    const tags: string[] = c.tags ?? [];
    if (tags.length === 0) (byTag["untagged"] ??= []).push(c);
    else for (const t of tags) (byTag[t] ??= []).push(c);
  }
  return {
    text: JSON.stringify({
      name: deck.name,
      commander: deck.commander,
      commanderIdentity: (deck.commanderIdentity ?? []).join(""),
      byTag,
      report: { total: deck.cards.length },
    }),
    cardCount: deck.cards.length,
  };
}

const deckGetCall = (result: string): ToolCall => ({
  name: "mcp__scrychat__deck_get",
  input: { name: "Grothama Fight Draw" },
  result,
});

describe("truncateForDisplay", () => {
  it("leaves a short result alone", () => {
    expect(truncateForDisplay("abc")).toBe("abc");
  });

  it("cuts an over-cap result and marks it", () => {
    const out = truncateForDisplay("x".repeat(TOOL_RESULT_MAX_CHARS + 10));
    expect(out.length).toBe(TOOL_RESULT_MAX_CHARS + 1);
    expect(isTruncatedResult(out)).toBe(true);
  });

  it("honours a caller-supplied budget", () => {
    expect(truncateForDisplay("abcdef", 3)).toBe("abc…");
  });

  it("a result exactly at the cap is not cut", () => {
    const exact = "y".repeat(TOOL_RESULT_MAX_CHARS);
    expect(truncateForDisplay(exact)).toBe(exact);
    expect(isTruncatedResult(truncateForDisplay(exact))).toBe(false);
  });
});

/*
 * The #70 regression tests. These assert the PROPERTY that was broken -- a
 * stored result stays complete and parseable -- rather than asserting that
 * some helper exists, so they fail if a future change reintroduces capping on
 * the capture path by any means.
 */
describe("a whole deck_get result keeps every card name (#70)", () => {
  it("the real deck's result is over the display cap", () => {
    const { text } = realDeckGetResult();
    // If this stops being true the rest of this block proves nothing, so it
    // is asserted rather than assumed.
    expect(text.length).toBeGreaterThan(TOOL_RESULT_MAX_CHARS);
  });

  it("grounds every card in the deck, plus the commander", () => {
    const { text, cardCount } = realDeckGetResult();
    expect(fetchedCardNames([deckGetCall(text)]).size).toBe(cardCount + 1);
  });

  it("is valid JSON, so parse*Spec components still render", () => {
    expect(() => JSON.parse(realDeckGetResult().text)).not.toThrow();
  });

  it("the old capture-time cut is what lost the names", () => {
    // The defect, reproduced: a character slice at the cap drops ~2/3 of the
    // deck and leaves invalid JSON. This is the behaviour #70 removed.
    const { text, cardCount } = realDeckGetResult();
    const sliced = truncateForDisplay(text);
    const seen = fetchedCardNames([deckGetCall(sliced)]).size;
    expect(seen).toBeLessThan(cardCount);
    expect(seen / (cardCount + 1)).toBeLessThan(0.5);
    expect(() => JSON.parse(sliced)).toThrow();
  });
});

describe("the grounding check still flags results cut by an older build", () => {
  it("an ellipsis-terminated result is reported as truncated", () => {
    expect(isLossyTruncated(`{"name":"Ete…`)).toBe(true);
  });

  it("a whole result is not", () => {
    expect(isLossyTruncated(realDeckGetResult().text)).toBe(false);
  });

  it("truncatedResults counts legacy records, not new ones", async () => {
    const { checkGrounding } = await import("../src/grounding-core.js");
    const { text } = realDeckGetResult();
    const whole = checkGrounding("[[Sol Ring]]", [deckGetCall(text)]);
    expect(whole.truncatedResults).toBe(0);
    const legacy = checkGrounding("[[Sol Ring]]", [deckGetCall(truncateForDisplay(text))]);
    expect(legacy.truncatedResults).toBe(1);
  });
});
