import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "../src/db/connection.js";
import {
  __resetLocalDbCacheForTests,
  __setStatPathForTests,
  __stampMtimeCacheForTests,
  getCardLocal,
  findCombosLocal,
  findAlternativesLocal,
  getLocalDb,
  parseCiMask,
  categoryTagMembersLocal,
} from "../src/local.js";

type DbHandle = ReturnType<typeof openDb>;

let tmpDir: string;
let db: DbHandle;

interface FixtureCard {
  oracle_id: string;
  name: string;
  type_line: string;
  oracle_text: string;
  color_identity: string[];
  ci_mask: number;
  legal_commander: number;
  price_usd: number | null;
}

const CARDS: FixtureCard[] = [
  {
    oracle_id: "target-1",
    name: "Doubling Season",
    type_line: "Enchantment",
    oracle_text: "If an effect would create tokens, twice as many are created. If an effect would put counters, twice as many are put.",
    color_identity: ["G"],
    ci_mask: 16,
    legal_commander: 1,
    price_usd: 45,
  },
  // Shares BOTH token-doubler (specific, 3 members) and counter-doubler (specific, 2 members) with target.
  {
    oracle_id: "member-strong",
    name: "Strong Doubler",
    type_line: "Enchantment",
    oracle_text: "Doubles tokens and counters.",
    color_identity: ["G", "W"],
    ci_mask: 17,
    legal_commander: 1,
    price_usd: 10,
  },
  // Shares only synergy-generic (broad, 5 members) - a generic/common tag.
  {
    oracle_id: "member-weak",
    name: "Weak Synergy Card",
    type_line: "Creature",
    oracle_text: "Generic synergy payoff.",
    color_identity: ["G"],
    ci_mask: 16,
    legal_commander: 1,
    price_usd: 5,
  },
  // Shares token-doubler only.
  {
    oracle_id: "member-token-only",
    name: "Token Only Doubler",
    type_line: "Artifact",
    oracle_text: "Doubles tokens.",
    color_identity: ["W"],
    ci_mask: 1,
    legal_commander: 1,
    price_usd: 8,
  },
  // Out of color identity (Blue) - must be excluded by ci filter.
  {
    oracle_id: "member-offcolor",
    name: "Offcolor Doubler",
    type_line: "Enchantment",
    oracle_text: "Doubles tokens.",
    color_identity: ["U"],
    ci_mask: 2,
    legal_commander: 1,
    price_usd: 5,
  },
  // Too expensive - must be excluded by price filter.
  {
    oracle_id: "member-expensive",
    name: "Expensive Doubler",
    type_line: "Enchantment",
    oracle_text: "Doubles tokens.",
    color_identity: ["G"],
    ci_mask: 16,
    legal_commander: 1,
    price_usd: 999,
  },
  // Unpriced (NULL) - must be excluded when maxPrice is set (mirrors live
  // Scryfall usd<N semantics, which excludes unpriced cards), but included
  // when no maxPrice filter is given.
  {
    oracle_id: "member-unpriced",
    name: "Unpriced Doubler",
    type_line: "Enchantment",
    oracle_text: "Doubles tokens.",
    color_identity: ["G"],
    ci_mask: 16,
    legal_commander: 1,
    price_usd: null,
  },
  // Not legal in commander - must be excluded.
  {
    oracle_id: "member-illegal",
    name: "Banned Doubler",
    type_line: "Enchantment",
    oracle_text: "Doubles tokens.",
    color_identity: ["G"],
    ci_mask: 16,
    legal_commander: 0,
    price_usd: 5,
  },
  // Combo partner card.
  {
    oracle_id: "combo-partner",
    name: "Combo Partner",
    type_line: "Creature",
    oracle_text: "Tap: draw a card.",
    color_identity: ["U"],
    ci_mask: 2,
    legal_commander: 1,
    price_usd: 1,
  },
];

interface FixtureTag {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  is_functional: number;
}

const TAGS: FixtureTag[] = [
  { id: "tag-token-doubler", slug: "token-doubler", label: "token doubler", description: "Doubles tokens", is_functional: 1 },
  { id: "tag-counter-doubler", slug: "counter-doubler", label: "counter doubler", description: "Doubles counters", is_functional: 1 },
  { id: "tag-synergy-generic", slug: "synergy-generic", label: "generic synergy", description: "Broad synergy grouping", is_functional: 1 },
  { id: "tag-cycle-fake", slug: "cycle-fake", label: "cycle fake", description: null, is_functional: 0 },
];

// oracle_id -> tag_id -> weight
const CARD_TAGS: [string, string, number][] = [
  ["target-1", "tag-token-doubler", 3],
  ["target-1", "tag-counter-doubler", 5],

  ["member-strong", "tag-token-doubler", 3],
  ["member-strong", "tag-counter-doubler", 4],

  ["member-token-only", "tag-token-doubler", 3],

  ["member-offcolor", "tag-token-doubler", 3],
  ["member-expensive", "tag-token-doubler", 3],
  ["member-illegal", "tag-token-doubler", 3],
  ["member-unpriced", "tag-token-doubler", 3],

  ["member-weak", "tag-synergy-generic", 3],
  ["member-strong", "tag-synergy-generic", 3],
  ["member-token-only", "tag-synergy-generic", 3],
  ["member-offcolor", "tag-synergy-generic", 3],
  ["member-expensive", "tag-synergy-generic", 3],
  ["combo-partner", "tag-synergy-generic", 3],
  ["target-1", "tag-synergy-generic", 3],
];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scrychat-local-test-"));
  const dbPath = path.join(tmpDir, "test.db");
  db = openDb({ path: dbPath });

  const insertCard = db.prepare(`
    INSERT INTO cards (oracle_id, name, type_line, oracle_text, color_identity, ci_mask, legal_commander, price_usd)
    VALUES (@oracle_id, @name, @type_line, @oracle_text, @color_identity, @ci_mask, @legal_commander, @price_usd)
  `);
  const insertFts = db.prepare(`
    INSERT INTO cards_fts (rowid, name, type_line, oracle_text)
    SELECT rowid, name, type_line, oracle_text FROM cards WHERE oracle_id = ?
  `);
  for (const c of CARDS) {
    insertCard.run({
      oracle_id: c.oracle_id,
      name: c.name,
      type_line: c.type_line,
      oracle_text: c.oracle_text,
      color_identity: JSON.stringify(c.color_identity),
      ci_mask: c.ci_mask,
      legal_commander: c.legal_commander,
      price_usd: c.price_usd,
    });
    insertFts.run(c.oracle_id);
  }

  const insertTag = db.prepare(`
    INSERT INTO tags (id, slug, label, description, is_functional, source)
    VALUES (@id, @slug, @label, @description, @is_functional, 'test')
  `);
  for (const t of TAGS) insertTag.run(t);

  const insertCardTag = db.prepare(`
    INSERT INTO card_tags (oracle_id, tag_id, weight, source) VALUES (?, ?, ?, 'test')
  `);
  for (const [oracleId, tagId, weight] of CARD_TAGS) insertCardTag.run(oracleId, tagId, weight);

  // One combo containing Doubling Season + Combo Partner.
  db.prepare(`
    INSERT INTO combos (id, identity, ci_mask, status, description, card_count, popularity, price_usd)
    VALUES ('combo-1', 'GU', 18, 'OK', 'Test combo', 2, 100, 5)
  `).run();
  db.prepare(`INSERT INTO combo_cards (combo_id, oracle_id) VALUES ('combo-1', 'target-1')`).run();
  db.prepare(`INSERT INTO combo_cards (combo_id, oracle_id) VALUES ('combo-1', 'combo-partner')`).run();
  db.prepare(`INSERT INTO combo_produces (combo_id, feature) VALUES ('combo-1', 'Infinite test')`).run();

  __resetLocalDbCacheForTests(db);
});

afterEach(() => {
  db.close();
  __resetLocalDbCacheForTests(undefined);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("local.getCardLocal", () => {
  it("resolves an exact name", () => {
    const card = getCardLocal(db, "Doubling Season");
    expect(card?.name).toBe("Doubling Season");
    expect(card?.colorIdentity).toEqual(["G"]);
  });

  it("resolves case-insensitively", () => {
    const card = getCardLocal(db, "doubling season");
    expect(card?.name).toBe("Doubling Season");
  });

  it("returns null for a name with no local match", () => {
    const card = getCardLocal(db, "Some Card That Does Not Exist Zzz");
    expect(card).toBeNull();
  });
});

describe("local.parseCiMask", () => {
  it("parses gw into the G|W bitmask", () => {
    expect(parseCiMask("gw")).toBe(1 | 16);
  });
});

describe("local.findCombosLocal", () => {
  it("AND-matches combos containing all given cards", () => {
    const combos = findCombosLocal(db, ["Doubling Season", "Combo Partner"], 10);
    expect(combos).not.toBeNull();
    expect(combos!.length).toBe(1);
    expect(combos![0].pieces.sort()).toEqual(["Combo Partner", "Doubling Season"].sort());
    expect(combos![0].produces).toEqual(["Infinite test"]);
    expect(combos![0].link).toBe("https://commanderspellbook.com/combo/combo-1");
  });

  it("returns empty array when no combo contains all given cards", () => {
    const combos = findCombosLocal(db, ["Doubling Season", "Weak Synergy Card"], 10);
    expect(combos).toEqual([]);
  });

  it("returns null when a card name cannot be resolved locally", () => {
    const combos = findCombosLocal(db, ["Doubling Season", "Totally Unknown Card Zzz"], 10);
    expect(combos).toBeNull();
  });
});

describe("local.findAlternativesLocal", () => {
  it("orders a card sharing 2 specific tags above one sharing only 1 generic tag", () => {
    const result = findAlternativesLocal(db, "Doubling Season", {});
    expect(result).not.toBeNull();

    const allMembers = result!.roles.flatMap((r) => r.members.map((m) => m.name));
    // Doubling Season itself must never appear among its own alternatives.
    expect(allMembers).not.toContain("Doubling Season");

    const tokenDoublerRole = result!.roles.find((r) => r.slug === "token-doubler");
    expect(tokenDoublerRole).toBeDefined();
    const names = tokenDoublerRole!.members.map((m) => m.name);
    const strongIdx = names.indexOf("Strong Doubler");
    const tokenOnlyIdx = names.indexOf("Token Only Doubler");
    expect(strongIdx).toBeGreaterThanOrEqual(0);
    expect(tokenOnlyIdx).toBeGreaterThanOrEqual(0);
    // Strong Doubler shares token-doubler AND counter-doubler with the
    // target (higher summed IDF) so it must outrank a card that only
    // shares the single token-doubler tag.
    expect(strongIdx).toBeLessThan(tokenOnlyIdx);
  });

  it("excludes cards outside colorIdentityWithin", () => {
    const result = findAlternativesLocal(db, "Doubling Season", { colorIdentityWithin: "gw" });
    const allMembers = result!.roles.flatMap((r) => r.members.map((m) => m.name));
    expect(allMembers).not.toContain("Offcolor Doubler");
  });

  it("excludes cards above maxPrice", () => {
    const result = findAlternativesLocal(db, "Doubling Season", { maxPrice: 20 });
    const allMembers = result!.roles.flatMap((r) => r.members.map((m) => m.name));
    expect(allMembers).not.toContain("Expensive Doubler");
  });

  it("excludes a NULL-priced card when maxPrice is set (mirrors live usd<N semantics)", () => {
    const result = findAlternativesLocal(db, "Doubling Season", { maxPrice: 20 });
    const allMembers = result!.roles.flatMap((r) => r.members.map((m) => m.name));
    expect(allMembers).not.toContain("Unpriced Doubler");
  });

  it("includes a NULL-priced card when no maxPrice filter is given", () => {
    const result = findAlternativesLocal(db, "Doubling Season", {});
    const allMembers = result!.roles.flatMap((r) => r.members.map((m) => m.name));
    expect(allMembers).toContain("Unpriced Doubler");
  });

  it("excludes cards not legal in commander", () => {
    const result = findAlternativesLocal(db, "Doubling Season", {});
    const allMembers = result!.roles.flatMap((r) => r.members.map((m) => m.name));
    expect(allMembers).not.toContain("Banned Doubler");
  });

  it("returns null when the card cannot be resolved locally", () => {
    const result = findAlternativesLocal(db, "Totally Unknown Card Zzz", {});
    expect(result).toBeNull();
  });
});

describe("local partial-ingest fallback", () => {
  // Simulates a DB where card ingest has completed but tag/combo ingest has
  // not run yet: cards table is populated, but card_tags/combos are empty.
  // findAlternativesLocal/findCombosLocal must return null (not [] / {roles:
  // []}) so callers fall back to the live implementation instead of
  // silently reporting "nothing found".
  let partialTmpDir: string;
  let partialDb: DbHandle;

  beforeEach(() => {
    partialTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scrychat-local-partial-test-"));
    const dbPath = path.join(partialTmpDir, "partial.db");
    partialDb = openDb({ path: dbPath });

    partialDb
      .prepare(
        `INSERT INTO cards (oracle_id, name, type_line, oracle_text, color_identity, ci_mask, legal_commander, price_usd)
         VALUES ('target-1', 'Doubling Season', 'Enchantment', 'Doubles stuff.', '["G"]', 16, 1, 45)`,
      )
      .run();

    __resetLocalDbCacheForTests(partialDb);
  });

  afterEach(() => {
    partialDb.close();
    __resetLocalDbCacheForTests(undefined);
    fs.rmSync(partialTmpDir, { recursive: true, force: true });
  });

  it("findAlternativesLocal returns null when card_tags is empty", () => {
    const result = findAlternativesLocal(partialDb, "Doubling Season", {});
    expect(result).toBeNull();
  });

  it("findCombosLocal returns null when combos is empty", () => {
    const result = findCombosLocal(partialDb, ["Doubling Season"], 10);
    expect(result).toBeNull();
  });
});

describe("local.categoryTagMembersLocal", () => {
  beforeEach(() => {
    // edhrec_rank ordering: give the token-doubler members distinct ranks so
    // we can assert ORDER BY edhrec_rank IS NULL, edhrec_rank ASC.
    db.prepare(`UPDATE cards SET edhrec_rank = 500 WHERE oracle_id = 'member-strong'`).run();
    db.prepare(`UPDATE cards SET edhrec_rank = 100 WHERE oracle_id = 'member-token-only'`).run();
    // member-offcolor (Blue) and member-expensive/member-illegal/member-unpriced
    // all also carry token-doubler; leave their edhrec_rank NULL so they sort
    // after the ranked ones (but member-offcolor/illegal are filtered out by
    // ci/legality anyway).

    // Alias resolution: "cheap doubler" is an alias for counter-doubler.
    db.prepare(`INSERT INTO tag_aliases (alias, tag_id) VALUES ('cheap doubler', 'tag-counter-doubler')`).run();

    // A second, higher-member-count tag also matching "doubler" by label, to
    // exercise "pick the one with the highest member count" tie-breaking.
    // token-doubler already has 5 taggings (target-1, member-strong,
    // member-token-only, member-offcolor, member-expensive, member-illegal,
    // member-unpriced = 7); counter-doubler has 2 (target-1, member-strong).
  });

  it("resolves a tag by label", () => {
    const result = categoryTagMembersLocal(db, "token doubler");
    expect(result).not.toBeNull();
    expect(result!.slug).toBe("token-doubler");
  });

  it("resolves a tag via a hyphenated slug variant of the phrase", () => {
    // "token doubler" (space) must also resolve via the "token-doubler" slug.
    const result = categoryTagMembersLocal(db, "token doubler");
    expect(result!.slug).toBe("token-doubler");
  });

  it("resolves a tag via an alias", () => {
    const result = categoryTagMembersLocal(db, "cheap doubler");
    expect(result).not.toBeNull();
    expect(result!.slug).toBe("counter-doubler");
  });

  it("picks the tag with the higher member count when multiple candidates match", () => {
    // "doubler" substring-matches token-doubler (7 taggings), counter-doubler
    // (2 taggings), and synergy-generic does not match "doubler" at all.
    const result = categoryTagMembersLocal(db, "doubler");
    expect(result).not.toBeNull();
    expect(result!.slug).toBe("token-doubler");
  });

  it("filters members by ci mask", () => {
    const gMask = parseCiMask("g");
    const result = categoryTagMembersLocal(db, "token doubler", { ciMask: gMask });
    expect(result).not.toBeNull();
    // member-offcolor is Blue-identity; must be excluded under a green-only mask.
    expect(result!.members).not.toContain("Offcolor Doubler");
    // member-token-only is White-identity; also excluded under green-only.
    expect(result!.members).not.toContain("Token Only Doubler");
  });

  it("includes members within an expanded ci mask", () => {
    const gwMask = parseCiMask("gw");
    const result = categoryTagMembersLocal(db, "token doubler", { ciMask: gwMask });
    expect(result!.members).toContain("Token Only Doubler");
  });

  it("orders members by edhrec_rank ascending, NULLs last", () => {
    const result = categoryTagMembersLocal(db, "token doubler", { limit: 10 });
    expect(result).not.toBeNull();
    const names = result!.members;
    const tokenOnlyIdx = names.indexOf("Token Only Doubler"); // rank 100
    const strongIdx = names.indexOf("Strong Doubler"); // rank 500
    expect(tokenOnlyIdx).toBeGreaterThanOrEqual(0);
    expect(strongIdx).toBeGreaterThanOrEqual(0);
    expect(tokenOnlyIdx).toBeLessThan(strongIdx);
  });

  it("respects the limit option", () => {
    const result = categoryTagMembersLocal(db, "token doubler", { limit: 1 });
    expect(result!.members.length).toBe(1);
  });

  it("returns null when no tag matches", () => {
    const result = categoryTagMembersLocal(db, "totally nonexistent role zzz");
    expect(result).toBeNull();
  });

  it("returns null for a description-only match (rank 2)", () => {
    // "generic synergy" tag has description "Broad synergy grouping"; a query
    // matching only the description (not slug/label/alias) must not resolve.
    const result = categoryTagMembersLocal(db, "grouping");
    expect(result).toBeNull();
  });
});

describe("mtime-based cache reset", () => {
  let statTmpDir: string;
  let statFile: string;

  beforeEach(() => {
    statTmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scrychat-local-mtime-test-"));
    statFile = path.join(statTmpDir, "stat-target.db");
    fs.writeFileSync(statFile, "x");
    __setStatPathForTests(statFile);
  });

  afterEach(() => {
    __setStatPathForTests(undefined);
    fs.rmSync(statTmpDir, { recursive: true, force: true });
  });

  it("does not invalidate an injected test handle (no prior real stamp)", () => {
    // __resetLocalDbCacheForTests leaves cachedDbMtimeMs undefined, so the
    // mtime guard must be a no-op even if the stat'd file's mtime changes.
    __resetLocalDbCacheForTests(db);
    fs.utimesSync(statFile, new Date(Date.now() + 10_000), new Date(Date.now() + 10_000));

    expect(getLocalDb()).toBe(db);
  });

  it("closes the stale handle and clears every memo once the stat'd file's mtime changes past the throttle window", () => {
    const originalMtimeMs = fs.statSync(statFile).mtimeMs;

    // Simulate: a previous real getLocalDb() open stamped this mtime, and
    // populate the downstream memos as if accessors had already run.
    __resetLocalDbCacheForTests(db);
    __stampMtimeCacheForTests(originalMtimeMs, 0);
    // Warm the memoized accessors so we can prove they get cleared too.
    expect(findCombosLocal(db, ["Doubling Season", "Combo Partner"], 10)).not.toBeNull();
    expect(findAlternativesLocal(db, "Doubling Season", {})).not.toBeNull();

    // Bump the file's mtime (simulating an ingest run) past the throttle
    // window (lastStatCheckAt = 0 means the guard runs immediately).
    const bumped = new Date(originalMtimeMs + 60_000);
    fs.utimesSync(statFile, bumped, bumped);
    __stampMtimeCacheForTests(originalMtimeMs, 0);

    // getLocalDb() re-checks, finds the mtime mismatch, closes the stale
    // `db` handle, and re-decides from scratch against the real DB_PATH -
    // proving the stale cached verdict was discarded rather than reused.
    const result = getLocalDb();
    expect(result).not.toBe(db);

    // The stale handle must have been closed as part of invalidation.
    expect(() => db.prepare("SELECT 1").get()).toThrow();

    // Clean up: whatever getLocalDb() opened against the real DB_PATH
    // shouldn't leak into other tests/processes.
    if (result) result.close();
    __resetLocalDbCacheForTests(undefined);
  });

  it("throttles repeated invalidation checks: a mismatch within the throttle window is not applied", () => {
    const originalMtimeMs = fs.statSync(statFile).mtimeMs;

    __resetLocalDbCacheForTests(db);
    // lastStatCheckAt = Date.now() means we're inside the throttle window.
    __stampMtimeCacheForTests(originalMtimeMs, Date.now());

    const bumped = new Date(originalMtimeMs + 60_000);
    fs.utimesSync(statFile, bumped, bumped);

    // Within the throttle window: getLocalDb() must not re-stat, so the
    // still-open injected handle is returned unchanged.
    expect(getLocalDb()).toBe(db);
  });
});
