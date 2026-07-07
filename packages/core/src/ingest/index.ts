import { openDb, setMeta } from "../db/connection.js";
import { downloadBulk } from "./download.js";
import { ingestCards } from "./cards.js";
import { ingestPrices } from "./prices.js";
import { ingestTags } from "./tagger.js";
import { downloadVariants, ingestCombos } from "./spellbook.js";

function parseFlags(argv: string[]): { cards: boolean; prices: boolean; tags: boolean; combos: boolean } {
  const hasCards = argv.includes("--cards");
  const hasPrices = argv.includes("--prices");
  const hasTags = argv.includes("--tags");
  const hasCombos = argv.includes("--combos");
  const hasAll = argv.includes("--all") || (!hasCards && !hasPrices && !hasTags && !hasCombos);
  return { cards: hasCards || hasAll, prices: hasPrices || hasAll, tags: hasTags || hasAll, combos: hasCombos || hasAll };
}

async function main(): Promise<void> {
  const flags = parseFlags(process.argv.slice(2));
  const db = openDb();

  try {
    if (flags.cards) {
      const t0 = Date.now();
      console.log("[ingest] downloading oracle-cards...");
      const dl = await downloadBulk("oracle_cards");
      console.log(
        `[ingest] oracle-cards ${dl.skipped ? "unchanged, reusing cached file" : "downloaded"} (updated_at=${dl.updatedAt})`,
      );

      console.log("[ingest] parsing + inserting cards...");
      const result = await ingestCards(db, dl.path);
      setMeta(db, "oracle_cards_updated_at", dl.updatedAt);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(
        `[ingest] cards done in ${secs}s: read=${result.read} inserted=${result.inserted} skipped=${result.skipped}`,
      );
    }

    if (flags.tags) {
      const t0 = Date.now();
      console.log("[ingest] downloading oracle-tags...");
      const dl = await downloadBulk("oracle_tags");
      console.log(
        `[ingest] oracle-tags ${dl.skipped ? "unchanged, reusing cached file" : "downloaded"} (updated_at=${dl.updatedAt})`,
      );

      console.log("[ingest] parsing + inserting tags...");
      const result = await ingestTags(db, dl.path);
      setMeta(db, "oracle_tags_updated_at", dl.updatedAt);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(
        `[ingest] tags done in ${secs}s: tags=${result.tags} functional=${result.functionalTags} parents=${result.parents} aliases=${result.aliases} closureRows=${result.closureRows} cardTags=${result.cardTags}`,
      );
    }

    if (flags.prices) {
      const t0 = Date.now();
      console.log("[ingest] downloading default-cards...");
      const dl = await downloadBulk("default_cards");
      console.log(
        `[ingest] default-cards ${dl.skipped ? "unchanged, reusing cached file" : "downloaded"} (updated_at=${dl.updatedAt})`,
      );

      console.log("[ingest] parsing + computing min prices...");
      const result = await ingestPrices(db, dl.path);
      setMeta(db, "default_cards_updated_at", dl.updatedAt);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(
        `[ingest] prices done in ${secs}s: read=${result.read} oraclesPriced=${result.oraclesPriced} updated=${result.updated}`,
      );
    }

    if (flags.combos) {
      const t0 = Date.now();
      const force = process.argv.includes("--force");
      console.log("[ingest] downloading variants.json...");
      const dl = await downloadVariants(force);
      console.log(`[ingest] variants.json ${dl.skipped ? "unchanged, reusing cached file" : "downloaded"}`);

      console.log("[ingest] parsing + inserting combos...");
      const result = await ingestCombos(db, dl.path);
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      console.log(
        `[ingest] combos done in ${secs}s: read=${result.read} inserted=${result.inserted} skipped=${result.skipped}`,
      );
    }
  } finally {
    db.close();
  }
}

main().catch((err) => {
  console.error("[ingest] failed:", err);
  process.exitCode = 1;
});
