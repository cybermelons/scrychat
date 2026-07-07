import fs from "node:fs";
import path from "node:path";
import { pipeline as streamPipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import Chain from "stream-chain";
import Parser from "stream-json";
import Pick from "stream-json/filters/Pick.js";
import StreamArray from "stream-json/streamers/StreamArray.js";
import type Database from "better-sqlite3";
import { REPO_ROOT } from "../db/connection.js";

const USER_AGENT = "scrychat/0.1";
const VARIANTS_URL = "https://json.commanderspellbook.com/variants.json";
const DOWNLOADS_DIR = path.join(REPO_ROOT, "data", "downloads");
const DEST = path.join(DOWNLOADS_DIR, "variants.json");
const STAMP = path.join(DOWNLOADS_DIR, "variants.etag");

const CI_BITS: Record<string, number> = { W: 1, U: 2, B: 4, R: 8, G: 16 };

interface Variant {
  id: string;
  status: string;
  identity?: string;
  uses?: { card?: { oracleId?: string } }[];
  produces?: { feature?: { name?: string } }[];
  description?: string;
  popularity?: number | null;
  prices?: Record<string, string | null | undefined>;
}

function identityMask(identity: string | undefined): number {
  if (!identity) return 0;
  let mask = 0;
  for (const c of identity) {
    mask |= CI_BITS[c] ?? 0;
  }
  return mask;
}

function resolvePrice(prices: Variant["prices"]): number | null {
  const raw = prices?.tcgplayer ?? prices?.cardkingdom ?? prices?.cardmarket;
  if (raw == null) return null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

export interface DownloadVariantsResult {
  path: string;
  skipped: boolean;
}

/**
 * Downloads the Commander Spellbook variants export (uncompressed, ~500MB+)
 * to data/downloads/variants.json, streaming straight to disk. Uses the
 * response ETag as a cheap freshness stamp to skip re-download; pass
 * force=true to bypass.
 */
export async function downloadVariants(force = false): Promise<DownloadVariantsResult> {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

  const head = await fetch(VARIANTS_URL, { method: "HEAD", headers: { "User-Agent": USER_AGENT } });
  if (!head.ok) {
    throw new Error(`variants.json HEAD failed: ${head.status} ${head.statusText}`);
  }
  const etag = head.headers.get("etag");
  const previous = fs.existsSync(STAMP) ? fs.readFileSync(STAMP, "utf8").trim() : null;

  if (!force && etag && previous === etag && fs.existsSync(DEST)) {
    return { path: DEST, skipped: true };
  }

  const res = await fetch(VARIANTS_URL, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok || !res.body) {
    throw new Error(`variants.json download failed: ${res.status} ${res.statusText}`);
  }

  const tmpDest = `${DEST}.part`;
  await streamPipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(tmpDest));
  fs.renameSync(tmpDest, DEST);
  if (etag) fs.writeFileSync(STAMP, etag);

  return { path: DEST, skipped: false };
}

export interface IngestCombosResult {
  read: number;
  skipped: number;
  inserted: number;
}

/**
 * Streams the variants.json export into combos + combo_cards + combo_produces
 * inside a single transaction. Deletes all existing rows first (idempotent
 * full refresh). Only status "OK" variants with every uses[].card.oracleId
 * present are ingested.
 */
export async function ingestCombos(db: Database.Database, filePath: string): Promise<IngestCombosResult> {
  const insertCombo = db.prepare(`
    INSERT INTO combos (id, identity, ci_mask, status, description, card_count, popularity, price_usd)
    VALUES (@id, @identity, @ci_mask, @status, @description, @card_count, @popularity, @price_usd)
  `);
  const insertComboCard = db.prepare(`INSERT INTO combo_cards (combo_id, oracle_id) VALUES (?, ?)`);
  const insertProduces = db.prepare(`INSERT INTO combo_produces (combo_id, feature) VALUES (?, ?)`);

  let read = 0;
  let skipped = 0;
  let inserted = 0;

  const clearAll = db.transaction(() => {
    db.exec("DELETE FROM combo_produces");
    db.exec("DELETE FROM combo_cards");
    db.exec("DELETE FROM combos");
  });
  clearAll();

  const insertOne = db.transaction((variant: Variant, oracleIds: string[]) => {
    const produces = variant.produces?.map((p) => p.feature?.name).filter((n): n is string => !!n) ?? [];
    insertCombo.run({
      id: variant.id,
      identity: variant.identity ?? null,
      ci_mask: identityMask(variant.identity),
      status: variant.status,
      description: variant.description?.trim() || produces.join(", ") || null,
      card_count: oracleIds.length,
      popularity: variant.popularity ?? null,
      price_usd: resolvePrice(variant.prices),
    });
    for (const oracleId of oracleIds) {
      insertComboCard.run(variant.id, oracleId);
    }
    for (const feature of produces) {
      insertProduces.run(variant.id, feature);
    }
    inserted++;
  });

  const pipeline = Chain.chain([
    fs.createReadStream(filePath),
    Parser.parser(),
    Pick.pick({ filter: "variants" }),
    StreamArray.streamArray(),
  ]);

  await new Promise<void>((resolve, reject) => {
    pipeline.on("data", ({ value }: { value: Variant }) => {
      read++;
      if (value.status !== "OK") {
        skipped++;
        return;
      }
      const oracleIds: string[] = [];
      for (const use of value.uses ?? []) {
        const oracleId = use.card?.oracleId;
        if (!oracleId) {
          oracleIds.length = 0;
          break;
        }
        oracleIds.push(oracleId);
      }
      if (oracleIds.length === 0) {
        skipped++;
        return;
      }
      insertOne(value, oracleIds);
    });
    pipeline.on("end", resolve);
    pipeline.on("error", reject);
  });

  return { read, skipped, inserted };
}
