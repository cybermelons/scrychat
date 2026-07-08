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
  setCardTags,
  renameTag,
  type CardResolver,
  type ResolvedCard,
} from "../src/decks.js";

const FIXTURES: Record<string, ResolvedCard> = {
  "trostani, selesnya's voice": {
    name: "Trostani, Selesnya's Voice",
    colorIdentity: ["G", "W"],
    cmc: 5,
    typeLine: "Legendary Creature — Dryad Avatar",
    legalCommander: true,
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
  },
  forest: {
    name: "Forest",
    colorIdentity: [],
    cmc: 0,
    typeLine: "Basic Land — Forest",
    legalCommander: true,
  },
  "elvish visionary": {
    name: "Elvish Visionary",
    colorIdentity: ["G"],
    cmc: 2,
    typeLine: "Creature — Elf Shaman",
    legalCommander: true,
  },
  "swords to plowshares": {
    name: "Swords to Plowshares",
    colorIdentity: ["W"],
    cmc: 1,
    typeLine: "Instant",
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
});
