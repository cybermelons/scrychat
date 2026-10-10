import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  addSuggestions,
  listSuggestions,
  decideSuggestion,
  clearDecided,
} from "../src/suggestions.js";

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "scrychat-sug-"));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("suggestions", () => {
  it("returns empty for a deck with no suggestions file", async () => {
    expect(await listSuggestions("nothing-here", dir)).toEqual([]);
  });

  it("appends proposals as pending with sequential ids", async () => {
    await addSuggestions("Isshin Budget", [
      { kind: "add", in: "Bastion of Remembrance", role: "drain", why: "more reach" },
    ], dir);
    const all = await addSuggestions("Isshin Budget", [
      { kind: "cut", out: "Rogue's Passage", why: "colorless hurts the mana base" },
    ], dir);

    expect(all.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(all.every((s) => s.status === "pending")).toBe(true);
    expect(all[0].in).toBe("Bastion of Remembrance");
    expect(all[1].out).toBe("Rogue's Passage");
  });

  it("slugifies the deck name so lookup matches the deck slug", async () => {
    await addSuggestions("Isshin Budget", [
      { kind: "add", in: "Sol Ring", why: "ramp" },
    ], dir);
    // Same deck, different casing/spacing resolves to the same file.
    expect(await listSuggestions("isshin-budget", dir)).toHaveLength(1);
    expect(fs.existsSync(path.join(dir, "isshin-budget.json"))).toBe(true);
  });

  it("rejects proposals missing the cards their kind requires", async () => {
    await expect(addSuggestions("d", [{ kind: "add", why: "x" }], dir)).rejects.toThrow(/requires 'in'/);
    await expect(addSuggestions("d", [{ kind: "cut", why: "x" }], dir)).rejects.toThrow(/requires 'out'/);
    await expect(
      addSuggestions("d", [{ kind: "swap", in: "A", why: "x" }], dir)
    ).rejects.toThrow(/requires 'out'/);
  });

  it("requires a why, because the reasoning is what a human reviews", async () => {
    await expect(
      addSuggestions("d", [{ kind: "add", in: "Sol Ring", why: "  " }], dir)
    ).rejects.toThrow(/non-empty 'why'/);
  });

  it("records a verdict with a timestamp and optional note", async () => {
    await addSuggestions("d", [{ kind: "add", in: "Sol Ring", why: "ramp" }], dir);
    const decided = await decideSuggestion("d", "s1", "rejected", "already have enough", dir);

    expect(decided.status).toBe("rejected");
    expect(decided.decidedAt).toBeTruthy();
    expect(decided.note).toBe("already have enough");
    // Persisted, not just returned.
    expect((await listSuggestions("d", dir))[0].status).toBe("rejected");
  });

  it("refuses to decide the same suggestion twice", async () => {
    await addSuggestions("d", [{ kind: "add", in: "Sol Ring", why: "ramp" }], dir);
    await decideSuggestion("d", "s1", "accepted", undefined, dir);
    await expect(decideSuggestion("d", "s1", "rejected", undefined, dir)).rejects.toThrow(
      /already accepted/
    );
  });

  it("errors on an unknown id", async () => {
    await expect(decideSuggestion("d", "s99", "accepted", undefined, dir)).rejects.toThrow(
      /no suggestion "s99"/
    );
  });

  it("does not reuse an id after decided ones are cleared", async () => {
    await addSuggestions("d", [{ kind: "add", in: "A", why: "w" }], dir);
    await addSuggestions("d", [{ kind: "add", in: "B", why: "w" }], dir);
    await decideSuggestion("d", "s1", "accepted", undefined, dir);

    expect(await clearDecided("d", dir)).toBe(1);
    const after = await addSuggestions("d", [{ kind: "add", in: "C", why: "w" }], dir);
    // s1 was cleared but must not be handed out again: s2 still exists.
    expect(after.map((s) => s.id)).toEqual(["s2", "s3"]);
  });
});
