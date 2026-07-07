import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { openDb } from "../src/db/connection.js";
import { ingestCombos } from "../src/ingest/spellbook.js";

let tmpDir: string;
let dbPath: string;
let variantsPath: string;

function writeVariants(variants: unknown[]): void {
  fs.writeFileSync(
    variantsPath,
    JSON.stringify({ timestamp: "2026-01-01T00:00:00Z", version: "1.0.0", variants }),
  );
}

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "scrychat-spellbook-test-"));
  dbPath = path.join(tmpDir, "test.db");
  variantsPath = path.join(tmpDir, "variants.json");
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("ingestCombos", () => {
  it("inserts OK variants with combo_cards and combo_produces", async () => {
    writeVariants([
      {
        id: "combo-1",
        status: "OK",
        identity: "U",
        uses: [{ card: { oracleId: "oracle-a" } }, { card: { oracleId: "oracle-b" } }],
        produces: [{ feature: { name: "Infinite colorless mana" } }],
        description: "Do the thing.",
        popularity: 42,
        prices: { tcgplayer: "12.34" },
      },
    ]);

    const db = openDb({ path: dbPath });
    const result = await ingestCombos(db, variantsPath);

    expect(result.read).toBe(1);
    expect(result.inserted).toBe(1);
    expect(result.skipped).toBe(0);

    const combo = db.prepare("SELECT * FROM combos WHERE id = ?").get("combo-1") as {
      ci_mask: number;
      card_count: number;
      popularity: number;
      price_usd: number;
      description: string;
    };
    expect(combo.ci_mask).toBe(2);
    expect(combo.card_count).toBe(2);
    expect(combo.popularity).toBe(42);
    expect(combo.price_usd).toBeCloseTo(12.34);
    expect(combo.description).toBe("Do the thing.");

    const cards = db
      .prepare("SELECT oracle_id FROM combo_cards WHERE combo_id = ? ORDER BY oracle_id")
      .all("combo-1") as { oracle_id: string }[];
    expect(cards.map((c) => c.oracle_id)).toEqual(["oracle-a", "oracle-b"]);

    const produces = db
      .prepare("SELECT feature FROM combo_produces WHERE combo_id = ?")
      .all("combo-1") as { feature: string }[];
    expect(produces.map((p) => p.feature)).toEqual(["Infinite colorless mana"]);

    db.close();
  });

  it("skips non-OK variants and variants with a missing oracleId", async () => {
    writeVariants([
      { id: "not-ok", status: "NEEDS_TESTING", uses: [{ card: { oracleId: "oracle-a" } }], produces: [] },
      { id: "missing-oracle", status: "OK", uses: [{ card: {} }], produces: [] },
    ]);

    const db = openDb({ path: dbPath });
    const result = await ingestCombos(db, variantsPath);

    expect(result.read).toBe(2);
    expect(result.inserted).toBe(0);
    expect(result.skipped).toBe(2);
    const count = db.prepare("SELECT COUNT(*) as n FROM combos").get() as { n: number };
    expect(count.n).toBe(0);

    db.close();
  });

  it("is idempotent: re-running clears prior combos first", async () => {
    writeVariants([
      {
        id: "combo-1",
        status: "OK",
        identity: "G",
        uses: [{ card: { oracleId: "oracle-a" } }],
        produces: [{ feature: { name: "Infinite mana" } }],
      },
    ]);

    const db = openDb({ path: dbPath });
    await ingestCombos(db, variantsPath);
    await ingestCombos(db, variantsPath);

    const count = db.prepare("SELECT COUNT(*) as n FROM combos").get() as { n: number };
    expect(count.n).toBe(1);

    db.close();
  });

  it("falls back to joined produces names when description is absent", async () => {
    writeVariants([
      {
        id: "combo-1",
        status: "OK",
        identity: "",
        uses: [{ card: { oracleId: "oracle-a" } }],
        produces: [{ feature: { name: "Infinite damage" } }, { feature: { name: "Infinite mana" } }],
      },
    ]);

    const db = openDb({ path: dbPath });
    await ingestCombos(db, variantsPath);

    const combo = db.prepare("SELECT description, ci_mask FROM combos WHERE id = ?").get("combo-1") as {
      description: string;
      ci_mask: number;
    };
    expect(combo.description).toBe("Infinite damage, Infinite mana");
    expect(combo.ci_mask).toBe(0);

    db.close();
  });
});
