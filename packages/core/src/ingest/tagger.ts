import fs from "node:fs/promises";
import type Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Scryfall oracle_tags bulk payload shape (see scripts/build-tag-index.ts for
// the fuller doc comment on the raw schema). We reuse the same filter rules
// here so `tags.is_functional` matches the generated tags.json index exactly.
// ---------------------------------------------------------------------------

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

// Functional-tag filter rules — kept in sync with scripts/build-tag-index.ts.
// Additionally drops "supercycle-*" (a known leak: set-supercycle groupings,
// not gameplay function, that slip past the cycle-* prefix filter there).
export const FUNCTIONAL_TAG_FILTERS: { label: string; test: (slug: string) => boolean }[] = [
  { label: "cycle-* (set/cycle groupings)", test: (s) => s.startsWith("cycle-") },
  { label: "supercycle-* (set/cycle groupings, leak)", test: (s) => s.startsWith("supercycle-") },
  { label: "*errata* (rules-text/type-line bookkeeping)", test: (s) => s.includes("errata") },
  { label: "*storyline-in-cards (flavor/story groupings)", test: (s) => s.endsWith("storyline-in-cards") },
  { label: "vanity-card (flavor, named after real people/things)", test: (s) => s === "vanity-card" },
];

function isFunctionalTag(slug: string): boolean {
  return !FUNCTIONAL_TAG_FILTERS.some((f) => f.test(slug));
}

const WEIGHT_TO_INT: Record<ScryfallTagging["weight"], number> = {
  median: 3,
  strong: 4,
  very_strong: 5,
};

export interface TagClosureRow {
  tag_id: string;
  ancestor_id: string;
}

/**
 * Materializes the tag_closure table: for every tag, all of its ANCESTORS
 * (walking parent_ids transitively), plus a self row (tag_id === ancestor_id).
 * Self rows are included deliberately so "descendants of X" queries can be
 * written as a single `WHERE ancestor_id = X` without a UNION for X itself.
 */
export function buildTagClosure(tagParents: Map<string, string[]>): TagClosureRow[] {
  const rows: TagClosureRow[] = [];
  const memo = new Map<string, Set<string>>();

  function ancestorsOf(tagId: string, stack: Set<string>): Set<string> {
    const cached = memo.get(tagId);
    if (cached) return cached;
    const result = new Set<string>();
    if (stack.has(tagId)) return result; // cycle guard
    stack.add(tagId);
    for (const parentId of tagParents.get(tagId) ?? []) {
      result.add(parentId);
      for (const grandAncestor of ancestorsOf(parentId, stack)) {
        result.add(grandAncestor);
      }
    }
    stack.delete(tagId);
    memo.set(tagId, result);
    return result;
  }

  for (const tagId of tagParents.keys()) {
    rows.push({ tag_id: tagId, ancestor_id: tagId }); // self row
    for (const ancestorId of ancestorsOf(tagId, new Set())) {
      rows.push({ tag_id: tagId, ancestor_id: ancestorId });
    }
  }

  return rows;
}

export interface IngestTaggerResult {
  tags: number;
  functionalTags: number;
  parents: number;
  aliases: number;
  closureRows: number;
  cardTags: number;
}

/**
 * Parses the oracle_tags bulk file at filePath and populates tags,
 * tag_parents, tag_aliases, tag_closure, and card_tags. Idempotent: deletes
 * existing source='tagger' rows first, all inside one transaction.
 */
export async function ingestTags(db: Database.Database, filePath: string): Promise<IngestTaggerResult> {
  const raw = await fs.readFile(filePath, "utf8");
  const rawTags = JSON.parse(raw) as ScryfallTag[];

  const functionalIds = new Set<string>();
  for (const t of rawTags) {
    if (isFunctionalTag(t.slug)) functionalIds.add(t.id);
  }

  const tagParents = new Map<string, string[]>(rawTags.map((t) => [t.id, t.parent_ids]));
  const closureRows = buildTagClosure(tagParents);

  const run = db.transaction(() => {
    db.prepare(`DELETE FROM card_tags WHERE source = 'tagger'`).run();
    db.prepare(`DELETE FROM tag_closure WHERE tag_id IN (SELECT id FROM tags WHERE source = 'tagger')`).run();
    db.prepare(`DELETE FROM tag_aliases WHERE tag_id IN (SELECT id FROM tags WHERE source = 'tagger')`).run();
    db.prepare(`DELETE FROM tag_parents WHERE tag_id IN (SELECT id FROM tags WHERE source = 'tagger')`).run();
    db.prepare(`DELETE FROM tags WHERE source = 'tagger'`).run();

    const insertTag = db.prepare(`
      INSERT INTO tags (id, slug, label, description, is_functional, source)
      VALUES (@id, @slug, @label, @description, @is_functional, 'tagger')
    `);
    const insertParent = db.prepare(`
      INSERT OR IGNORE INTO tag_parents (tag_id, parent_id) VALUES (?, ?)
    `);
    const insertAlias = db.prepare(`
      INSERT OR IGNORE INTO tag_aliases (alias, tag_id) VALUES (?, ?)
    `);
    const insertClosure = db.prepare(`
      INSERT OR IGNORE INTO tag_closure (tag_id, ancestor_id) VALUES (?, ?)
    `);
    const insertCardTag = db.prepare(`
      INSERT OR IGNORE INTO card_tags (oracle_id, tag_id, weight, source)
      VALUES (?, ?, ?, 'tagger')
    `);

    let functionalTags = 0;
    let parents = 0;
    let aliases = 0;
    let cardTags = 0;

    for (const t of rawTags) {
      const isFunctional = functionalIds.has(t.id);
      if (isFunctional) functionalTags++;
      insertTag.run({
        id: t.id,
        slug: t.slug,
        label: t.label,
        description: t.description,
        is_functional: isFunctional ? 1 : 0,
      });

      for (const parentId of t.parent_ids) {
        insertParent.run(t.id, parentId);
        parents++;
      }

      for (const alias of t.aliases) {
        insertAlias.run(alias, t.id);
        aliases++;
      }

      if (isFunctional) {
        for (const tagging of t.taggings ?? []) {
          insertCardTag.run(tagging.oracle_id, t.id, WEIGHT_TO_INT[tagging.weight] ?? 1);
          cardTags++;
        }
      }
    }

    for (const row of closureRows) {
      insertClosure.run(row.tag_id, row.ancestor_id);
    }

    return { tags: rawTags.length, functionalTags, parents, aliases, closureRows: closureRows.length, cardTags };
  });

  return run();
}
