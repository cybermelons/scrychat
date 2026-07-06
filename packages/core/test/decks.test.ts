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

  it("produces a report with byRole, curve, and quotaCheck", async () => {
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
    expect(report.byRole.land).toBe(36);
    expect(report.byRole.ramp).toBe(1);
    expect(report.byRole.draw).toBe(1);
    expect(report.curve["1"]).toBe(1); // Sol Ring cmc 1
    expect(report.curve["2"]).toBe(1); // Elvish Visionary cmc 2
    expect(report.quotaCheck.lands.have).toBe(36);
    expect(report.quotaCheck.lands.ok).toBe(true);
    expect(report.quotaCheck.ramp.ok).toBe(false);
    expect(report.identityViolations).toEqual([]);
  });
});
