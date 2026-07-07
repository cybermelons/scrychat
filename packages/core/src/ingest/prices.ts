import fs from "node:fs";
import Chain from "stream-chain";
import Parser from "stream-json";
import StreamArray from "stream-json/streamers/StreamArray.js";
import type Database from "better-sqlite3";

interface ScryfallDefaultCard {
  oracle_id?: string;
  prices?: { usd?: string | null };
}

export interface IngestPricesResult {
  read: number;
  oraclesPriced: number;
  updated: number;
}

/**
 * Streams the default-cards bulk file (one row per printing) and computes,
 * per oracle_id, the MIN finite prices.usd across all printings. Batch
 * updates cards.price_usd in a single transaction.
 */
export async function ingestPrices(db: Database.Database, filePath: string): Promise<IngestPricesResult> {
  const minByOracle = new Map<string, number>();
  let read = 0;

  const pipeline = Chain.chain([
    fs.createReadStream(filePath),
    Parser.parser(),
    StreamArray.streamArray(),
  ]);

  await new Promise<void>((resolve, reject) => {
    pipeline.on("data", ({ value }: { value: ScryfallDefaultCard }) => {
      read++;
      const oracleId = value.oracle_id;
      const raw = value.prices?.usd;
      if (!oracleId || raw == null) return;
      const usd = Number(raw);
      if (!Number.isFinite(usd)) return;
      const existing = minByOracle.get(oracleId);
      if (existing === undefined || usd < existing) {
        minByOracle.set(oracleId, usd);
      }
    });
    pipeline.on("end", resolve);
    pipeline.on("error", reject);
  });

  const update = db.prepare("UPDATE cards SET price_usd = ? WHERE oracle_id = ?");
  const updateAll = db.transaction((entries: [string, number][]) => {
    for (const [oracleId, price] of entries) {
      update.run(price, oracleId);
    }
  });

  const entries = [...minByOracle.entries()];
  updateAll(entries);

  return { read, oraclesPriced: minByOracle.size, updated: entries.length };
}
