import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDeck, addCards, exportDeck, type CardResolver, type ResolvedCard } from "../src/decks.js";
import { parseDecklist } from "../src/import.js";

const FIXTURES: Record<string, ResolvedCard> = {
  "trostani, selesnya's voice": {
    name: "Trostani, Selesnya's Voice",
    colorIdentity: ["G", "W"],
    cmc: 5,
    typeLine: "Legendary Creature — Dryad Avatar",
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
  forest: {
    name: "Forest",
    colorIdentity: [],
    cmc: 0,
    typeLine: "Basic Land — Forest",
    legalCommander: true,
  },
};

const resolver: CardResolver = async (name: string) => {
  const found = FIXTURES[name.toLowerCase()];
  return found ?? null;
};

let decksDir: string;

beforeEach(async () => {
  decksDir = await fs.mkdtemp(path.join(os.tmpdir(), "scrychat-export-"));
});

afterEach(async () => {
  await fs.rm(decksDir, { recursive: true, force: true });
});

async function buildDeck() {
  await createDeck("Selesnya Value", "Trostani, Selesnya's Voice", resolver, decksDir);
  await addCards(
    "Selesnya Value",
    [
      { name: "Elvish Visionary", role: "draw" },
      { name: "Swords to Plowshares", role: "interaction" },
      { name: "Forest", role: "land", count: 16 },
    ],
    resolver,
    decksDir
  );
}

describe("exportDeck", () => {
  it.each(["plain", "mtga", "moxfield"] as const)(
    "round-trips through parseDecklist for format=%s",
    async (format) => {
      await buildDeck();
      const output = await exportDeck("Selesnya Value", format, decksDir);
      const { entries } = parseDecklist(output);

      const commanderEntries = entries.filter((e) => e.commander);
      expect(commanderEntries.length).toBe(1);
      expect(commanderEntries[0].name).toBe("Trostani, Selesnya's Voice");

      const nonCommander = entries.filter((e) => !e.commander);
      const countsByName = new Map(nonCommander.map((e) => [e.name, e.count]));
      expect(countsByName.get("Elvish Visionary")).toBe(1);
      expect(countsByName.get("Swords to Plowshares")).toBe(1);
      expect(countsByName.get("Forest")).toBe(16);
      expect(nonCommander.length).toBe(3);
    }
  );

  it("plain format ends commander line with *CMDR* and includes the literal 16 Forest line", async () => {
    await buildDeck();
    const output = await exportDeck("Selesnya Value", "plain", decksDir);
    const lines = output.split("\n");
    expect(lines[0]).toBe("1 Trostani, Selesnya's Voice *CMDR*");
    expect(lines[1]).toBe("");
    expect(lines).toContain("16 Forest");
  });

  it("mtga format uses Commander/Deck section headers and no *CMDR* marker", async () => {
    await buildDeck();
    const output = await exportDeck("Selesnya Value", "mtga", decksDir);
    expect(output.startsWith("Commander\n1 Trostani, Selesnya's Voice\n\nDeck\n")).toBe(true);
    expect(output.split("\n")).toContain("16 Forest");
    expect(output).not.toContain("*CMDR*");
  });

  it("moxfield format has commander *CMDR* line immediately followed by card lines, no section headers", async () => {
    await buildDeck();
    const output = await exportDeck("Selesnya Value", "moxfield", decksDir);
    const lines = output.split("\n");
    expect(lines[0]).toBe("1 Trostani, Selesnya's Voice *CMDR*");
    expect(lines[1]).not.toBe("");
    expect(lines).not.toContain("Deck");
    expect(lines).not.toContain("Commander");
  });

  it("mtga, moxfield, and plain formats are pairwise distinct", async () => {
    await buildDeck();
    const mtga = await exportDeck("Selesnya Value", "mtga", decksDir);
    const moxfield = await exportDeck("Selesnya Value", "moxfield", decksDir);
    const plain = await exportDeck("Selesnya Value", "plain", decksDir);
    expect(mtga).not.toBe(moxfield);
    expect(moxfield).not.toBe(plain);
    expect(plain).not.toBe(mtga);
  });

  it("defaults to mtga format when no format is given", async () => {
    await buildDeck();
    const defaulted = await exportDeck("Selesnya Value", undefined, decksDir);
    const explicitMtga = await exportDeck("Selesnya Value", "mtga", decksDir);
    expect(defaulted).toStrictEqual(explicitMtga);
  });

  it("throws for a missing deck", async () => {
    await expect(exportDeck("Nonexistent Deck", "plain", decksDir)).rejects.toThrow(/Deck not found/);
  });
});
