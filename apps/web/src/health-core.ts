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
import { getLocalDb, readLocalDbCounts } from "@scrychat/core";

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
