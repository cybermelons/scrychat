import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "../src/db/connection.js";
import {
  readCollectionFile,
  writeCollectionFile,
  mapArenaIdsToOracle,
  getOwnedIndex,
  collectionStats,
  type CollectionFile,
} from "../src/collection.js";

let tmpDir: string;
let collectionPath: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scrychat-collection-test-"));
  collectionPath = path.join(tmpDir, "collection.json");
  dbPath = path.join(tmpDir, "test.db");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function insertCard(
  db: ReturnType<typeof openDb>,
  oracleId: string,
  name: string,
  arenaId: number | null,
): void {
  db.prepare(
    `INSERT INTO cards (oracle_id, name, type_line, arena_id) VALUES (?, ?, ?, ?)`,
  ).run(oracleId, name, "Creature", arenaId);
}

describe("collection.json read/write", () => {
  it("round-trips a collection file", () => {
    const col: CollectionFile = {
      importedAt: "2026-07-05T00:00:00.000Z",
      source: "player-log",
      cards: { "1001": 4, "1002": 2 },
    };
    writeCollectionFile(col, collectionPath);
    const read = readCollectionFile(collectionPath);
    expect(read).toEqual(col);
  });

  it("does not leave a tmp file behind after a write (atomicity basics)", () => {
    writeCollectionFile({ importedAt: "x", source: "y", cards: { "1": 1 } }, collectionPath);
    const files = fs.readdirSync(tmpDir);
    expect(files).toEqual(["collection.json"]);
  });

  it("returns null for a missing file", () => {
    expect(readCollectionFile(collectionPath)).toBeNull();
  });

  it("returns null for invalid JSON", () => {
    fs.writeFileSync(collectionPath, "not valid json {{{");
    expect(readCollectionFile(collectionPath)).toBeNull();
  });
});

describe("mapArenaIdsToOracle", () => {
  it("resolves matched ids and reports unmatched ids", () => {
    const db = openDb({ path: dbPath });
    insertCard(db, "oracle-1", "Lightning Bolt", 111);
    insertCard(db, "oracle-2", "Counterspell", 222);
    insertCard(db, "oracle-3", "Brainstorm", 333);

    const { byArenaId, unmatched } = mapArenaIdsToOracle(db, ["111", "222", "999999"]);

    expect(byArenaId.get("111")).toEqual({ oracleId: "oracle-1", name: "Lightning Bolt" });
    expect(byArenaId.get("222")).toEqual({ oracleId: "oracle-2", name: "Counterspell" });
    expect(byArenaId.has("999999")).toBe(false);
    expect(unmatched).toEqual(["999999"]);

    db.close();
  });
});

describe("getOwnedIndex", () => {
  it("returns null when the collection file is missing", () => {
    const db = openDb({ path: dbPath });
    expect(getOwnedIndex(collectionPath, db)).toBeNull();
    db.close();
  });

  it("indexes owned oracle ids and names, including the front face of DFCs", () => {
    const db = openDb({ path: dbPath });
    insertCard(db, "oracle-1", "Lightning Bolt", 111);
    insertCard(db, "oracle-2", "Delver of Secrets // Insectile Aberration", 222);

    writeCollectionFile(
      {
        importedAt: "2026-07-05T00:00:00.000Z",
        source: "player-log",
        cards: { "111": 4, "222": 1 },
      },
      collectionPath,
    );

    const index = getOwnedIndex(collectionPath, db);
    expect(index).not.toBeNull();
    expect(index!.oracleIds.has("oracle-1")).toBe(true);
    expect(index!.oracleIds.has("oracle-2")).toBe(true);
    expect(index!.names.has("lightning bolt")).toBe(true);
    expect(index!.names.has("delver of secrets // insectile aberration")).toBe(true);
    expect(index!.names.has("delver of secrets")).toBe(true);
    expect(index!.importedAt).toBe("2026-07-05T00:00:00.000Z");

    db.close();
  });
});

describe("collectionStats", () => {
  it("reports exists:false when the file is missing", () => {
    const db = openDb({ path: dbPath });
    expect(collectionStats(collectionPath, db)).toEqual({ exists: false });
    db.close();
  });

  it("computes totals and unmatched count against a DB", () => {
    const db = openDb({ path: dbPath });
    insertCard(db, "oracle-1", "Lightning Bolt", 111);
    insertCard(db, "oracle-2", "Counterspell", 222);

    writeCollectionFile(
      {
        importedAt: "2026-07-05T00:00:00.000Z",
        source: "player-log",
        cards: { "111": 4, "222": 2, "333": 1 },
      },
      collectionPath,
    );

    const stats = collectionStats(collectionPath, db);
    expect(stats.exists).toBe(true);
    expect(stats.totalCards).toBe(7);
    expect(stats.uniqueOwned).toBe(2);
    expect(stats.unmatchedCount).toBe(1);

    db.close();
  });
});
