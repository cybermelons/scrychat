/**
 * Functional tag index loader/search.
 *
 * Backed by src/generated/tags.json (built by scripts/build-tag-index.ts from
 * Scryfall's oracle_tags bulk export). The JSON is loaded via fs.readFile
 * relative to this module's own location (import.meta.url) so it resolves
 * correctly both from src/ (tsx/vitest) and from the compiled dist/ output —
 * the build step copies generated/tags.json next to dist/tags.js so the
 * relative path ("./generated/tags.json") is identical in both trees.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getLocalDb, searchTagsLocal, getTagLocal } from "./local.js";

export interface TagEntry {
  slug: string;
  label: string;
  description: string | null;
  parents: string[];
  aliases: string[];
  count?: number;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TAGS_JSON_PATH = path.join(__dirname, "generated", "tags.json");

let cache: TagEntry[] | null = null;

async function loadTags(): Promise<TagEntry[]> {
  if (cache) return cache;
  const raw = await readFile(TAGS_JSON_PATH, "utf8");
  cache = JSON.parse(raw) as TagEntry[];
  return cache;
}

export interface TagSearchResult {
  slug: string;
  label: string;
  description: string | null;
  count?: number;
  parents: string[];
}

function toResult(entry: TagEntry): TagSearchResult {
  return {
    slug: entry.slug,
    label: entry.label,
    description: entry.description,
    count: entry.count,
    parents: entry.parents,
  };
}

/**
 * Case-insensitive substring/word match over slug, label, aliases,
 * description. Matches on slug/label (the "identity" fields) rank above
 * matches found only in aliases or description. Within a tier, entries are
 * sorted by member count descending so broad/common tags surface before
 * narrow leaf tags (e.g. "spot-removal" before "removal-battle").
 */
export async function searchTags(query: string, limit = 10): Promise<TagSearchResult[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const db = getLocalDb();
  if (db) {
    return searchTagsLocal(db, query, limit);
  }

  const entries = await loadTags();
  const scored: { entry: TagEntry; rank: number }[] = [];

  for (const entry of entries) {
    const slug = entry.slug.toLowerCase();
    const label = entry.label.toLowerCase();
    const aliases = entry.aliases.map((a) => a.toLowerCase());
    const description = (entry.description ?? "").toLowerCase();

    const primaryMatch = slug.includes(q) || label.includes(q);
    const aliasMatch = aliases.some((a) => a.includes(q));
    const descMatch = description.includes(q);

    if (!primaryMatch && !aliasMatch && !descMatch) continue;

    const rank = primaryMatch ? 0 : aliasMatch ? 1 : 2;
    scored.push({ entry, rank });
  }

  scored.sort(
    (a, b) =>
      a.rank - b.rank || (b.entry.count ?? 0) - (a.entry.count ?? 0) || a.entry.slug.localeCompare(b.entry.slug),
  );

  return scored.slice(0, limit).map((s) => toResult(s.entry));
}

export async function getTag(slug: string): Promise<TagSearchResult | null> {
  const db = getLocalDb();
  if (db) {
    return getTagLocal(db, slug);
  }

  const entries = await loadTags();
  const entry = entries.find((e) => e.slug === slug);
  return entry ? toResult(entry) : null;
}

/** Internal: exposed for alternatives.ts to do token-overlap candidate scoring. */
export async function allTags(): Promise<TagEntry[]> {
  return loadTags();
}
