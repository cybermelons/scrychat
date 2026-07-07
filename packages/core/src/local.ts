/**
 * Local-first SQLite backing for scryfall.ts / tags.ts / spellbook.ts /
 * alternatives.ts. Every export here is a pure/local helper: no network
 * calls. Callers detect DB availability once (see `getLocalDb`) and fall
 * back to the existing live/JSON implementations when the DB file is
 * absent or empty (fresh clone, ingest not yet run).
 */

import type Database from "better-sqlite3";
import { openDb } from "./db/connection.js";
import type { Card } from "./scryfall.js";

type DbInstance = InstanceType<typeof Database>;

const CI_BITS: Record<string, number> = { W: 1, U: 2, B: 4, R: 8, G: 16 };
const BIT_TO_COLOR: [number, string][] = [
  [1, "W"],
  [2, "U"],
  [4, "B"],
  [8, "R"],
  [16, "G"],
];

/** Parse a color-identity-within string like "gw" into a bitmask. */
export function parseCiMask(identity: string): number {
  let mask = 0;
  for (const ch of identity.toUpperCase()) {
    mask |= CI_BITS[ch] ?? 0;
  }
  return mask;
}

export function maskToColors(mask: number): string[] {
  const colors: string[] = [];
  for (const [bit, color] of BIT_TO_COLOR) {
    if (mask & bit) colors.push(color);
  }
  return colors;
}

let cachedDb: DbInstance | null | undefined;

/**
 * Returns a cached db handle if data/scrychat.db exists and has at least one
 * card, else null (DB absent/empty — callers should use their live/JSON
 * fallback). Detection happens once per process; the result (including the
 * "no DB" verdict) is cached.
 */
export function getLocalDb(): DbInstance | null {
  if (cachedDb !== undefined) return cachedDb;
  try {
    const db = openDb();
    const row = db.prepare("SELECT COUNT(*) AS n FROM cards").get() as { n: number };
    if (row.n > 0) {
      cachedDb = db;
    } else {
      db.close();
      cachedDb = null;
    }
  } catch {
    cachedDb = null;
  }
  return cachedDb;
}

/** Test-only: reset the cached db handle/verdict so tests can inject a fixture db. */
export function __resetLocalDbCacheForTests(db?: DbInstance | null): void {
  cachedDb = db;
  totalTaggedCardsCache = undefined;
  hasCardTagsCache = undefined;
  hasCombosCache = undefined;
}

let hasCardTagsCache: boolean | undefined;

/** Whether card_tags has any rows, memoized per process (see getLocalDb doc). */
function hasCardTags(db: DbInstance): boolean {
  if (hasCardTagsCache !== undefined) return hasCardTagsCache;
  const row = db.prepare("SELECT COUNT(*) AS n FROM card_tags").get() as { n: number };
  hasCardTagsCache = row.n > 0;
  return hasCardTagsCache;
}

let hasCombosCache: boolean | undefined;

/** Whether combos has any rows, memoized per process (see getLocalDb doc). */
function hasCombos(db: DbInstance): boolean {
  if (hasCombosCache !== undefined) return hasCombosCache;
  const row = db.prepare("SELECT COUNT(*) AS n FROM combos").get() as { n: number };
  hasCombosCache = row.n > 0;
  return hasCombosCache;
}

let totalTaggedCardsCache: number | undefined;

/**
 * Count of distinct oracle_ids with at least one functional tag. This is a
 * corpus-wide constant (only changes when the DB is re-ingested), but the
 * COUNT(DISTINCT ...) scan over all of card_tags costs ~450ms on the full
 * dataset — memoize per process so repeated findAlternatives calls stay
 * fast.
 */
function getTotalTaggedCards(db: DbInstance): number {
  if (totalTaggedCardsCache !== undefined) return totalTaggedCardsCache;
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT oracle_id) AS n FROM card_tags ct JOIN tags t ON t.id = ct.tag_id WHERE t.is_functional = 1`,
    )
    .get() as { n: number };
  totalTaggedCardsCache = row.n;
  return totalTaggedCardsCache;
}

interface CardRow {
  oracle_id: string;
  name: string;
  mana_cost: string | null;
  cmc: number | null;
  type_line: string | null;
  oracle_text: string | null;
  color_identity: string | null;
  ci_mask: number | null;
  edhrec_rank: number | null;
  price_usd: number | null;
  image: string | null;
  scryfall_uri: string | null;
  legal_commander: number | null;
}

export function rowToCard(row: CardRow): Card {
  return {
    name: row.name,
    manaCost: row.mana_cost,
    cmc: row.cmc ?? 0,
    typeLine: row.type_line ?? "",
    oracleText: row.oracle_text,
    colorIdentity: row.color_identity ? (JSON.parse(row.color_identity) as string[]) : [],
    usd: row.price_usd,
    edhrecRank: row.edhrec_rank,
    image: row.image,
    uri: row.scryfall_uri ?? "",
    legalCommander: row.legal_commander === 1,
  };
}

const CARD_COLUMNS = `
  oracle_id, name, mana_cost, cmc, type_line, oracle_text, color_identity,
  ci_mask, edhrec_rank, price_usd, image, scryfall_uri, legal_commander
`;

/**
 * Local card resolution: exact name (case-insensitive) -> prefix match ->
 * FTS best-rank match. Returns null on no local hit (caller falls back to
 * live Scryfall fuzzy lookup).
 */
export function getCardLocal(db: DbInstance, name: string): Card | null {
  const exact = db
    .prepare(`SELECT ${CARD_COLUMNS} FROM cards WHERE name = ? COLLATE NOCASE LIMIT 1`)
    .get(name) as CardRow | undefined;
  if (exact) return rowToCard(exact);

  const prefix = db
    .prepare(`SELECT ${CARD_COLUMNS} FROM cards WHERE name LIKE ? COLLATE NOCASE ORDER BY name LIMIT 1`)
    .get(`${name}%`) as CardRow | undefined;
  if (prefix) return rowToCard(prefix);

  const ftsQuery = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((tok) => `"${tok.replace(/"/g, '""')}"*`)
    .join(" ");
  if (!ftsQuery) return null;

  try {
    const fts = db
      .prepare(
        `SELECT ${CARD_COLUMNS.replace(/oracle_id/, "c.oracle_id")
          .split(",")
          .map((c) => (c.trim().startsWith("c.") ? c : `c.${c.trim()}`))
          .join(", ")}
         FROM cards_fts f JOIN cards c ON c.rowid = f.rowid
         WHERE cards_fts MATCH ?
         ORDER BY bm25(cards_fts) LIMIT 1`,
      )
      .get(ftsQuery) as CardRow | undefined;
    if (fts) return rowToCard(fts);
  } catch {
    // Malformed FTS query syntax (e.g. all-stopword input) - no local hit.
  }

  return null;
}

export interface LocalTagRow {
  slug: string;
  label: string;
  description: string | null;
  count: number;
  parents: string[];
}

function parentsForTagId(db: DbInstance, tagId: string): string[] {
  const rows = db
    .prepare(
      `SELECT t.slug AS slug FROM tag_parents tp JOIN tags t ON t.id = tp.parent_id WHERE tp.tag_id = ?`,
    )
    .all(tagId) as { slug: string }[];
  return rows.map((r) => r.slug);
}

const TAG_COUNT_SQL = `(SELECT COUNT(*) FROM card_tags ct WHERE ct.tag_id = t.id)`;

export function searchTagsLocal(db: DbInstance, query: string, limit: number): LocalTagRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const rows = db
    .prepare(
      `
      SELECT t.id AS id, t.slug AS slug, t.label AS label, t.description AS description,
             ${TAG_COUNT_SQL} AS count,
             CASE
               WHEN lower(t.slug) LIKE '%' || ? || '%' OR lower(t.label) LIKE '%' || ? || '%' THEN 0
               WHEN EXISTS (SELECT 1 FROM tag_aliases a WHERE a.tag_id = t.id AND lower(a.alias) LIKE '%' || ? || '%') THEN 1
               WHEN lower(COALESCE(t.description, '')) LIKE '%' || ? || '%' THEN 2
               ELSE NULL
             END AS rank
      FROM tags t
      WHERE t.is_functional = 1
        AND (
          lower(t.slug) LIKE '%' || ? || '%'
          OR lower(t.label) LIKE '%' || ? || '%'
          OR EXISTS (SELECT 1 FROM tag_aliases a WHERE a.tag_id = t.id AND lower(a.alias) LIKE '%' || ? || '%')
          OR lower(COALESCE(t.description, '')) LIKE '%' || ? || '%'
        )
      ORDER BY rank ASC, count DESC, t.slug ASC
      LIMIT ?
      `,
    )
    .all(q, q, q, q, q, q, q, q, limit) as {
    id: string;
    slug: string;
    label: string;
    description: string | null;
    count: number;
  }[];

  return rows.map((r) => ({
    slug: r.slug,
    label: r.label,
    description: r.description,
    count: r.count,
    parents: parentsForTagId(db, r.id),
  }));
}

export function getTagLocal(db: DbInstance, slug: string): LocalTagRow | null {
  const row = db
    .prepare(
      `SELECT t.id AS id, t.slug AS slug, t.label AS label, t.description AS description, ${TAG_COUNT_SQL} AS count
       FROM tags t WHERE t.slug = ? AND t.is_functional = 1 LIMIT 1`,
    )
    .get(slug) as { id: string; slug: string; label: string; description: string | null; count: number } | undefined;
  if (!row) return null;
  return {
    slug: row.slug,
    label: row.label,
    description: row.description,
    count: row.count,
    parents: parentsForTagId(db, row.id),
  };
}

export interface LocalCombo {
  pieces: string[];
  produces: string[];
  identity: string;
  link: string;
  popularity: number | null;
}

/**
 * Resolves each input card name locally (exact/prefix/FTS), then finds
 * combos whose combo_cards set contains ALL resolved oracle_ids (AND-match,
 * mirroring the live implementation's semantics). Returns null if any input
 * card fails to resolve locally (caller should fall back to live).
 */
export function findCombosLocal(db: DbInstance, cards: string[], limit: number): LocalCombo[] | null {
  if (!hasCombos(db)) return null;

  const oracleIds: string[] = [];
  for (const name of cards) {
    const card = getCardLocal(db, name);
    if (!card) return null;
    const row = db.prepare(`SELECT oracle_id FROM cards WHERE name = ? COLLATE NOCASE LIMIT 1`).get(card.name) as
      | { oracle_id: string }
      | undefined;
    if (!row) return null;
    oracleIds.push(row.oracle_id);
  }
  if (oracleIds.length === 0) return [];

  const placeholders = oracleIds.map(() => "?").join(", ");
  const comboIds = db
    .prepare(
      `
      SELECT combo_id FROM combo_cards
      WHERE oracle_id IN (${placeholders})
      GROUP BY combo_id
      HAVING COUNT(DISTINCT oracle_id) = ?
      `,
    )
    .all(...oracleIds, oracleIds.length) as { combo_id: string }[];

  if (comboIds.length === 0) return [];

  const comboIdList = comboIds.map((r) => r.combo_id);
  const idPlaceholders = comboIdList.map(() => "?").join(", ");

  const combos = db
    .prepare(
      `SELECT id, identity, status, popularity FROM combos WHERE id IN (${idPlaceholders}) AND status = 'OK' ORDER BY popularity DESC LIMIT ?`,
    )
    .all(...comboIdList, limit) as { id: string; identity: string | null; status: string; popularity: number | null }[];

  const piecesStmt = db.prepare(
    `SELECT c.name AS name FROM combo_cards cc JOIN cards c ON c.oracle_id = cc.oracle_id WHERE cc.combo_id = ?`,
  );
  const producesStmt = db.prepare(`SELECT feature FROM combo_produces WHERE combo_id = ?`);

  return combos.map((combo) => {
    const pieces = (piecesStmt.all(combo.id) as { name: string }[]).map((p) => p.name);
    const produces = (producesStmt.all(combo.id) as { feature: string }[]).map((p) => p.feature);
    return {
      pieces,
      produces,
      identity: combo.identity ?? "",
      link: `https://commanderspellbook.com/combo/${combo.id}`,
      popularity: combo.popularity,
    };
  });
}

export interface LocalRole {
  slug: string;
  label: string;
  members: Card[];
}

/**
 * Local functional-alternatives algorithm:
 *  1. Target's functional tags (is_functional=1), sorted by specificity
 *     ascending (fewer taggings = more specific), top 4 as roles.
 *  2. For each role: other cards sharing that tag, legal_commander=1,
 *     ci_mask within opts mask, price_usd <= maxPrice (NULL price is
 *     treated as unknown and not excluded), excluding the target. Ranked
 *     by summed shared-tag IDF: sum over ALL shared functional tags t of
 *     weight_target(t) * ln(totalTaggedCards / memberCount(t)).
 */
export function findAlternativesLocal(
  db: DbInstance,
  cardName: string,
  opts: { colorIdentityWithin?: string; maxPrice?: number; limitPerRole?: number },
): { card: string; roles: LocalRole[] } | null {
  if (!hasCardTags(db)) return null;

  const target = getCardLocal(db, cardName);
  if (!target) return null;

  const targetRow = db
    .prepare(`SELECT oracle_id FROM cards WHERE name = ? COLLATE NOCASE LIMIT 1`)
    .get(target.name) as { oracle_id: string } | undefined;
  if (!targetRow) return null;
  const targetOracleId = targetRow.oracle_id;

  const targetTags = db
    .prepare(
      `
      SELECT t.id AS id, t.slug AS slug, t.label AS label, ct.weight AS weight,
             ${TAG_COUNT_SQL} AS count
      FROM card_tags ct
      JOIN tags t ON t.id = ct.tag_id
      WHERE ct.oracle_id = ? AND t.is_functional = 1
      ORDER BY count ASC
      `,
    )
    .all(targetOracleId) as { id: string; slug: string; label: string; weight: number; count: number }[];

  if (targetTags.length === 0) {
    return { card: target.name, roles: [] };
  }

  const totalTaggedCards = Math.max(getTotalTaggedCards(db), 1);

  const targetWeightByTagId = new Map(targetTags.map((t) => [t.id, t.weight]));
  const targetTagCountById = new Map(targetTags.map((t) => [t.id, t.count]));

  const roleTags = targetTags.slice(0, 4);
  const limitPerRole = opts.limitPerRole ?? 8;
  const ciMask = opts.colorIdentityWithin ? parseCiMask(opts.colorIdentityWithin) : null;

  const memberCardStmt = db.prepare(
    `
    SELECT ${CARD_COLUMNS}
    FROM cards
    WHERE oracle_id = ?
    `,
  );

  const roles: LocalRole[] = [];

  for (const roleTag of roleTags) {
    const candidateRows = db
      .prepare(
        `
        SELECT DISTINCT c.oracle_id AS oracle_id
        FROM card_tags ct
        JOIN cards c ON c.oracle_id = ct.oracle_id
        WHERE ct.tag_id = ?
          AND c.oracle_id != ?
          AND c.legal_commander = 1
          AND (? IS NULL OR (c.ci_mask & ~?) = 0)
          AND (? IS NULL OR (c.price_usd IS NOT NULL AND c.price_usd <= ?))
        `,
      )
      .all(
        roleTag.id,
        targetOracleId,
        ciMask,
        ciMask,
        opts.maxPrice ?? null,
        opts.maxPrice ?? null,
      ) as { oracle_id: string }[];

    if (candidateRows.length === 0) {
      roles.push({ slug: roleTag.slug, label: roleTag.label, members: [] });
      continue;
    }

    const candidateIds = candidateRows.map((r) => r.oracle_id);
    const placeholders = candidateIds.map(() => "?").join(", ");

    const sharedTagRows = db
      .prepare(
        `
        SELECT ct.oracle_id AS oracle_id, ct.tag_id AS tag_id
        FROM card_tags ct
        WHERE ct.oracle_id IN (${placeholders})
          AND ct.tag_id IN (${targetTags.map(() => "?").join(", ")})
        `,
      )
      .all(...candidateIds, ...targetTags.map((t) => t.id)) as { oracle_id: string; tag_id: string }[];

    const scoreByOracleId = new Map<string, number>();
    for (const row of sharedTagRows) {
      const weight = targetWeightByTagId.get(row.tag_id) ?? 0;
      const memberCount = targetTagCountById.get(row.tag_id) ?? totalTaggedCards;
      const idf = Math.log(totalTaggedCards / Math.max(memberCount, 1));
      const contribution = weight * idf;
      scoreByOracleId.set(row.oracle_id, (scoreByOracleId.get(row.oracle_id) ?? 0) + contribution);
    }

    const ranked = candidateIds
      .map((oracleId) => ({ oracleId, score: scoreByOracleId.get(oracleId) ?? 0 }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limitPerRole);

    const members: Card[] = ranked.map(({ oracleId }) => {
      const row = memberCardStmt.get(oracleId) as CardRow;
      return rowToCard(row);
    });

    roles.push({ slug: roleTag.slug, label: roleTag.label, members });
  }

  return { card: target.name, roles };
}
