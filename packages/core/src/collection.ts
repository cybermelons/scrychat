/**
 * Local Arena-collection file: a simple JSON snapshot of "which arena card
 * ids does the player own, and how many copies" imported from a parsed
 * Player.log (see arena-log.ts). Consumers (deckbuilding filters, etc.)
 * resolve arena ids to oracle_ids/names via the local cards DB so they can
 * answer "do I own this card" against Scryfall-shaped data.
 */

import fs from "node:fs";
import path from "node:path";
import type Database from "better-sqlite3";
import { REPO_ROOT } from "./db/connection.js";
import { getLocalDb } from "./local.js";

type DbInstance = InstanceType<typeof Database>;

export interface CollectionFile {
  importedAt: string;
  source: string;
  cards: Record<string, number>;
}

export const COLLECTION_PATH = path.join(REPO_ROOT, "collection.json");

/** Read + JSON-parse the collection file. Missing file or invalid JSON -> null. */
export function readCollectionFile(filePath: string = COLLECTION_PATH): CollectionFile | null {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw) as CollectionFile;
  } catch {
    return null;
  }
}

/** Write the collection file atomically (write to a tmp file, then rename). */
export function writeCollectionFile(col: CollectionFile, filePath: string = COLLECTION_PATH): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmpPath = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmpPath, JSON.stringify(col, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
}

const SQLITE_VAR_CHUNK = 500;

/**
 * Resolve arena ids to { oracleId, name } via the local cards DB, chunked
 * to stay under SQLite's bound-parameter limit. Returns the matched map
 * plus the list of arena ids that had no matching card row.
 */
export function mapArenaIdsToOracle(
  db: DbInstance,
  arenaIds: string[],
): { byArenaId: Map<string, { oracleId: string; name: string }>; unmatched: string[] } {
  const byArenaId = new Map<string, { oracleId: string; name: string }>();
  const uniqueIds = [...new Set(arenaIds)];

  for (let i = 0; i < uniqueIds.length; i += SQLITE_VAR_CHUNK) {
    const chunk = uniqueIds.slice(i, i + SQLITE_VAR_CHUNK);
    const placeholders = chunk.map(() => "?").join(", ");
    const rows = db
      .prepare(`SELECT oracle_id, name, arena_id FROM cards WHERE arena_id IN (${placeholders})`)
      .all(...chunk) as { oracle_id: string; name: string; arena_id: number }[];
    for (const row of rows) {
      byArenaId.set(String(row.arena_id), { oracleId: row.oracle_id, name: row.name });
    }
  }

  const unmatched = uniqueIds.filter((id) => !byArenaId.has(id));
  return { byArenaId, unmatched };
}

export interface OwnedIndex {
  oracleIds: Set<string>;
  names: Set<string>;
  importedAt: string;
}

let ownedIndexCache:
  | { filePath: string; mtimeMs: number; dbRef: DbInstance | null; index: OwnedIndex }
  | undefined;

/**
 * Build (and cache) an index of owned cards keyed by oracle_id and by
 * lowercased name (including the front-face name for " // " double-faced
 * cards), from the collection file resolved against the local cards DB.
 * Returns null if there's no collection file or no local DB available.
 * Cheap per-call: only a stat() unless the file or db handle changed.
 */
export function getOwnedIndex(filePath: string = COLLECTION_PATH, db?: DbInstance | null): OwnedIndex | null {
  const dbHandle = db === undefined ? getLocalDb() : db;
  if (!dbHandle) return null;

  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return null;
  }

  if (
    ownedIndexCache &&
    ownedIndexCache.filePath === filePath &&
    ownedIndexCache.mtimeMs === stat.mtimeMs &&
    ownedIndexCache.dbRef === dbHandle
  ) {
    return ownedIndexCache.index;
  }

  const col = readCollectionFile(filePath);
  if (!col) return null;

  const arenaIds = Object.keys(col.cards);
  const { byArenaId } = mapArenaIdsToOracle(dbHandle, arenaIds);

  const oracleIds = new Set<string>();
  const names = new Set<string>();
  for (const { oracleId, name } of byArenaId.values()) {
    oracleIds.add(oracleId);
    const lower = name.toLowerCase();
    names.add(lower);
    const sepIdx = lower.indexOf(" // ");
    if (sepIdx !== -1) {
      names.add(lower.slice(0, sepIdx));
    }
  }

  const index: OwnedIndex = { oracleIds, names, importedAt: col.importedAt };
  ownedIndexCache = { filePath, mtimeMs: stat.mtimeMs, dbRef: dbHandle, index };
  return index;
}

export interface CollectionStats {
  exists: boolean;
  importedAt?: string;
  source?: string;
  uniqueOwned?: number;
  totalCards?: number;
  unmatchedCount?: number;
}

/** Summary stats about the collection file, resolved against the local cards DB when available. */
export function collectionStats(filePath: string = COLLECTION_PATH, db?: DbInstance | null): CollectionStats {
  const col = readCollectionFile(filePath);
  if (!col) return { exists: false };

  const arenaIds = Object.keys(col.cards);
  const totalCards = Object.values(col.cards).reduce((sum, n) => sum + n, 0);

  const dbHandle = db === undefined ? getLocalDb() : db;
  if (!dbHandle) {
    return {
      exists: true,
      importedAt: col.importedAt,
      source: col.source,
      uniqueOwned: new Set(arenaIds).size,
      totalCards,
      unmatchedCount: undefined,
    };
  }

  const { byArenaId, unmatched } = mapArenaIdsToOracle(dbHandle, arenaIds);
  return {
    exists: true,
    importedAt: col.importedAt,
    source: col.source,
    uniqueOwned: byArenaId.size,
    totalCards,
    unmatchedCount: unmatched.length,
  };
}
