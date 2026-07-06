#!/usr/bin/env tsx
/**
 * Builds the functional tag index from Scryfall's oracle_tags bulk export.
 *
 * Regenerate with:
 *   pnpm --filter @scrychat/core build-tag-index
 *
 * Outputs:
 *   - packages/core/src/generated/tags.json               (runtime tag metadata index)
 *   - .claude/skills/edh-deck-builder/references/functional-tags.md  (greppable reference)
 *
 * Scryfall requires a real User-Agent + Accept header on every request or it
 * returns 403. The oracle-tags download is gzip-compressed even though its
 * URL ends in `.json` (content-encoding: gzip, magic bytes 1f 8b) so we always
 * decompress via zlib.gunzip regardless of URL extension, gated on the magic
 * bytes / content-encoding header.
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CORE_ROOT = path.resolve(__dirname, "..");
const DOWNLOAD_DIR = path.join(CORE_ROOT, "data", "downloads");
const RAW_FILE = path.join(DOWNLOAD_DIR, "oracle-tags.json");
const STAMP_FILE = path.join(DOWNLOAD_DIR, "oracle-tags.updated_at");
const TAGS_JSON_OUT = path.join(CORE_ROOT, "src", "generated", "tags.json");
const FUNCTIONAL_TAGS_MD_OUT = path.resolve(
  CORE_ROOT,
  "../../.claude/skills/edh-deck-builder/references/functional-tags.md",
);

const SCRYFALL_HEADERS = {
  "User-Agent": "scrychat/0.1",
  Accept: "application/json",
} as const;

const BULK_DATA_URL = "https://api.scryfall.com/bulk-data";

// ---------------------------------------------------------------------------
// Scryfall bulk-data / oracle_tags schema (as observed 2026-07-05)
// ---------------------------------------------------------------------------
// GET https://api.scryfall.com/bulk-data returns { data: BulkDataEntry[] }.
// The entry with type "oracle_tags" has a `download_uri` pointing at a JSON
// array of tag objects shaped like:
//
// {
//   object: "tag",
//   id: string (uuid),
//   label: string,
//   slug: string,
//   type: "oracle",              // (art_tags export uses "illustration" instead)
//   uri: string,
//   description: string | null,
//   parent_ids: string[],        // UUIDs of parent tags (NOT slugs)
//   child_ids: string[],         // UUIDs of child tags
//   aliases: string[],
//   taggings: { oracle_id: string, weight: "median"|"strong"|"very_strong", annotation?: string }[]
// }
//
// Hierarchy is expressed via parent_ids/child_ids as UUIDs, so slugs for
// parents must be resolved through an id -> slug map built from the full set.

interface ScryfallBulkDataEntry {
  object: string;
  id: string;
  type: string;
  updated_at: string;
  download_uri: string;
  content_type: string;
  content_encoding?: string;
}

interface ScryfallBulkDataResponse {
  object: string;
  data: ScryfallBulkDataEntry[];
}

interface ScryfallTagging {
  oracle_id: string;
  weight: "median" | "strong" | "very_strong";
  annotation?: string;
}

interface ScryfallTag {
  object: "tag";
  id: string;
  label: string;
  slug: string;
  type: string;
  uri: string;
  description: string | null;
  parent_ids: string[];
  child_ids: string[];
  aliases: string[];
  taggings: ScryfallTagging[];
}

export interface TagIndexEntry {
  slug: string;
  label: string;
  description: string | null;
  parents: string[];
  aliases: string[];
  count?: number;
}

// ---------------------------------------------------------------------------
// Functional-tag filter rules (auditable — edit here to change what's kept)
// ---------------------------------------------------------------------------
// Drops:
//  - "cycle-*"           set/cycle groupings (e.g. cycle-unk-vegas), not gameplay function
//  - "*errata*"           rules-text/type-line errata bookkeeping (token-errata, type-errata-*, keyword-errata)
//  - "*storyline-in-cards" flavor/story-name groupings (marvel-storyline-name, sth-storyline-in-cards, ...)
//  - "vanity-card"         cards named after real people/things (flavor, not function)
export const FUNCTIONAL_TAG_FILTERS: { label: string; test: (slug: string) => boolean }[] = [
  { label: "cycle-* (set/cycle groupings)", test: (s) => s.startsWith("cycle-") },
  { label: "*errata* (rules-text/type-line bookkeeping)", test: (s) => s.includes("errata") },
  { label: "*storyline-in-cards (flavor/story groupings)", test: (s) => s.endsWith("storyline-in-cards") },
  { label: "vanity-card (flavor, named after real people/things)", test: (s) => s === "vanity-card" },
];

function isFunctionalTag(slug: string): boolean {
  return !FUNCTIONAL_TAG_FILTERS.some((f) => f.test(slug));
}

// ---------------------------------------------------------------------------

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: SCRYFALL_HEADERS });
  if (!res.ok) {
    throw new Error(`Request to ${url} failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

async function downloadOracleTagsPayload(entry: ScryfallBulkDataEntry): Promise<Buffer> {
  const res = await fetch(entry.download_uri, { headers: SCRYFALL_HEADERS });
  if (!res.ok) {
    throw new Error(`Download of ${entry.download_uri} failed: ${res.status} ${res.statusText}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const buf = Buffer.from(arrayBuffer);

  const isGzipMagic = buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b;
  const contentEncoding = res.headers.get("content-encoding");
  if (isGzipMagic || contentEncoding === "gzip") {
    return gunzipSync(buf);
  }
  return buf;
}

async function ensureOracleTagsDownloaded(): Promise<ScryfallTag[]> {
  await mkdir(DOWNLOAD_DIR, { recursive: true });

  const bulkData = await fetchJson<ScryfallBulkDataResponse>(BULK_DATA_URL);
  const entry = bulkData.data.find((d) => d.type === "oracle_tags");
  if (!entry) {
    throw new Error("No oracle_tags entry found in Scryfall bulk-data response");
  }

  const stampMatches =
    existsSync(RAW_FILE) &&
    existsSync(STAMP_FILE) &&
    (await readFile(STAMP_FILE, "utf8")).trim() === entry.updated_at;

  if (stampMatches) {
    console.log(`[build-tag-index] Cached download up to date (updated_at=${entry.updated_at}), skipping fetch.`);
  } else {
    console.log(`[build-tag-index] Downloading oracle_tags from ${entry.download_uri} ...`);
    const raw = await downloadOracleTagsPayload(entry);
    await writeFile(RAW_FILE, raw);
    await writeFile(STAMP_FILE, entry.updated_at, "utf8");
    console.log(`[build-tag-index] Saved ${raw.byteLength} bytes to ${RAW_FILE}`);
  }

  const parsed = JSON.parse(await readFile(RAW_FILE, "utf8")) as ScryfallTag[];
  return parsed;
}

function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).trimEnd()}…`;
}

function buildMarkdown(entries: TagIndexEntry[]): string {
  const bySlug = new Map(entries.map((e) => [e.slug, e]));

  // Group under top-level category headings: a tag with no parents is itself
  // a top-level heading; its descendants (by parent slug, one level deep is
  // enough for a flat greppable reference) are listed under it. Tags whose
  // parent was filtered out (e.g. parent was a dropped errata/cycle tag) are
  // treated as top-level too, so nothing silently disappears.
  const topLevel = entries.filter((e) => e.parents.length === 0 || !e.parents.some((p) => bySlug.has(p)));
  const childrenByParent = new Map<string, TagIndexEntry[]>();
  for (const e of entries) {
    for (const p of e.parents) {
      if (!bySlug.has(p)) continue;
      if (!childrenByParent.has(p)) childrenByParent.set(p, []);
      childrenByParent.get(p)!.push(e);
    }
  }

  const lines: string[] = [];
  lines.push("# Functional Tags Reference");
  lines.push("");
  lines.push(
    "Generated from Scryfall's oracle_tags bulk export. Do not hand-edit — regenerate with:",
  );
  lines.push("");
  lines.push("```");
  lines.push("pnpm --filter @scrychat/core build-tag-index");
  lines.push("```");
  lines.push("");
  lines.push(
    "Each line: `slug | label | count | parent | description`. `count` is the number of cards tagged (from the bulk export's per-card taggings). `parent` is the immediate parent slug, or `-` for top-level tags.",
  );
  lines.push("");

  const sortedTopLevel = [...topLevel].sort((a, b) => a.slug.localeCompare(b.slug));
  for (const top of sortedTopLevel) {
    lines.push(`## ${top.label} (\`${top.slug}\`)`);
    lines.push("");
    const rowsForHeading = [top, ...(childrenByParent.get(top.slug) ?? [])].sort((a, b) =>
      a.slug.localeCompare(b.slug),
    );
    for (const e of rowsForHeading) {
      const parentSlug = e.slug === top.slug ? "-" : top.slug;
      const count = e.count ?? "-";
      const desc = e.description ? truncate(e.description, 120) : "-";
      lines.push(`${e.slug} | ${e.label} | ${count} | ${parentSlug} | ${desc}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  const rawTags = await ensureOracleTagsDownloaded();
  console.log(`[build-tag-index] Loaded ${rawTags.length} raw tags`);

  const idToSlug = new Map(rawTags.map((t) => [t.id, t.slug]));

  const kept: ScryfallTag[] = [];
  const dropped: ScryfallTag[] = [];
  for (const tag of rawTags) {
    if (isFunctionalTag(tag.slug)) {
      kept.push(tag);
    } else {
      dropped.push(tag);
    }
  }

  const entries: TagIndexEntry[] = kept
    .map((t) => {
      const entry: TagIndexEntry = {
        slug: t.slug,
        label: t.label,
        description: t.description,
        parents: t.parent_ids.map((id) => idToSlug.get(id)).filter((s): s is string => Boolean(s)),
        aliases: t.aliases,
      };
      if (t.taggings) {
        entry.count = t.taggings.length;
      }
      return entry;
    })
    .sort((a, b) => a.slug.localeCompare(b.slug));

  await mkdir(path.dirname(TAGS_JSON_OUT), { recursive: true });
  await writeFile(TAGS_JSON_OUT, `${JSON.stringify(entries, null, 2)}\n`, "utf8");
  console.log(`[build-tag-index] Wrote ${entries.length} tags to ${TAGS_JSON_OUT}`);

  await mkdir(path.dirname(FUNCTIONAL_TAGS_MD_OUT), { recursive: true });
  const md = buildMarkdown(entries);
  await writeFile(FUNCTIONAL_TAGS_MD_OUT, md, "utf8");
  console.log(`[build-tag-index] Wrote markdown reference to ${FUNCTIONAL_TAGS_MD_OUT}`);

  console.log(
    `[build-tag-index] Kept ${kept.length} functional tags, dropped ${dropped.length} (of ${rawTags.length} total)`,
  );
  for (const filter of FUNCTIONAL_TAG_FILTERS) {
    const n = rawTags.filter((t) => filter.test(t.slug)).length;
    console.log(`[build-tag-index]   - ${filter.label}: ${n} dropped`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
