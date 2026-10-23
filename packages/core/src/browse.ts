/**
 * Browse pages: commanders (local mirror) and precon decks (MTGJSON).
 * Parsers are pure; fetching goes through an injectable fetch so tests never
 * touch the network.
 */

import type Database from "better-sqlite3";
import { getLocalDb, parseCiMask } from "./local.js";

type DbInstance = InstanceType<typeof Database>;

export interface CommanderRow {
  name: string;
  colorIdentity: string[];
  typeLine: string | null;
  image: string | null;
  /** Shown as info only. Never a sort key: docs/design.md says rank is not a ranking input. */
  edhrecRank: number | null;
}

export type ListCommandersResult =
  | { ok: true; commanders: CommanderRow[]; total: number }
  | { ok: false; error: string };

/**
 * Legal commanders from the local mirror, alphabetical. `colors` is a string
 * of WUBRG letters; a commander matches when its identity contains every
 * selected color. "C" alone means colorless. Absent mirror is an explicit error.
 */
export function listCommanders(
  opts: { q?: string; colors?: string; limit?: number; offset?: number } = {},
  db: DbInstance | null = getLocalDb()
): ListCommandersResult {
  if (!db) return { ok: false, error: "Local card database is missing or empty. Run the ingest to enable Commanders." };
  const where = ["is_commander = 1", "legal_commander = 1"];
  const args: unknown[] = [];
  const q = opts.q?.trim();
  if (q) {
    where.push("name LIKE ? ESCAPE '\\'");
    args.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }
  const colors = (opts.colors ?? "").toUpperCase();
  if (colors === "C") {
    where.push("ci_mask = 0");
  } else if (colors) {
    const m = parseCiMask(colors);
    where.push("(ci_mask & ?) = ?");
    args.push(m, m);
  }
  const clause = where.join(" AND ");
  const limit = Math.min(Math.max(opts.limit ?? 60, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const total = (db.prepare(`SELECT COUNT(*) AS n FROM cards WHERE ${clause}`).get(...args) as { n: number }).n;
  const rows = db
    .prepare(
      `SELECT name, color_identity, type_line, image, edhrec_rank FROM cards WHERE ${clause}
       ORDER BY name COLLATE NOCASE LIMIT ? OFFSET ?`
    )
    .all(...args, limit, offset) as {
    name: string;
    color_identity: string | null;
    type_line: string | null;
    image: string | null;
    edhrec_rank: number | null;
  }[];
  return {
    ok: true,
    total,
    commanders: rows.map((r) => ({
      name: r.name,
      colorIdentity: r.color_identity ? (JSON.parse(r.color_identity) as string[]) : [],
      typeLine: r.type_line,
      image: r.image,
      edhrecRank: r.edhrec_rank,
    })),
  };
}

// ---- precons (MTGJSON) ----

export interface PreconRef {
  fileName: string;
  code: string;
  name: string;
  releaseDate: string;
  type: string;
}

export interface PreconCommander {
  name: string;
  colorIdentity: string[];
  image: string | null;
}

export interface Precon extends PreconRef {
  commanders: PreconCommander[];
  /** Mainboard, commanders excluded. */
  cards: { name: string; count: number }[];
}

/** DeckList.json -> Commander-type decks, newest first. */
export function parseDeckList(json: unknown): PreconRef[] {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) throw new Error("MTGJSON DeckList: unexpected shape (no data[])");
  return data
    .filter((d) => typeof d?.type === "string" && d.type.includes("Commander") && typeof d.fileName === "string")
    .map((d) => ({ fileName: d.fileName, code: d.code, name: d.name, releaseDate: d.releaseDate ?? "", type: d.type }))
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate) || a.name.localeCompare(b.name));
}

function scryfallImage(id: unknown): string | null {
  return typeof id === "string" && id.length > 2
    ? `https://cards.scryfall.io/normal/front/${id[0]}/${id[1]}/${id}.jpg`
    : null;
}

/** decks/<fileName>.json -> Precon. */
export function parsePreconDeck(ref: PreconRef, json: unknown): Precon {
  const d = (json as { data?: any })?.data;
  if (!d || !Array.isArray(d.commander) || !Array.isArray(d.mainBoard)) {
    throw new Error(`MTGJSON deck ${ref.fileName}: unexpected shape`);
  }
  return {
    ...ref,
    commanders: d.commander.map((c: any) => ({
      name: c.name,
      colorIdentity: c.colorIdentity ?? [],
      image: scryfallImage(c.identifiers?.scryfallId),
    })),
    cards: d.mainBoard.map((c: any) => ({ name: c.name, count: c.count ?? 1 })),
  };
}

const BASE = "https://mtgjson.com/api/v5";
type FetchLike = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

// ponytail: memory cache, restart refetches (~200 decks, a few seconds); persist to disk if startup latency matters
let preconCache: Promise<Precon[]> | undefined;

/** Every Commander precon with commanders and card list, fetched once per process. */
export function getPrecons(fetchImpl: FetchLike = fetch as FetchLike): Promise<Precon[]> {
  preconCache ??= (async () => {
    const get = async (url: string) => {
      const r = await fetchImpl(url);
      if (!r.ok) throw new Error(`MTGJSON ${url}: HTTP ${r.status}`);
      return r.json();
    };
    const refs = parseDeckList(await get(`${BASE}/DeckList.json`));
    const out: Precon[] = new Array(refs.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: 8 }, async () => {
        while (next < refs.length) {
          const i = next++;
          out[i] = parsePreconDeck(refs[i], await get(`${BASE}/decks/${refs[i].fileName}.json`));
        }
      })
    );
    return out;
  })();
  preconCache.catch(() => (preconCache = undefined)); // failed load is retried next call
  return preconCache;
}

/** Test-only. */
export function __resetPreconCacheForTests(): void {
  preconCache = undefined;
}

/** Text + color filter shared by Explore. `colors` as in listCommanders (contains-all). */
export function matchesFilter(name: string, identity: string[], q?: string, colors?: string): boolean {
  if (q?.trim() && !name.toLowerCase().includes(q.trim().toLowerCase())) return false;
  const c = (colors ?? "").toUpperCase();
  if (!c) return true;
  if (c === "C") return identity.length === 0;
  return [...c].every((ch) => identity.includes(ch));
}
