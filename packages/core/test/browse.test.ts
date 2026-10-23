import { describe, it, expect, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "../src/db/connection.js";
import { listCommanders, parseDeckList, parsePreconDeck, getPrecons, __resetPreconCacheForTests, matchesFilter } from "../src/browse.js";

const tmp: string[] = [];
afterEach(() => {
  __resetPreconCacheForTests();
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function fixtureDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "browse-"));
  tmp.push(dir);
  const db = openDb({ path: path.join(dir, "t.db") });
  const ins = db.prepare(
    "INSERT INTO cards (oracle_id,name,type_line,color_identity,ci_mask,is_commander,legal_commander,image,edhrec_rank) VALUES (?,?,?,?,?,?,?,?,?)"
  );
  ins.run("1", "Zur the Enchanter", "Legendary Creature", '["U","W","B"]', 7, 1, 1, "z.jpg", 1);
  ins.run("2", "Atraxa, Praetors' Voice", "Legendary Creature", '["W","U","B","G"]', 23, 1, 1, "a.jpg", 99999);
  ins.run("3", "Karn_Liberated 100%", "Legendary Creature", "[]", 0, 1, 1, null, null);
  ins.run("4", "Banned Guy", "Legendary Creature", '["R"]', 8, 1, 0, null, null);
  ins.run("5", "Sol Ring", "Artifact", "[]", 0, 0, 1, null, null);
  return db;
}

describe("listCommanders", () => {
  it("is alphabetical (not by rank), legal commanders only", () => {
    const r = listCommanders({}, fixtureDb());
    expect(r.ok && r.commanders.map((c) => c.name)).toEqual(["Atraxa, Praetors' Voice", "Karn_Liberated 100%", "Zur the Enchanter"]);
    expect(r.ok && r.total).toBe(3);
    expect(r.ok && r.commanders[0].colorIdentity).toEqual(["W", "U", "B", "G"]);
  });
  it("filters by text (LIKE wildcards literal) and colors", () => {
    const db = fixtureDb();
    expect(listCommanders({ q: "100%" }, db)).toMatchObject({ total: 1 });
    expect(listCommanders({ q: "%" }, db)).toMatchObject({ total: 1 });
    const w = listCommanders({ colors: "WU" }, db);
    expect(w.ok && w.commanders.map((c) => c.name)).toEqual(["Atraxa, Praetors' Voice", "Zur the Enchanter"]);
    expect(listCommanders({ colors: "C" }, db)).toMatchObject({ total: 1 });
  });
  it("pages", () => {
    const r = listCommanders({ limit: 1, offset: 1 }, fixtureDb());
    expect(r.ok && r.commanders.map((c) => c.name)).toEqual(["Karn_Liberated 100%"]);
    expect(r.ok && r.total).toBe(3);
  });
  it("returns an explicit error when the mirror is absent", () => {
    const r = listCommanders({}, null);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/ingest/);
  });
});

const LIST = {
  data: [
    { code: "AAA", fileName: "Old_AAA", name: "Old", releaseDate: "2020-01-01", type: "Commander Deck" },
    { code: "BBB", fileName: "New_BBB", name: "New", releaseDate: "2024-01-01", type: "Commander Deck" },
    { code: "CCC", fileName: "Jump_CCC", name: "Jump", releaseDate: "2024-01-01", type: "Jumpstart" },
  ],
};
const DECK = {
  data: {
    commander: [{ name: "Zur", colorIdentity: ["U"], identifiers: { scryfallId: "ab123" } }],
    mainBoard: [{ name: "Island", count: 30 }, { name: "Sol Ring" }],
  },
};

describe("precon parsing", () => {
  it("keeps Commander types, newest first", () => {
    expect(parseDeckList(LIST).map((d) => d.fileName)).toEqual(["New_BBB", "Old_AAA"]);
    expect(() => parseDeckList({})).toThrow(/unexpected shape/);
  });
  it("parses a deck file", () => {
    const p = parsePreconDeck(parseDeckList(LIST)[0], DECK);
    expect(p.commanders[0]).toEqual({ name: "Zur", colorIdentity: ["U"], image: "https://cards.scryfall.io/normal/front/a/b/ab123.jpg" });
    expect(p.cards).toEqual([{ name: "Island", count: 30 }, { name: "Sol Ring", count: 1 }]);
    expect(() => parsePreconDeck(parseDeckList(LIST)[0], { data: {} })).toThrow();
  });
  it("getPrecons fetches index + decks once and caches", async () => {
    const urls: string[] = [];
    const f = async (u: string) => (urls.push(u), { ok: true, status: 200, json: async () => (u.endsWith("DeckList.json") ? LIST : DECK) });
    const a = await getPrecons(f);
    await getPrecons(f);
    expect(a).toHaveLength(2);
    expect(urls).toHaveLength(3);
  });
  it("a failed load is retried", async () => {
    await expect(getPrecons(async () => ({ ok: false, status: 503, json: async () => ({}) }))).rejects.toThrow(/503/);
    await new Promise((r) => setTimeout(r));
    const ok = await getPrecons(async (u) => ({ ok: true, status: 200, json: async () => (u.endsWith("DeckList.json") ? LIST : DECK) }));
    expect(ok).toHaveLength(2);
  });
});

describe("matchesFilter", () => {
  it("text and contains-all colors", () => {
    expect(matchesFilter("Zur", ["U", "W"], "zu", "W")).toBe(true);
    expect(matchesFilter("Zur", ["U"], "", "WU")).toBe(false);
    expect(matchesFilter("Zur", [], "", "C")).toBe(true);
  });
});
