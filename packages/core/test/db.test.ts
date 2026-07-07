import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb, getMeta, setMeta } from "../src/db/connection.js";

let tmpDir: string;
let dbPath: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scrychat-db-test-"));
  dbPath = path.join(tmpDir, "test.db");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("db schema + connection", () => {
  it("applies schema.sql idempotently to a fresh file", () => {
    const db1 = openDb({ path: dbPath });
    db1.close();
    // Re-opening must not throw (CREATE TABLE IF NOT EXISTS etc.)
    const db2 = openDb({ path: dbPath });
    db2.close();
  });

  it("round-trips meta get/set", () => {
    const db = openDb({ path: dbPath });
    expect(getMeta(db, "missing")).toBeUndefined();
    setMeta(db, "foo", "bar");
    expect(getMeta(db, "foo")).toBe("bar");
    setMeta(db, "foo", "baz");
    expect(getMeta(db, "foo")).toBe("baz");
    db.close();
  });

  it("inserts a card and finds it via FTS", () => {
    const db = openDb({ path: dbPath });

    const insertCard = db.prepare(`
      INSERT INTO cards (oracle_id, name, type_line, oracle_text, ci_mask)
      VALUES (@oracle_id, @name, @type_line, @oracle_text, @ci_mask)
    `);
    insertCard.run({
      oracle_id: "test-oracle-1",
      name: "Wrath of God",
      type_line: "Sorcery",
      oracle_text: "Destroy all creatures. They can't be regenerated.",
      ci_mask: 1,
    });

    db.prepare(`
      INSERT INTO cards_fts (rowid, name, type_line, oracle_text)
      SELECT rowid, name, type_line, oracle_text FROM cards WHERE oracle_id = ?
    `).run("test-oracle-1");

    const row = db
      .prepare("SELECT oracle_id, ci_mask FROM cards WHERE name = ?")
      .get("Wrath of God") as { oracle_id: string; ci_mask: number };
    expect(row.oracle_id).toBe("test-oracle-1");
    expect(row.ci_mask).toBe(1);

    const ftsResults = db
      .prepare(
        `SELECT c.name FROM cards_fts f JOIN cards c ON c.rowid = f.rowid WHERE cards_fts MATCH ?`,
      )
      .all("destroy all creatures") as { name: string }[];
    expect(ftsResults.some((r) => r.name === "Wrath of God")).toBe(true);

    db.close();
  });
});
