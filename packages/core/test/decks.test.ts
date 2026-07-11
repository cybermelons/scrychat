import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createDeck,
  addCards,
  removeCards,
  getDeck,
  listDecks,
  deleteDeck,
  deckReport,
  deckSummary,
  setCardTags,
  renameTag,
  removeTag,
  setCardCount,
  renameDeck,
  setCommander,
  setCardTagsResult,
  exportDeck,
  resolveQuotaTargets,
  DEFAULT_QUOTA_TARGETS,
  RECOGNIZED_QUOTA_TAGS,
  type CardResolver,
  type ResolvedCard,
  type QuotaTargets,
} from "../src/decks.js";
import { parseDecklist } from "../src/import.js";

const FIXTURES: Record<string, ResolvedCard> = {
  "trostani, selesnya's voice": {
    name: "Trostani, Selesnya's Voice",
    colorIdentity: ["G", "W"],
    cmc: 5,
    typeLine: "Legendary Creature — Dryad Avatar",
    legalCommander: true,
    arena: true,
  },
  "lightning bolt": {
    name: "Lightning Bolt",
    colorIdentity: ["R"],
    cmc: 1,
    typeLine: "Instant",
    legalCommander: true,
  },
  "sol ring": {
    name: "Sol Ring",
    colorIdentity: [],
    cmc: 1,
    typeLine: "Artifact",
    legalCommander: true,
    arena: true,
  },
  forest: {
    name: "Forest",
    colorIdentity: [],
    cmc: 0,
    typeLine: "Basic Land — Forest",
    legalCommander: true,
    arena: true,
  },
  "elvish visionary": {
    name: "Elvish Visionary",
    colorIdentity: ["G"],
    cmc: 2,
    typeLine: "Creature — Elf Shaman",
    legalCommander: true,
    arena: false,
  },
  "swords to plowshares": {
    name: "Swords to Plowshares",
    colorIdentity: ["W"],
    cmc: 1,
    typeLine: "Instant",
    legalCommander: true,
  },
  "hallar, the firefletcher": {
    name: "Hallar, the Firefletcher",
    colorIdentity: ["R", "G"],
    cmc: 3,
    typeLine: "Legendary Creature — Elf Archer",
    legalCommander: true,
  },
  "krenko, mob boss": {
    name: "Krenko, Mob Boss",
    colorIdentity: ["R"],
    cmc: 3,
    typeLine: "Legendary Creature — Goblin",
    legalCommander: true,
  },
  "grizzly bears": {
    name: "Grizzly Bears",
    colorIdentity: ["G"],
    cmc: 2,
    typeLine: "Creature — Bear",
    legalCommander: true,
  },
  "kefka, court mage // kefka, ruler of ruin": {
    name: "Kefka, Court Mage // Kefka, Ruler of Ruin",
    colorIdentity: ["U", "B", "R"],
    cmc: 4,
    typeLine: "Legendary Creature — Human Wizard // Legendary Planeswalker — Kefka",
    legalCommander: true,
  },
  "fable of the mirror-breaker // reflection of kiki-jiki": {
    name: "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki",
    colorIdentity: ["R"],
    cmc: 2,
    typeLine: "Enchantment Creature — Faerie Wizard // Legendary Creature — Kobold Shaman",
    legalCommander: true,
  },
};

const resolver: CardResolver = async (name: string) => {
  const found = FIXTURES[name.toLowerCase()];
  return found ?? null;
};

let decksDir: string;

beforeEach(async () => {
  decksDir = await fs.mkdtemp(path.join(os.tmpdir(), "scrychat-decks-"));
});

afterEach(async () => {
  await fs.rm(decksDir, { recursive: true, force: true });
});

describe("decks", () => {
  it("creates a deck resolving commander identity", async () => {
    const deck = await createDeck(
      "Selesnya Value",
      "Trostani, Selesnya's Voice",
      resolver,
      decksDir
    );
    expect(deck.commander).toBe("Trostani, Selesnya's Voice");
    expect(deck.commanderIdentity.sort()).toEqual(["G", "W"]);
    expect(deck.cards).toEqual([]);

    const listed = await listDecks(decksDir);
    expect(listed.length).toBe(1);

    const fetched = await getDeck("Selesnya Value", decksDir);
    expect(fetched?.name).toBe("Selesnya Value");
  });

  it("rejects creating a deck with an unknown commander", async () => {
    await expect(
      createDeck("Bad Deck", "Not A Real Card", resolver, decksDir)
    ).rejects.toThrow();
  });

  it("adds a valid card within commander identity", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    const result = await addCards(
      "Selesnya Value",
      [{ name: "Elvish Visionary", role: "draw" }],
      resolver,
      decksDir
    );
    expect(result.added.length).toBe(1);
    expect(result.rejected.length).toBe(0);

    const deck = await getDeck("Selesnya Value", decksDir);
    expect(deck?.cards.some((c) => c.name === "Elvish Visionary")).toBe(true);
  });

  it("rejects a card outside commander color identity", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    const result = await addCards(
      "Selesnya Value",
      [{ name: "Lightning Bolt", role: "interaction" }],
      resolver,
      decksDir
    );
    expect(result.added.length).toBe(0);
    expect(result.rejected.length).toBe(1);
    expect(result.rejected[0].reason.toLowerCase()).toContain("identity");
  });

  it("rejects a duplicate non-basic card (singleton rule)", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    await addCards("Selesnya Value", [{ name: "Sol Ring", role: "ramp" }], resolver, decksDir);
    const result = await addCards(
      "Selesnya Value",
      [{ name: "Sol Ring", role: "ramp" }],
      resolver,
      decksDir
    );
    expect(result.added.length).toBe(0);
    expect(result.rejected.length).toBe(1);
    expect(result.rejected[0].reason.toLowerCase()).toContain("singleton");
  });

  it("allows duplicate Forest with a count", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    const result = await addCards(
      "Selesnya Value",
      [{ name: "Forest", role: "land", count: 10 }],
      resolver,
      decksDir
    );
    expect(result.added.length).toBe(1);
    expect(result.added[0].count).toBe(10);
    expect(result.rejected.length).toBe(0);

    const again = await addCards(
      "Selesnya Value",
      [{ name: "Forest", role: "land", count: 5 }],
      resolver,
      decksDir
    );
    expect(again.added.length).toBe(1);
    expect(again.rejected.length).toBe(0);
  });

  it("removes cards from a deck", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    await addCards(
      "Selesnya Value",
      [{ name: "Elvish Visionary", role: "draw" }],
      resolver,
      decksDir
    );
    await removeCards("Selesnya Value", ["Elvish Visionary"], decksDir);
    const deck = await getDeck("Selesnya Value", decksDir);
    expect(deck?.cards.some((c) => c.name === "Elvish Visionary")).toBe(false);
  });

  it("deletes a deck", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    const deleted = await deleteDeck("Selesnya Value", decksDir);
    expect(deleted).toBe(true);
    const fetched = await getDeck("Selesnya Value", decksDir);
    expect(fetched).toBeNull();
  });

  it("produces a report with byTag, curve, and quotaCheck", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    await addCards(
      "Selesnya Value",
      [
        { name: "Forest", role: "land", count: 36 },
        { name: "Sol Ring", role: "ramp" },
        { name: "Elvish Visionary", role: "draw" },
      ],
      resolver,
      decksDir
    );

    const report = await deckReport("Selesnya Value", resolver, decksDir);
    expect(report.total).toBe(38);
    expect(report.targetTotal).toBe(99);
    expect(report.overUnder).toBe(38 - 99);
    expect(report.byTag.land).toBe(36);
    expect(report.byTag.ramp).toBe(1);
    expect(report.byTag.draw).toBe(1);
    expect(report.curve["1"]).toBe(1); // Sol Ring cmc 1
    expect(report.curve["2"]).toBe(1); // Elvish Visionary cmc 2
    expect(report.quotaCheck.lands.have).toBe(36);
    expect(report.quotaCheck.lands.ok).toBe(true);
    expect(report.quotaCheck.ramp.ok).toBe(false);
    expect(report.identityViolations).toEqual([]);
  });

  it("aggregates interaction/removal/counterspell roles (case-insensitive) into the interaction quota bucket", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    await addCards(
      "Selesnya Value",
      [
        { name: "Swords to Plowshares", role: "Removal" },
        { name: "Sol Ring", role: "COUNTERSPELL" },
        { name: "Elvish Visionary", role: "interaction" },
      ],
      resolver,
      decksDir
    );

    const report = await deckReport("Selesnya Value", resolver, decksDir);
    // byTag keeps literal (case-preserved) tag keys
    expect(report.byTag.Removal).toBe(1);
    expect(report.byTag.COUNTERSPELL).toBe(1);
    expect(report.byTag.interaction).toBe(1);
    // quotaCheck.interaction aggregates all three, case-insensitively
    expect(report.quotaCheck.interaction.have).toBe(3);
    expect(report.quotaCheck.interaction.ok).toBe(false); // below 8-10 quota
  });

  it("counts a multi-tag interaction card once toward the interaction quota", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    await addCards(
      "Selesnya Value",
      [{ name: "Swords to Plowshares", tags: ["removal", "counterspell"] }],
      resolver,
      decksDir
    );

    const report = await deckReport("Selesnya Value", resolver, decksDir);
    expect(report.quotaCheck.interaction.have).toBe(1);
  });

  it("migrates a legacy role field on read, without a role key in the result", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    const filePath = path.join(decksDir, "selesnya-value.json");
    const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
    raw.cards = [{ name: "Sol Ring", role: "ramp", count: 1 }];
    await fs.writeFile(filePath, JSON.stringify(raw, null, 2), "utf8");

    const deck = await getDeck("Selesnya Value", decksDir);
    expect(deck?.cards[0]).toEqual({ name: "Sol Ring", tags: ["ramp"], count: 1 });
    expect((deck?.cards[0] as any).role).toBeUndefined();
  });

  it("counts a multi-tag card toward every quota/tag bucket it qualifies for", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    await addCards(
      "Selesnya Value",
      [{ name: "Sol Ring", tags: ["ramp", "combo piece"] }],
      resolver,
      decksDir
    );

    const report = await deckReport("Selesnya Value", resolver, decksDir);
    expect(report.byTag.ramp).toBe(1);
    expect(report.byTag["combo piece"]).toBe(1);
    expect(report.quotaCheck.ramp.have).toBe(1);
    expect(report.untaggedForQuota).toBe(0);
  });

  it("counts a card with only unrecognized tags toward untaggedForQuota", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    await addCards(
      "Selesnya Value",
      [
        { name: "Sol Ring", tags: ["combo piece"] },
        { name: "Forest", tags: ["land"], count: 1 },
      ],
      resolver,
      decksDir
    );

    const report = await deckReport("Selesnya Value", resolver, decksDir);
    expect(report.untaggedForQuota).toBe(1);
  });

  it("RECOGNIZED_QUOTA_TAGS is the union of quota tag names and interaction roles", () => {
    expect(new Set(RECOGNIZED_QUOTA_TAGS)).toEqual(
      new Set(["land", "ramp", "draw", "interaction", "wipe", "removal", "counterspell"])
    );
  });

  describe("configurable quota targets", () => {
    it("global targets override the default want/ok", async () => {
      await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
      await addCards(
        "Selesnya Value",
        [{ name: "Sol Ring", tags: ["ramp"] }],
        resolver,
        decksDir
      );

      const globalTargets: Partial<QuotaTargets> = { ramp: [1, 1] };
      const report = await deckReport("Selesnya Value", resolver, decksDir, globalTargets);
      expect(report.quotaCheck.ramp.want).toBe("1-1");
      expect(report.quotaCheck.ramp.ok).toBe(true);
      // untouched fields still use built-in defaults
      expect(report.quotaCheck.lands.want).toBe("36-38");
    });

    it("per-deck quotaTargets in the deck file beats global targets", async () => {
      await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
      await addCards(
        "Selesnya Value",
        [{ name: "Sol Ring", tags: ["ramp"] }],
        resolver,
        decksDir
      );

      const filePath = path.join(decksDir, "selesnya-value.json");
      const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
      raw.quotaTargets = { ramp: [1, 1] };
      await fs.writeFile(filePath, JSON.stringify(raw, null, 2), "utf8");

      const globalTargets: Partial<QuotaTargets> = { ramp: [5, 6] };
      const report = await deckReport("Selesnya Value", resolver, decksDir, globalTargets);
      expect(report.quotaCheck.ramp.want).toBe("1-1");
      expect(report.quotaCheck.ramp.ok).toBe(true);
    });

    it("round-trips quotaTargets on the deck file through create/write/read", async () => {
      await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
      const filePath = path.join(decksDir, "selesnya-value.json");
      const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
      raw.quotaTargets = { wipes: [3, 5] };
      await fs.writeFile(filePath, JSON.stringify(raw, null, 2), "utf8");

      const deck = await getDeck("Selesnya Value", decksDir);
      expect(deck?.quotaTargets).toEqual({ wipes: [3, 5] });
    });

    it("deckSummary passes targets through and matches deckReport's quotaCheck", async () => {
      await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
      await addCards(
        "Selesnya Value",
        [{ name: "Sol Ring", tags: ["ramp"] }],
        resolver,
        decksDir
      );

      const globalTargets: Partial<QuotaTargets> = { ramp: [1, 1] };
      const report = await deckReport("Selesnya Value", resolver, decksDir, globalTargets);
      const summary = await deckSummary("Selesnya Value", resolver, decksDir, globalTargets);
      expect(summary.quotaCheck).toEqual(report.quotaCheck);
    });

    describe("resolveQuotaTargets", () => {
      it("falls back to DEFAULT_QUOTA_TARGETS when nothing is given", () => {
        expect(resolveQuotaTargets()).toEqual(DEFAULT_QUOTA_TARGETS);
      });

      it("applies a valid global override field-wise, leaving other fields default", () => {
        const result = resolveQuotaTargets({ lands: [30, 32] });
        expect(result.lands).toEqual([30, 32]);
        expect(result.ramp).toEqual(DEFAULT_QUOTA_TARGETS.ramp);
      });

      it("per-deck override wins over global for the same field", () => {
        const result = resolveQuotaTargets({ ramp: [5, 6] }, { ramp: [1, 2] });
        expect(result.ramp).toEqual([1, 2]);
      });

      it("falls back to global when per-deck field is invalid (wrong length)", () => {
        const result = resolveQuotaTargets({ ramp: [5, 6] }, { ramp: [1] as any });
        expect(result.ramp).toEqual([5, 6]);
      });

      it("falls back to default when both global and per-deck fields are invalid (non-numeric)", () => {
        const result = resolveQuotaTargets(
          { draw: ["a", "b"] as any },
          { draw: ["c", "d"] as any }
        );
        expect(result.draw).toEqual(DEFAULT_QUOTA_TARGETS.draw);
      });

      it("falls back to default when a tuple has min > max", () => {
        const result = resolveQuotaTargets({ wipes: [5, 2] });
        expect(result.wipes).toEqual(DEFAULT_QUOTA_TARGETS.wipes);
      });

      it("global valid, per-deck min>max invalid: falls back to global", () => {
        const result = resolveQuotaTargets({ interaction: [7, 9] }, { interaction: [10, 1] });
        expect(result.interaction).toEqual([7, 9]);
      });
    });
  });

  it("setCardTags replaces a card's tags, and an empty array clears them", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    await addCards("Selesnya Value", [{ name: "Sol Ring", tags: ["ramp"] }], resolver, decksDir);

    let deck = await setCardTags(
      "Selesnya Value",
      [{ name: "Sol Ring", tags: ["ramp", "combo piece"] }],
      decksDir
    );
    expect(deck.cards.find((c) => c.name === "Sol Ring")?.tags).toEqual(["ramp", "combo piece"]);

    deck = await setCardTags("Selesnya Value", [{ name: "Sol Ring", tags: [] }], decksDir);
    expect(deck.cards.find((c) => c.name === "Sol Ring")?.tags).toEqual([]);
  });

  it("renameTag renames a tag on every card carrying it and dedupes if the target already exists", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    await addCards(
      "Selesnya Value",
      [
        { name: "Sol Ring", tags: ["ramp"] },
        { name: "Elvish Visionary", tags: ["ramp", "draw"] },
      ],
      resolver,
      decksDir
    );

    const deck = await renameTag("Selesnya Value", "ramp", "draw", decksDir);
    expect(deck.cards.find((c) => c.name === "Sol Ring")?.tags).toEqual(["draw"]);
    expect(deck.cards.find((c) => c.name === "Elvish Visionary")?.tags).toEqual(["draw"]);
  });

  describe("removeTag", () => {
    it("removes an exact-match tag from every card carrying it, leaving other tags intact", async () => {
      await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
      await addCards(
        "Selesnya Value",
        [
          { name: "Sol Ring", tags: ["ramp"] },
          { name: "Elvish Visionary", tags: ["ramp", "draw"] },
        ],
        resolver,
        decksDir
      );

      const result = await removeTag("Selesnya Value", "ramp", decksDir);
      expect(result.affected).toBe(2);
      expect(result.deck.cards.find((c) => c.name === "Sol Ring")?.tags).toEqual([]);
      expect(result.deck.cards.find((c) => c.name === "Elvish Visionary")?.tags).toEqual(["draw"]);
    });

    it("affected is 0 when the tag is absent from every card", async () => {
      await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
      await addCards("Selesnya Value", [{ name: "Sol Ring", tags: ["ramp"] }], resolver, decksDir);

      const result = await removeTag("Selesnya Value", "nonexistent-tag", decksDir);
      expect(result.affected).toBe(0);
      expect(result.deck.cards.find((c) => c.name === "Sol Ring")?.tags).toEqual(["ramp"]);
    });
  });

  describe("setCardCount", () => {
    it("sets count on a basic land to a value > 1", async () => {
      await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
      await addCards("Selesnya Value", [{ name: "Forest", count: 1 }], resolver, decksDir);

      const result = await setCardCount("Selesnya Value", "Forest", 5, resolver, decksDir);
      expect(result.rejected).toBeNull();
      expect(result.updated).toEqual({ name: "Forest", count: 5 });
      expect(result.deck.cards.find((c) => c.name === "Forest")?.count).toBe(5);
    });

    it("rejects count > 1 for a non-basic-land card", async () => {
      await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
      await addCards("Selesnya Value", [{ name: "Sol Ring" }], resolver, decksDir);

      const result = await setCardCount("Selesnya Value", "Sol Ring", 2, resolver, decksDir);
      expect(result.updated).toBeNull();
      expect(result.rejected).toEqual({ name: "Sol Ring", reason: "Count > 1 only allowed for Basic Land" });
      expect(result.deck.cards.find((c) => c.name === "Sol Ring")?.count).toBe(1);
    });

    it("allows setting count = 1 on a non-basic-land card", async () => {
      await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
      await addCards("Selesnya Value", [{ name: "Sol Ring" }], resolver, decksDir);

      const result = await setCardCount("Selesnya Value", "Sol Ring", 1, resolver, decksDir);
      expect(result.rejected).toBeNull();
      expect(result.updated).toEqual({ name: "Sol Ring", count: 1 });
    });

    it("rejects a card not in the deck", async () => {
      await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);

      const result = await setCardCount("Selesnya Value", "Sol Ring", 1, resolver, decksDir);
      expect(result.updated).toBeNull();
      expect(result.rejected).toEqual({ name: "Sol Ring", reason: "Card not in deck" });
    });

    it("rejects count < 1", async () => {
      await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
      await addCards("Selesnya Value", [{ name: "Forest" }], resolver, decksDir);

      const result = await setCardCount("Selesnya Value", "Forest", 0, resolver, decksDir);
      expect(result.updated).toBeNull();
      expect(result.rejected).toEqual({ name: "Forest", reason: "Count must be an integer >= 1" });
    });
  });

  it("reports total/targetTotal/overUnder against the 99-card EDH target", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    await addCards(
      "Selesnya Value",
      [{ name: "Forest", role: "land", count: 99 }],
      resolver,
      decksDir
    );

    const report = await deckReport("Selesnya Value", resolver, decksDir);
    expect(report.total).toBe(99);
    expect(report.targetTotal).toBe(99);
    expect(report.overUnder).toBe(0);
  });

  it("renameDeck renames the file and name field", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    const renamed = await renameDeck("Selesnya Value", "Selesnya Tokens", decksDir);
    expect(renamed.name).toBe("Selesnya Tokens");

    const oldFetch = await getDeck("Selesnya Value", decksDir);
    expect(oldFetch).toBeNull();

    const newFetch = await getDeck("Selesnya Tokens", decksDir);
    expect(newFetch?.name).toBe("Selesnya Tokens");
    expect(newFetch?.commander).toBe("Trostani, Selesnya's Voice");
  });

  it("renameDeck rejects a collision and leaves the target deck untouched", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    await createDeck("Gruul Aggro", "Hallar, the Firefletcher", resolver, decksDir);
    await addCards("Gruul Aggro", [{ name: "Grizzly Bears", tags: ["beater"] }], resolver, decksDir);

    await expect(renameDeck("Selesnya Value", "Gruul Aggro", decksDir)).rejects.toThrow();

    const target = await getDeck("Gruul Aggro", decksDir);
    expect(target?.commander).toBe("Hallar, the Firefletcher");
    expect(target?.cards.some((c) => c.name === "Grizzly Bears")).toBe(true);

    const original = await getDeck("Selesnya Value", decksDir);
    expect(original?.name).toBe("Selesnya Value");
  });

  it("renameDeck allows a pure display-name change on the same sanitized slug", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    await addCards("Selesnya Value", [{ name: "Sol Ring", tags: ["ramp"] }], resolver, decksDir);

    const renamed = await renameDeck("Selesnya Value", "selesnya value", decksDir);
    expect(renamed.name).toBe("selesnya value");
    expect(renamed.cards.some((c) => c.name === "Sol Ring")).toBe(true);

    const fetched = await getDeck("selesnya value", decksDir);
    expect(fetched?.cards.some((c) => c.name === "Sol Ring")).toBe(true);
  });

  it("setCommander to a narrower identity flags off-identity cards in nowIllegal without removing them", async () => {
    await createDeck("Gruul Aggro", "Hallar, the Firefletcher", resolver, decksDir);
    await addCards(
      "Gruul Aggro",
      [{ name: "Grizzly Bears", tags: ["beater"] }],
      resolver,
      decksDir
    );

    const result = await setCommander("Gruul Aggro", "Krenko, Mob Boss", resolver, decksDir);
    expect(result.changed).toBe(true);
    expect(result.deck.commander).toBe("Krenko, Mob Boss");
    expect(result.deck.commanderIdentity).toEqual(["R"]);
    // Grizzly Bears is G; new commander identity is R only -> flagged illegal.
    expect(result.nowIllegal.some((c) => c.name === "Grizzly Bears")).toBe(true);

    const deck = await getDeck("Gruul Aggro", decksDir);
    expect(deck?.cards.some((c) => c.name === "Grizzly Bears")).toBe(true);
  });

  it("setCommander to the same commander is a no-op for changed/nowIllegal", async () => {
    await createDeck("Gruul Aggro", "Hallar, the Firefletcher", resolver, decksDir);
    await addCards(
      "Gruul Aggro",
      [{ name: "Grizzly Bears", tags: ["beater"] }],
      resolver,
      decksDir
    );

    const result = await setCommander("Gruul Aggro", "Hallar, the Firefletcher", resolver, decksDir);
    expect(result.changed).toBe(false);
    expect(result.nowIllegal).toEqual([]);
  });

  it("setCommander rejects an illegal (non-legendary/non-commander) card", async () => {
    await createDeck("Gruul Aggro", "Hallar, the Firefletcher", resolver, decksDir);
    await expect(
      setCommander("Gruul Aggro", "Grizzly Bears", resolver, decksDir)
    ).rejects.toThrow();
  });

  it("setCardTagsResult accepts an existing card update and rejects a non-existent one", async () => {
    await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
    await addCards("Selesnya Value", [{ name: "Sol Ring", tags: ["ramp"] }], resolver, decksDir);

    const result = await setCardTagsResult(
      "Selesnya Value",
      [
        { name: "Sol Ring", tags: ["ramp", "combo piece"] },
        { name: "Not A Card In Deck", tags: ["draw"] },
      ],
      decksDir
    );

    expect(result.updated).toEqual([{ name: "Sol Ring", tags: ["ramp", "combo piece"] }]);
    expect(result.rejected).toEqual([{ name: "Not A Card In Deck", reason: "Card not in deck" }]);
    expect(result.deck.cards.find((c) => c.name === "Sol Ring")?.tags).toEqual(["ramp", "combo piece"]);
  });

  describe("deckSummary", () => {
    it("matches deckReport's quotaCheck and derives total/remaining/untaggedForQuota", async () => {
      await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
      await addCards(
        "Selesnya Value",
        [
          { name: "Forest", role: "land", count: 36 },
          { name: "Sol Ring", role: "ramp" },
          { name: "Elvish Visionary", tags: ["combo piece"] },
        ],
        resolver,
        decksDir
      );

      const report = await deckReport("Selesnya Value", resolver, decksDir);
      const summary = await deckSummary("Selesnya Value", resolver, decksDir);

      expect(summary.quotaCheck).toEqual(report.quotaCheck);
      expect(summary.total).toBe(report.total);
      expect(summary.untaggedForQuota).toBe(report.untaggedForQuota);
      expect(summary.untaggedForQuota).toBe(1);
      expect(summary.remaining).toBe(100 - summary.total);
    });
  });

  describe("arenaCheck", () => {
    it("deckReport computes onArena (copy-counted), missing, and unknown from resolver.arena", async () => {
      await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
      await addCards(
        "Selesnya Value",
        [
          { name: "Forest", role: "land", count: 36 }, // arena: true, copies count fully
          { name: "Sol Ring", role: "ramp" }, // arena: true
          { name: "Elvish Visionary", tags: ["combo piece"] }, // arena: false -> missing
          { name: "Grizzly Bears", tags: ["beater"] }, // arena: undefined -> unknown
        ],
        resolver,
        decksDir
      );

      const report = await deckReport("Selesnya Value", resolver, decksDir);

      // Trostani (commander) is not part of deck.cards, so onArena only reflects
      // Forest (36) + Sol Ring (1) = 37.
      expect(report.arenaCheck.onArena).toBe(37);
      expect(report.arenaCheck.total).toBe(report.total);
      expect(report.arenaCheck.missing).toEqual(["Elvish Visionary"]);
      expect(report.arenaCheck.unknown).toEqual(["Grizzly Bears"]);
    });

    it("treats an unresolved card name as unknown", async () => {
      await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
      await addCards(
        "Selesnya Value",
        [{ name: "Sol Ring", tags: ["ramp"] }],
        resolver,
        decksDir
      );

      // Manually inject a card the resolver can't find (simulating a stale/unknown name).
      const filePath = path.join(decksDir, "selesnya-value.json");
      const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
      raw.cards.push({ name: "Not A Real Card", count: 1 });
      await fs.writeFile(filePath, JSON.stringify(raw, null, 2), "utf8");

      const report = await deckReport("Selesnya Value", resolver, decksDir);
      expect(report.arenaCheck.onArena).toBe(1); // Sol Ring only
      expect(report.arenaCheck.unknown).toEqual(["Not A Real Card"]);
      expect(report.arenaCheck.missing).toEqual([]);
    });

    it("deckSummary passes arenaCheck through from deckReport", async () => {
      await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
      await addCards(
        "Selesnya Value",
        [
          { name: "Sol Ring", role: "ramp" },
          { name: "Elvish Visionary", tags: ["combo piece"] },
          { name: "Grizzly Bears", tags: ["beater"] },
        ],
        resolver,
        decksDir
      );

      const report = await deckReport("Selesnya Value", resolver, decksDir);
      const summary = await deckSummary("Selesnya Value", resolver, decksDir);

      expect(summary.arenaCheck).toEqual(report.arenaCheck);
    });
  });

  describe("exportDeck", () => {
    async function makeDfcDeck(): Promise<void> {
      await createDeck(
        "Kefka Chaos",
        "Kefka, Court Mage // Kefka, Ruler of Ruin",
        resolver,
        decksDir
      );
      await addCards(
        "Kefka Chaos",
        [
          { name: "Fable of the Mirror-Breaker // Reflection of Kiki-Jiki", tags: ["value"] },
          { name: "Sol Ring", tags: ["ramp"] },
        ],
        resolver,
        decksDir
      );
    }

    it("mtga export uses front-face-only names and strips all ' // ' separators", async () => {
      await makeDfcDeck();
      const out = await exportDeck("Kefka Chaos", "mtga", decksDir);

      const lines = out.split("\n");
      expect(lines[1]).toBe("1 Kefka, Court Mage");
      expect(out).toContain("1 Fable of the Mirror-Breaker");
      expect(out).not.toContain(" // ");
    });

    it("moxfield export keeps full DFC names", async () => {
      await makeDfcDeck();
      const out = await exportDeck("Kefka Chaos", "moxfield", decksDir);

      expect(out).toContain("Kefka, Court Mage // Kefka, Ruler of Ruin");
      expect(out).toContain("Fable of the Mirror-Breaker // Reflection of Kiki-Jiki");
    });

    it("plain export keeps full DFC names", async () => {
      await makeDfcDeck();
      const out = await exportDeck("Kefka Chaos", "plain", decksDir);

      expect(out).toContain("Kefka, Court Mage // Kefka, Ruler of Ruin");
      expect(out).toContain("Fable of the Mirror-Breaker // Reflection of Kiki-Jiki");
    });

    it("round-trips mtga export through parseDecklist with front-face names and no unparsed lines", async () => {
      await makeDfcDeck();
      const out = await exportDeck("Kefka Chaos", "mtga", decksDir);

      const result = parseDecklist(out);
      expect(result.unparsed).toEqual([]);

      const names = result.entries.map((e) => e.name);
      expect(names).toContain("Kefka, Court Mage");
      expect(names).toContain("Fable of the Mirror-Breaker");
      expect(names).toContain("Sol Ring");
      expect(names.some((n) => n.includes(" // "))).toBe(false);

      const commanderEntry = result.entries.find((e) => e.name === "Kefka, Court Mage");
      expect(commanderEntry?.commander).toBe(true);
    });
  });
});
