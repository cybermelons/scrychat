import fs from "node:fs";
import Chain from "stream-chain";
import Parser from "stream-json";
import StreamArray from "stream-json/streamers/StreamArray.js";
import type Database from "better-sqlite3";

interface ScryfallDefaultCard {
  oracle_id?: string;
  prices?: { usd?: string | null };
  games?: string[];
  arena_id?: number;
}

export interface IngestPricesResult {
  read: number;
  oraclesPriced: number;
  updated: number;
  arenaCount: number;
  arenaIdCount: number;
}

/**
 * Streams the default-cards bulk file (one row per printing) and computes,
 * per oracle_id, the MIN finite prices.usd across all printings. Batch
 * updates cards.price_usd in a single transaction.
 *
 * Also aggregates Arena availability: a card is "on Arena" if ANY printing
 * of its oracle_id lists "arena" in its games array. oracle-cards (the
 * cards.ts pass) only sees one representative printing per oracle_id, which
 * is wrong for ~10% of cards, so arena must be computed here by scanning
 * every printing in default-cards instead.
 */
export async function ingestPrices(db: Database.Database, filePath: string): Promise<IngestPricesResult> {
  const minByOracle = new Map<string, number>();
  const oraclesSeen = new Set<string>();
  const arenaByOracle = new Set<string>();
  const arenaIdByOracle = new Map<string, number>();
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
      if (!oracleId) return;
      oraclesSeen.add(oracleId);
      // Arena aggregation happens for every printing with an oracle_id,
      // independent of whether that printing has a usd price (a printing
      // can be arena-legal with no market price).
      if ((value.games ?? []).includes("arena")) {
        arenaByOracle.add(oracleId);
      }
      if (value.arena_id != null && oracleId) {
        arenaIdByOracle.set(oracleId, value.arena_id);
      }

      const raw = value.prices?.usd;
      if (raw == null) return;
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

  const updateArena = db.prepare("UPDATE cards SET arena = ? WHERE oracle_id = ?");
  const updateArenaAll = db.transaction((oracleIds: string[]) => {
    for (const oracleId of oracleIds) {
      updateArena.run(arenaByOracle.has(oracleId) ? 1 : 0, oracleId);
    }
  });
  const allOracleIds = [...oraclesSeen];
  updateArenaAll(allOracleIds);

  const updateArenaId = db.prepare("UPDATE cards SET arena_id = ? WHERE oracle_id = ?");
  const updateArenaIdAll = db.transaction((entries: [string, number][]) => {
    for (const [oracleId, arenaId] of entries) {
      updateArenaId.run(arenaId, oracleId);
    }
  });
  const arenaIdEntries = [...arenaIdByOracle.entries()];
  updateArenaIdAll(arenaIdEntries);

  return {
    read,
    oraclesPriced: minByOracle.size,
    updated: entries.length,
    arenaCount: arenaByOracle.size,
    arenaIdCount: arenaIdByOracle.size,
  };
}
