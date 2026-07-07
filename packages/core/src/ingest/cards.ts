import fs from "node:fs";
import Chain from "stream-chain";
import Parser from "stream-json";
import StreamArray from "stream-json/streamers/StreamArray.js";
import type Database from "better-sqlite3";

const SKIP_LAYOUTS = new Set([
  "art_series",
  "token",
  "double_faced_token",
  "emblem",
  "planar",
  "scheme",
  "vanguard",
]);

const CI_BITS: Record<string, number> = { W: 1, U: 2, B: 4, R: 8, G: 16 };

interface ScryfallCardFace {
  oracle_text?: string;
  image_uris?: { normal?: string };
}

interface ScryfallCard {
  oracle_id?: string;
  name: string;
  mana_cost?: string;
  cmc?: number;
  type_line?: string;
  oracle_text?: string;
  colors?: string[];
  color_identity?: string[];
  power?: string;
  toughness?: string;
  keywords?: string[];
  layout: string;
  legalities?: { commander?: string };
  rarity?: string;
  edhrec_rank?: number;
  prices?: { usd?: string | null };
  image_uris?: { normal?: string };
  card_faces?: ScryfallCardFace[];
  scryfall_uri?: string;
}

function colorIdentityMask(identity: string[] | undefined): number {
  if (!identity) return 0;
  let mask = 0;
  for (const c of identity) {
    mask |= CI_BITS[c] ?? 0;
  }
  return mask;
}

function isCommanderType(card: ScryfallCard): boolean {
  const typeLine = card.type_line ?? "";
  if (typeLine.includes("Legendary") && typeLine.includes("Creature")) return true;
  const text =
    card.oracle_text ?? card.card_faces?.map((f) => f.oracle_text ?? "").join(" // ") ?? "";
  return text.includes("can be your commander");
}

function resolveOracleText(card: ScryfallCard): string | null {
  if (card.oracle_text) return card.oracle_text;
  if (card.card_faces) {
    return card.card_faces.map((f) => f.oracle_text ?? "").join(" // ");
  }
  return null;
}

function resolveImage(card: ScryfallCard): string | null {
  if (card.image_uris?.normal) return card.image_uris.normal;
  if (card.card_faces?.[0]?.image_uris?.normal) return card.card_faces[0].image_uris!.normal!;
  return null;
}

export interface IngestCardsResult {
  read: number;
  skipped: number;
  inserted: number;
}

/**
 * Streams the oracle-cards bulk file at filePath into the cards + cards_fts
 * tables inside a single transaction. Rows are deduped by oracle_id (the
 * oracle-cards dump is already one row per oracle card, but some layouts we
 * skip can share oracle_id with other rows, and defensively we keep the
 * first one seen).
 */
export async function ingestCards(db: Database.Database, filePath: string): Promise<IngestCardsResult> {
  const insertCard = db.prepare(`
    INSERT INTO cards (
      oracle_id, name, mana_cost, cmc, type_line, oracle_text, colors, color_identity,
      ci_mask, power, toughness, keywords, layout, is_commander, legal_commander,
      rarity, edhrec_rank, price_usd, image, scryfall_uri
    ) VALUES (
      @oracle_id, @name, @mana_cost, @cmc, @type_line, @oracle_text, @colors, @color_identity,
      @ci_mask, @power, @toughness, @keywords, @layout, @is_commander, @legal_commander,
      @rarity, @edhrec_rank, @price_usd, @image, @scryfall_uri
    )
    ON CONFLICT(oracle_id) DO UPDATE SET
      name=excluded.name, mana_cost=excluded.mana_cost, cmc=excluded.cmc,
      type_line=excluded.type_line, oracle_text=excluded.oracle_text, colors=excluded.colors,
      color_identity=excluded.color_identity, ci_mask=excluded.ci_mask, power=excluded.power,
      toughness=excluded.toughness, keywords=excluded.keywords, layout=excluded.layout,
      is_commander=excluded.is_commander, legal_commander=excluded.legal_commander,
      rarity=excluded.rarity, edhrec_rank=excluded.edhrec_rank, price_usd=excluded.price_usd,
      image=excluded.image, scryfall_uri=excluded.scryfall_uri
  `);

  const insertFts = db.prepare(`
    INSERT INTO cards_fts (rowid, name, type_line, oracle_text)
    SELECT rowid, name, type_line, oracle_text FROM cards WHERE oracle_id = ?
  `);
  const deleteFts = db.prepare(`
    DELETE FROM cards_fts WHERE rowid IN (SELECT rowid FROM cards WHERE oracle_id = ?)
  `);

  const seen = new Set<string>();
  let read = 0;
  let skipped = 0;
  let inserted = 0;

  const pipeline = Chain.chain([
    fs.createReadStream(filePath),
    Parser.parser(),
    StreamArray.streamArray(),
  ]);

  const insertOne = db.transaction((card: ScryfallCard) => {
    const oracleId = card.oracle_id!;
    deleteFts.run(oracleId);
    insertCard.run({
      oracle_id: oracleId,
      name: card.name,
      mana_cost: card.mana_cost ?? null,
      cmc: card.cmc ?? null,
      type_line: card.type_line ?? null,
      oracle_text: resolveOracleText(card),
      colors: card.colors ? JSON.stringify(card.colors) : null,
      color_identity: card.color_identity ? JSON.stringify(card.color_identity) : null,
      ci_mask: colorIdentityMask(card.color_identity),
      power: card.power ?? null,
      toughness: card.toughness ?? null,
      keywords: card.keywords ? JSON.stringify(card.keywords) : null,
      layout: card.layout,
      is_commander: isCommanderType(card) ? 1 : 0,
      legal_commander: card.legalities?.commander === "legal" ? 1 : 0,
      rarity: card.rarity ?? null,
      edhrec_rank: card.edhrec_rank ?? null,
      price_usd: null,
      image: resolveImage(card),
      scryfall_uri: card.scryfall_uri ?? null,
    });
    insertFts.run(oracleId);
    inserted++;
  });

  await new Promise<void>((resolve, reject) => {
    pipeline.on("data", ({ value }: { value: ScryfallCard }) => {
      read++;
      if (!value.oracle_id || SKIP_LAYOUTS.has(value.layout) || seen.has(value.oracle_id)) {
        skipped++;
        return;
      }
      seen.add(value.oracle_id);
      insertOne(value);
    });
    pipeline.on("end", resolve);
    pipeline.on("error", reject);
  });

  return { read, skipped, inserted };
}
