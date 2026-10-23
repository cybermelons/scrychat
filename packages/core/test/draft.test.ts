import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createDeck, createDraftDeck, saveDraft, discardDraft, getDeck, listDecks, addCards, type CardResolver } from "../src/decks.js";

const resolver: CardResolver = async (name) => ({
  name, colorIdentity: ["R"], cmc: 1, typeLine: "Instant", legalCommander: true,
});
const cmdr: CardResolver = async (name) => ({
  name, colorIdentity: ["G"], cmc: 3, typeLine: "Legendary Creature", legalCommander: true,
});

let dir: string;
beforeEach(async () => { dir = await fs.mkdtemp(path.join(os.tmpdir(), "scrychat-draft-")); });
afterEach(async () => { await fs.rm(dir, { recursive: true, force: true }); });

describe("draft decks", () => {
  it("creates a flagged empty draft with a generated name", async () => {
    const d = await createDraftDeck(dir);
    expect(d.draft).toBe(true);
    expect(d.name).toMatch(/^untitled-[0-9a-f]+$/);
    expect(d.commander).toBe("");
    expect((await getDeck(d.name, dir))?.draft).toBe(true);
  });

  it("accepts any-colour cards while no commander is set", async () => {
    const d = await createDraftDeck(dir);
    const r = await addCards(d.name, [{ name: "Lightning Bolt" }], resolver, dir);
    expect(r.added).toHaveLength(1);
    expect(r.rejected).toHaveLength(0);
  });

  it("save renames, keeps cards, clears the flag, removes the old file", async () => {
    const d = await createDraftDeck(dir);
    await addCards(d.name, [{ name: "Lightning Bolt" }], resolver, dir);
    const saved = await saveDraft(d.name, "Burn Pile", dir);
    expect(saved.name).toBe("Burn Pile");
    expect(saved.draft).toBeUndefined();
    const onDisk = await getDeck("Burn Pile", dir);
    expect(onDisk?.draft).toBeUndefined();
    expect(onDisk?.cards).toHaveLength(1);
    expect(await getDeck(d.name, dir)).toBeNull();
    expect((await listDecks(dir)).map((x) => x.name)).toEqual(["Burn Pile"]);
  });

  it("save refuses a name collision and an invalid name, leaving the draft intact", async () => {
    await createDeck("Taken", "Some Commander", cmdr, dir);
    const d = await createDraftDeck(dir);
    await expect(saveDraft(d.name, "taken", dir)).rejects.toThrow(/already exists/);
    await expect(saveDraft(d.name, "   ", dir)).rejects.toThrow(/Invalid deck name/);
    expect((await getDeck(d.name, dir))?.draft).toBe(true);
  });

  it("save refuses a non-draft", async () => {
    await createDeck("Real", "Some Commander", cmdr, dir);
    await expect(saveDraft("Real", "Other", dir)).rejects.toThrow(/Not a draft/);
  });

  it("discard deletes a draft only", async () => {
    await createDeck("Real", "Some Commander", cmdr, dir);
    await expect(discardDraft("Real", dir)).rejects.toThrow(/Not a draft/);
    expect(await getDeck("Real", dir)).not.toBeNull();
    const d = await createDraftDeck(dir);
    await discardDraft(d.name, dir);
    expect(await getDeck(d.name, dir)).toBeNull();
    await expect(discardDraft(d.name, dir)).rejects.toThrow(/not found/i);
  });
});
