/**
 * Pure-ish core of GET /api/health's `db` block, split out of server.ts so it
 * can be tested without booting express.
 *
 * `exists` comes from stat'ing the file, never from getLocalDb(): getLocalDb
 * deliberately conflates "absent" with "present but zero cards" (both mean
 * "fall back to live Scryfall"). A diagnostic must tell them apart, because
 * the fixes differ (create the file vs. run an ingest).
 *
 * The `deps` parameter exists so the composition is testable without touching
 * sqlite or the real db file.
 */
import fs from "node:fs";
import { collectionStats, getLocalDb, readLocalDbCounts } from "@scrychat/core";
import {
  SNAPSHOT_STALE_DAYS,
  snapshotAge,
  type SnapshotFreshness,
} from "./snapshot-age.js";

export interface DbHealth {
  exists: boolean;
  path: string;
  /** null ONLY when undeterminable (file missing, or the query threw). 0 = empty mirror. */
  cardCount: number | null;
  arenaPopulated: number | null;
  ingestStamp: string | null;
  /** Exactly `getLocalDb() !== null`: will lookups actually go local. */
  usableAsMirror: boolean;
}

export interface DbHealthDeps {
  /** counts rows in the mirror at `dbPath`; defaults to core's readLocalDbCounts */
  readCounts?: (dbPath: string) => { cardCount: number | null; arenaPopulated: number | null };
  /** whether lookups will actually go local; defaults to `() => getLocalDb() !== null` */
  isUsableAsMirror?: () => boolean;
  /** stats the db file for its mtime; defaults to fs.statSync. Returns null if absent. */
  statMtime?: (dbPath: string) => Date | null;
}

function defaultStatMtime(p: string): Date | null {
  try {
    return fs.statSync(p).mtime;
  } catch {
    return null;
  }
}

export function getDbHealth(dbPath: string, deps: DbHealthDeps = {}): DbHealth {
  const readCounts = deps.readCounts ?? readLocalDbCounts;
  const isUsableAsMirror = deps.isUsableAsMirror ?? (() => getLocalDb() !== null);
  const statMtime = deps.statMtime ?? defaultStatMtime;

  // Single stat: exists and ingestStamp both derive from it, so they cannot contradict.
  const mtime = statMtime(dbPath);
  const ingestStamp = mtime ? mtime.toISOString() : null;
  const exists = mtime !== null;

  let cardCount: number | null = null;
  let arenaPopulated: number | null = null;
  if (exists) {
    ({ cardCount, arenaPopulated } = readCounts(dbPath));
  }

  let usableAsMirror = false;
  try {
    usableAsMirror = isUsableAsMirror();
  } catch {
    usableAsMirror = false;
  }

  return { exists, path: dbPath, cardCount, arenaPopulated, ingestStamp, usableAsMirror };
}

/**
 * Freshness of the Arena collection snapshot, for the health pill.
 *
 * Age is computed from the snapshot's own `importedAt`, never file mtime: mtime
 * changes on any rewrite and would call a re-saved stale snapshot fresh.
 * `staleAfterDays` is echoed so the client renders the threshold the server
 * used instead of hardcoding a second copy that can drift.
 */
export interface CollectionHealth {
  exists: boolean;
  path: string;
  importedAt: string | null;
  /** fresh | stale | future | unknown, from snapshotAge() */
  freshness: SnapshotFreshness;
  ageDays: number | null;
  label: string;
  staleAfterDays: number;
  uniqueOwned: number | null;
}

export interface CollectionHealthDeps {
  /** reads snapshot stats; defaults to core's collectionStats */
  readStats?: (p: string) => { exists: boolean; importedAt?: string; uniqueOwned?: number };
  /** clock; defaults to Date.now so tests need no fake timers */
  now?: () => number;
}

export function getCollectionHealth(
  collectionPath: string,
  deps: CollectionHealthDeps = {},
): CollectionHealth {
  const readStats = deps.readStats ?? collectionStats;
  const now = deps.now ?? Date.now;
  const stats = readStats(collectionPath);
  if (!stats.exists) {
    return {
      exists: false,
      path: collectionPath,
      importedAt: null,
      freshness: "unknown",
      ageDays: null,
      label: "unknown",
      staleAfterDays: SNAPSHOT_STALE_DAYS,
      uniqueOwned: null,
    };
  }
  const importedAt = stats.importedAt ?? null;
  const age = snapshotAge(importedAt, now());
  return {
    exists: true,
    path: collectionPath,
    importedAt,
    freshness: age.freshness,
    ageDays: age.ageDays,
    label: age.label,
    staleAfterDays: SNAPSHOT_STALE_DAYS,
    uniqueOwned: stats.uniqueOwned ?? null,
  };
}
