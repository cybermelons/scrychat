import { describe, it, expect } from "vitest";
import { checkGrounding, extractCardClaims, fetchedCardNames, type ToolCall } from "../src/grounding-core.js";

const getCard = (name: string, canonical = name): ToolCall => ({
  name: "mcp__scrychat__get_card",
  input: { name },
  result: JSON.stringify({ name: canonical, cmc: 1 }),
});

describe("extractCardClaims", () => {
  it("extracts every claim form, with form and alias-stripped name", () => {
    const text = "[[A]] ![[B]] [[C|alias]] ![[D|alias2]] [[group:ramp|E; F]]";
    const got = extractCardClaims(text).map((c) => `${c.form}:${c.name}`);
    expect(got).toEqual(["hover:A", "embed:B", "hover:C", "embed:D", "group:E", "group:F"]);
  });

  it("malformed [[group:x]] is not a card claim", () => {
    expect(extractCardClaims("see [[group:x]] and [[group:ramp]]")).toEqual([]);
  });

  it("an embed is not double-counted as a hover", () => {
    expect(extractCardClaims("![[Sol Ring]]")).toHaveLength(1);
  });

  it("empty and plain text yield no claims", () => {
    expect(extractCardClaims("")).toEqual([]);
    expect(extractCardClaims("Sol Ring is good")).toEqual([]);
  });
});

describe("fetchedCardNames", () => {
  it("get_card grounds by result name", () => {
    expect([...fetchedCardNames([getCard("sol rng", "Sol Ring")])]).toEqual(["Sol Ring"]);
  });

  it("get_card with no result yet falls back to the input name", () => {
    expect([...fetchedCardNames([{ name: "get_card", input: { name: "Sol Ring" } }])]).toEqual(["Sol Ring"]);
  });

  it("find_combos cards[] ground and its pieces ground", () => {
    const set = fetchedCardNames([
      { name: "mcp__scrychat__find_combos", input: { cards: ["Thassa's Oracle"] }, result: '[{"pieces":["Thassa\'s Oracle","Demonic Consultation"]}]' },
    ]);
    expect(set.has("Thassa's Oracle")).toBe(true);
    expect(set.has("Demonic Consultation")).toBe(true);
  });

  it("search_cards grounds names in its RESULT, not its query", () => {
    const set = fetchedCardNames([
      { name: "search_cards", input: { query: "otag:ramp" }, result: '{"total":2,"cards":[{"n":"Sol Ring","cmc":1},{"n":"Arcane Signet"}]}' },
    ]);
    expect([...set].sort()).toEqual(["Arcane Signet", "Sol Ring"]);
  });

  it("find_alternatives grounds members from its result", () => {
    const set = fetchedCardNames([
      { name: "find_alternatives", input: { card: "Cultivate" }, result: '{"card":"Cultivate","roles":[{"slug":"ramp","members":[{"n":"Kodama\'s Reach"}]}]}' },
    ]);
    expect(set.has("Kodama's Reach")).toBe(true);
  });

  it("deck_add grounds cards[].name but NOT the deck name", () => {
    const set = fetchedCardNames([
      { name: "deck_add", input: { name: "Sol Ring Tribal", cards: [{ name: "Mind Stone" }] } },
    ]);
    expect([...set]).toEqual(["Mind Stone"]);
  });

  it("an errored call grounds nothing", () => {
    expect(fetchedCardNames([getCard("Black Lotus", "x")].map((c) => ({ ...c, result: '{"error":"Card not found: Black Lotus"}' }))).size).toBe(0);
  });

  it("unlisted tools ground nothing", () => {
    expect(fetchedCardNames([{ name: "deck_list", input: { name: "Sol Ring" }, result: '[{"name":"Sol Ring"}]' }]).size).toBe(0);
  });

  it("truncated result: complete names kept, cut-off name dropped", () => {
    const set = fetchedCardNames([{ name: "search_cards", result: '{"cards":[{"n":"Sol Ring"},{"n":"Arcane Sig…' }]);
    expect([...set]).toEqual(["Sol Ring"]);
  });
});

describe("checkGrounding", () => {
  it("a deck name must NOT ground a card claim", () => {
    // deck_get/deck_add `name` is a DECK. A deck named like a card must not ground that card.
    const calls: ToolCall[] = [
      { name: "mcp__scrychat__deck_get", input: { name: "Sol Ring" }, result: '{"name":"Sol Ring","commander":"Sheoldred","byTag":{}}' },
      { name: "mcp__scrychat__deck_add", input: { name: "Sol Ring", cards: [] } },
      { name: "mcp__scrychat__deck_rename", input: { name: "Sol Ring", new_name: "Mind Stone" } },
    ];
    const r = checkGrounding("Play [[Sol Ring]] and [[Mind Stone]].", calls);
    expect(r.ungrounded.map((c) => c.name)).toEqual(["Sol Ring", "Mind Stone"]);
    expect(r.grounded).toEqual([]);
  });

  it("deck_get grounds its commander and byTag cards, not the deck name", () => {
    const result = '{"name":"Mono Lotus","commander":"Sheoldred, the Apocalypse","byTag":{"ramp":[{"name":"Sol Ring","count":1}]}}';
    const r = checkGrounding("[[Sheoldred, the Apocalypse]] [[Sol Ring]] [[Mono Lotus]]", [
      { name: "deck_get", input: { name: "Mono Lotus" }, result },
    ]);
    expect(r.grounded.map((c) => c.name)).toEqual(["Sheoldred, the Apocalypse", "Sol Ring"]);
    expect(r.ungrounded.map((c) => c.name)).toEqual(["Mono Lotus"]);
  });

  it("case, spacing and curly apostrophes still ground", () => {
    const r = checkGrounding("[[  sol   RING ]] [[Thassa’s Oracle]]", [getCard("Sol Ring"), getCard("Thassa's Oracle")]);
    expect(r.ungrounded).toEqual([]);
    expect(r.grounded).toHaveLength(2);
  });

  it("DFC: any face grounds, in either direction", () => {
    const r1 = checkGrounding("[[Malakir Rebirth]] [[Malakir Mire]]", [getCard("Malakir Rebirth // Malakir Mire")]);
    expect(r1.ungrounded).toEqual([]);
    const r2 = checkGrounding("[[Malakir Rebirth // Malakir Mire]]", [getCard("Malakir Rebirth")]);
    expect(r2.ungrounded).toEqual([]);
    const r3 = checkGrounding("[[Lightning Bolt]]", [getCard("Malakir Rebirth // Malakir Mire")]);
    expect(r3.ungrounded).toHaveLength(1);
  });

  it("a claim grounded by a search RESULT is grounded", () => {
    const r = checkGrounding("[[Arcane Signet]]", [
      { name: "search_cards", input: { query: "otag:ramp" }, result: '{"cards":[{"n":"Arcane Signet"}]}' },
    ]);
    expect(r.ungrounded).toEqual([]);
  });

  it("#46 scenario: 13 claims after one get_card -> 12 ungrounded", () => {
    const names = Array.from({ length: 13 }, (_, i) => `Card ${String.fromCharCode(65 + i)}`);
    const text = names.map((n) => `[[${n}]]`).join(", ");
    const r = checkGrounding(text, [getCard("Card A")]);
    expect(r.claims).toHaveLength(13);
    expect(r.grounded).toHaveLength(1);
    expect(r.ungrounded).toHaveLength(12);
    expect(r.fetched).toEqual(["Card A"]);
  });

  it("group chip members are each checked", () => {
    const r = checkGrounding("[[group:ramp|Sol Ring; Mind Stone; Fake Card]]", [getCard("Sol Ring"), getCard("Mind Stone")]);
    expect(r.ungrounded.map((c) => c.name)).toEqual(["Fake Card"]);
  });

  it("counts truncated results", () => {
    const r = checkGrounding("[[X]]", [{ name: "search_cards", result: '{"cards":[{"n":"Sol Ring"},…' }]);
    expect(r.truncatedResults).toBe(1);
  });
});

describe("adversarial input", () => {
  it("unclosed and nested brackets do not throw", () => {
    expect(() => checkGrounding("[[ [[ ![[ [[a|[[b]] ]]] [[group:", [])).not.toThrow();
  });

  it("100KB of unclosed [[ finishes quickly and flags nothing", () => {
    const t0 = Date.now();
    const r = checkGrounding("[[".repeat(50_000), []);
    expect(r.claims).toEqual([]);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it("text past 100000 chars is not scanned and is flagged truncated", () => {
    const r = checkGrounding(`[[Early]]${" ".repeat(100_000)}[[Late]]`, []);
    expect(r.claims.map((c) => c.name)).toEqual(["Early"]);
    expect(r.truncated).toBe(true);
  });

  it("a 500-member group chip is capped at 200 members and flagged", () => {
    const members = Array.from({ length: 500 }, (_, i) => `N${i}`).join("; ");
    const r = checkGrounding(`[[group:big|${members}]]`, []);
    expect(r.claims).toHaveLength(200);
    expect(r.truncated).toBe(true);
  });

  // markdown.ts's ref regex is [^\]|]+ — it matches across a newline, so the UI
  // renders [[Sol\nRing]] as a card ref. The claim scan must see it too; a claim
  // the UI shows but the check cannot see is a silent false pass.
  it("a claim wrapped across a newline is still extracted", () => {
    const r = checkGrounding("Play [[Sol\nRing]] now.", []);
    expect(r.claims.map((c) => c.name)).toEqual(["Sol\nRing"]);
    expect(r.ungrounded).toHaveLength(1);
  });

  it("a newline-wrapped claim is grounded by the same card fetched flat", () => {
    const r = checkGrounding("Play [[Sol\nRing]].", [
      { name: "mcp__scrychat__get_card", input: { name: "Sol Ring" }, result: '{"name":"Sol Ring"}' },
    ]);
    expect(r.grounded.map((c) => c.name)).toEqual(["Sol\nRing"]);
    expect(r.ungrounded).toEqual([]);
  });

  it("non-object tool input does not throw", () => {
    expect(() => fetchedCardNames([{ name: "deck_add", input: "x" }, { name: "find_combos", input: null }, { name: "get_card", input: 5 }])).not.toThrow();
  });
});
