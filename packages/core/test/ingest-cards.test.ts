import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "../src/db/connection.js";
import { ingestCards } from "../src/ingest/cards.js";

let tmpDir: string;
let dbPath: string;
let cardsPath: string;

function writeCards(cards: unknown[]): void {
  fs.writeFileSync(cardsPath, JSON.stringify(cards));
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scrychat-cards-test-"));
  dbPath = path.join(tmpDir, "test.db");
  cardsPath = path.join(tmpDir, "cards.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ingestCards", () => {
  it("preserves an existing price_usd across a re-ingest of the same oracle_id", async () => {
    const card = {
      oracle_id: "oracle-1",
      name: "Sol Ring",
      layout: "normal",
      type_line: "Artifact",
      color_identity: [],
    };
    writeCards([card]);

    const db = openDb({ path: dbPath });
    await ingestCards(db, cardsPath);

    db.prepare("UPDATE cards SET price_usd = ? WHERE oracle_id = ?").run(1.5, "oracle-1");
    expect(
      (db.prepare("SELECT price_usd FROM cards WHERE oracle_id = ?").get("oracle-1") as { price_usd: number })
        .price_usd,
    ).toBe(1.5);

    // Re-run cards ingest for the same oracle_id (simulates a fresh --cards run).
    await ingestCards(db, cardsPath);

    const row = db.prepare("SELECT name, price_usd FROM cards WHERE oracle_id = ?").get("oracle-1") as {
      name: string;
      price_usd: number;
    };
    expect(row.name).toBe("Sol Ring");
    expect(row.price_usd).toBe(1.5);

    db.close();
  });

  it("leaves price_usd null for a genuinely new card", async () => {
    writeCards([
      { oracle_id: "oracle-2", name: "Arcane Signet", layout: "normal", type_line: "Artifact", color_identity: [] },
    ]);

    const db = openDb({ path: dbPath });
    await ingestCards(db, cardsPath);

    const row = db.prepare("SELECT price_usd FROM cards WHERE oracle_id = ?").get("oracle-2") as {
      price_usd: number | null;
    };
    expect(row.price_usd).toBeNull();

    db.close();
  });
});
