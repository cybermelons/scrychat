import { describe, it, expect } from "vitest";
import {
  populateGroupChipsInText,
  detectCategoryChipsInText,
  type CategoryResolver,
} from "../src/group-chips-core.js";

const CATEGORIES: Record<string, { slug: string; label: string; members: string[] }> = {
  "token doubler": {
    slug: "token-doubler",
    label: "token doubler",
    members: [
      "Anointed Procession",
      "Doubling Season",
      "Parallel Lives",
      "Mondrak, Glory Dominus",
      "Second Harvest",
      "Primal Vigor",
      "Pir, Imaginative Rascal",
      "Cathars' Crusade",
      "Mycoloth",
      "Hangarback Walker",
      "Overrun",
    ],
  },
  "sac outlet": {
    slug: "sac-outlet",
    label: "sac outlet",
    members: ["Viscera Seer", "Ashnod's Altar", "Phyrexian Tower"],
  },
  "board wipe": {
    slug: "board-wipe",
    label: "board wipe",
    members: ["Wrath of God", "Toxic Deluge"],
  },
};

function makeResolver(overrides: Record<string, { slug: string; label: string; members: string[] } | null> = {}): CategoryResolver {
  return (phrase: string) => {
    if (phrase in overrides) return overrides[phrase];
    return CATEGORIES[phrase] ?? null;
  };
}

describe("populateGroupChipsInText", () => {
  it("completes a 2-member chip up to the cap with dedup (case-insensitive)", () => {
    const text = "Consider [[group:token doubler|Anointed Procession; DOUBLING SEASON]] for your deck.";
    const resolver = makeResolver();
    const out = populateGroupChipsInText(text, resolver, 10);

    const match = /\[\[group:token doubler\|([^\]]+)\]\]/.exec(out);
    expect(match).not.toBeNull();
    const members = match![1].split("; ");
    // Model-listed members kept first, verbatim.
    expect(members[0]).toBe("Anointed Procession");
    expect(members[1]).toBe("DOUBLING SEASON");
    // No case-insensitive duplicate of "Doubling Season" appended.
    expect(members.filter((m) => m.toLowerCase() === "doubling season").length).toBe(1);
    // Capped at 10 total.
    expect(members.length).toBe(10);
  });

  it("leaves chip unchanged when resolver returns null", () => {
    const text = "Try [[group:unknown role|Foo; Bar]] here.";
    const resolver = makeResolver({ "unknown role": null });
    const out = populateGroupChipsInText(text, resolver, 10);
    expect(out).toBe(text);
  });

  it("rewrites a member-less [[group:label]] chip into a populated chip", () => {
    const text = "You need a [[group:sac outlet]] in this list.";
    const resolver = makeResolver();
    const out = populateGroupChipsInText(text, resolver, 10);
    expect(out).toBe(
      "You need a [[group:sac outlet|Viscera Seer; Ashnod's Altar; Phyrexian Tower]] in this list.",
    );
  });

  it("leaves a member-less chip unchanged when resolver has 0 members", () => {
    const text = "You need a [[group:mystery role]] in this list.";
    const resolver = makeResolver({ "mystery role": { slug: "mystery", label: "mystery role", members: [] } });
    const out = populateGroupChipsInText(text, resolver, 10);
    expect(out).toBe(text);
  });

  it("leaves a member-less chip unchanged when resolver returns null", () => {
    const text = "You need a [[group:mystery role]] in this list.";
    const resolver = makeResolver({ "mystery role": null });
    const out = populateGroupChipsInText(text, resolver, 10);
    expect(out).toBe(text);
  });

  it("respects the cap", () => {
    const text = "[[group:token doubler|Anointed Procession]]";
    const resolver = makeResolver();
    const out = populateGroupChipsInText(text, resolver, 3);
    const match = /\[\[group:token doubler\|([^\]]+)\]\]/.exec(out);
    const members = match![1].split("; ");
    expect(members.length).toBe(3);
  });

  it("leaves a chip already at/above cap unchanged", () => {
    const text = "[[group:board wipe|A; B; C]]";
    const resolver = makeResolver();
    const out = populateGroupChipsInText(text, resolver, 3);
    expect(out).toBe(text);
  });

  it("never touches text outside chips", () => {
    const text = "Before text [[group:sac outlet|Viscera Seer]] middle text [[group:board wipe]] after text.";
    const resolver = makeResolver();
    const out = populateGroupChipsInText(text, resolver, 10);
    expect(out.startsWith("Before text ")).toBe(true);
    expect(out).toContain(" middle text ");
    expect(out.endsWith(" after text.")).toBe(true);
  });

  it("running twice is stable (no further growth or reordering)", () => {
    const text = "[[group:token doubler|Anointed Procession; Doubling Season]]";
    const resolver = makeResolver();
    const once = populateGroupChipsInText(text, resolver, 10);
    const twice = populateGroupChipsInText(once, resolver, 10);
    expect(twice).toBe(once);
  });

  it("running twice on a member-less-turned-populated chip is stable", () => {
    const text = "[[group:sac outlet]]";
    const resolver = makeResolver();
    const once = populateGroupChipsInText(text, resolver, 10);
    const twice = populateGroupChipsInText(once, resolver, 10);
    expect(twice).toBe(once);
  });

  it("handles multiple chips in one text independently", () => {
    const text =
      "First [[group:sac outlet|Viscera Seer]] then [[group:board wipe]] and [[group:unknown|X]].";
    const resolver = makeResolver({ unknown: null });
    const out = populateGroupChipsInText(text, resolver, 10);

    expect(out).toContain("[[group:sac outlet|Viscera Seer; Ashnod's Altar; Phyrexian Tower]]");
    expect(out).toContain("[[group:board wipe|Wrath of God; Toxic Deluge]]");
    expect(out).toContain("[[group:unknown|X]]");
  });

  it("never produces a 0-member chip from a non-empty starting chip", () => {
    const text = "[[group:weird|SomeMember]]";
    const resolver = makeResolver({ weird: { slug: "weird", label: "weird", members: [] } });
    const out = populateGroupChipsInText(text, resolver, 10);
    // Model already listed a member, so even with 0 resolver members the
    // chip must retain the model's member (not become empty).
    expect(out).toBe(text);
  });
});

// Resolver stub keyed by the CATEGORY_PHRASE_RULES resolveAs phrases.
const DETECT_CATEGORIES: Record<string, { slug: string; label: string; members: string[] }> = {
  "token doubler": {
    slug: "token-doubler",
    label: "token doubler",
    members: ["Anointed Procession", "Doubling Season", "Parallel Lives"],
  },
  sweeper: {
    slug: "sweeper",
    label: "sweeper",
    members: ["Blasphemous Act", "Toxic Deluge", "Farewell"],
  },
  "sacrifice outlet": {
    slug: "sacrifice-outlet-creature",
    label: "sacrifice outlet-creature",
    members: ["Viscera Seer", "Ashnod's Altar"],
  },
  "spot removal": {
    slug: "spot-removal",
    label: "spot removal",
    members: ["Swords to Plowshares", "Path to Exile"],
  },
  "graveyard hate": {
    slug: "hate-graveyard",
    label: "hate-graveyard",
    members: ["Deathrite Shaman", "Scavenging Ooze"],
  },
  "draw engine": {
    slug: "draw-engine",
    label: "draw engine",
    members: ["Skullclamp", "Rhystic Study"],
  },
  ramp: {
    slug: "ramp",
    label: "ramp",
    members: ["Smothering Tithe", "Lotus Petal"],
  },
};

function makeDetectResolver(
  overrides: Record<string, { slug: string; label: string; members: string[] } | null> = {},
): CategoryResolver {
  return (phrase: string) => {
    if (phrase in overrides) return overrides[phrase];
    return DETECT_CATEGORIES[phrase] ?? null;
  };
}

describe("detectCategoryChipsInText", () => {
  it("replaces a category phrase in prose with a populated chip", () => {
    const out = detectCategoryChipsInText("run a token doubler in this deck", makeDetectResolver());
    expect(out).toBe(
      "run a [[group:token doubler|Anointed Procession; Doubling Season; Parallel Lives]] in this deck",
    );
  });

  it("replaces a bold phrase, leaving the chip inside the bold markers", () => {
    const out = detectCategoryChipsInText("You need **Token Doublers** here.", makeDetectResolver());
    expect(out).toBe(
      "You need **[[group:token doublers|Anointed Procession; Doubling Season; Parallel Lives]]** here.",
    );
  });

  it("skips a rule when an existing group chip already covers the category", () => {
    const text = "See [[group:token doubler|Doubling Season; Parallel Lives]] — a token doubler wins games.";
    const out = detectCategoryChipsInText(text, makeDetectResolver());
    expect(out).toBe(text);
  });

  it("does not touch a phrase inside an existing [[Card]] ref span", () => {
    const text = "[[token doubler]] is already a ref span.";
    const out = detectCategoryChipsInText(text, makeDetectResolver());
    expect(out).toBe(text);
  });

  it("leaves the phrase untouched when the resolver returns null", () => {
    const text = "run a token doubler in this deck";
    const out = detectCategoryChipsInText(text, makeDetectResolver({ "token doubler": null }));
    expect(out).toBe(text);
  });

  it("leaves the phrase untouched when the resolver has fewer than 2 members", () => {
    const text = "run a token doubler in this deck";
    const out = detectCategoryChipsInText(
      text,
      makeDetectResolver({
        "token doubler": { slug: "token-doubler", label: "token doubler", members: ["Doubling Season"] },
      }),
    );
    expect(out).toBe(text);
  });

  it("honors maxChips", () => {
    const text = "Add a token doubler, a sac outlet, and some board wipes.";
    const out = detectCategoryChipsInText(text, makeDetectResolver(), { maxChips: 2 });
    expect(out).toContain("[[group:token doubler|");
    expect(out).toContain("[[group:sac outlet|");
    expect(out).not.toContain("[[group:board wipes|");
    expect(out).toContain("board wipes");
  });

  it("honors cap on chip members", () => {
    const out = detectCategoryChipsInText("run a token doubler here", makeDetectResolver(), { cap: 2 });
    const m = /\[\[group:token doubler\|([^\]]+)\]\]/.exec(out);
    expect(m).not.toBeNull();
    expect(m![1].split("; ").length).toBe(2);
  });

  it("does not touch a phrase on a markdown table row", () => {
    const text = "| Card | Role |\n| --- | --- |\n| Doubling Season | token doubler |";
    const out = detectCategoryChipsInText(text, makeDetectResolver());
    expect(out).toBe(text);
  });

  it("does not touch a phrase inside a code fence", () => {
    const text = "```\ntoken doubler\n```";
    const out = detectCategoryChipsInText(text, makeDetectResolver());
    expect(out).toBe(text);
  });

  it("is idempotent: running the output through again changes nothing", () => {
    const text = "Add a token doubler and some board wipes for safety.";
    const once = detectCategoryChipsInText(text, makeDetectResolver());
    const twice = detectCategoryChipsInText(once, makeDetectResolver());
    expect(twice).toBe(once);
  });

  it('maps "board wipes" via resolveAs "sweeper" but labels the chip "board wipes"', () => {
    const out = detectCategoryChipsInText("You need more board wipes.", makeDetectResolver());
    expect(out).toBe("You need more [[group:board wipes|Blasphemous Act; Toxic Deluge; Farewell]].");
  });

  it("only replaces the first occurrence of a phrase per rule", () => {
    const text = "A token doubler is great; another token doubler is greedy.";
    const out = detectCategoryChipsInText(text, makeDetectResolver());
    expect(out.match(/\[\[group:token doubler\|/g)?.length).toBe(1);
    // Second occurrence stays plain prose.
    expect(out).toContain("another token doubler is greedy");
  });
});
