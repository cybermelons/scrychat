/**
 * Pure, testable helpers for the linkify pass (issue #18). No SDK, no
 * network, no fs — everything here is a plain string transform, so it's
 * cheap to unit test and safe to call synchronously from server.ts.
 */

const TABLE_ROW_RE = /^\s*\|.*\|\s*$/m;
const BULLET_LIST_RE = /^\s*[-*+]\s+\S/m;
const NUMBERED_LIST_RE = /^\s*\d+[.)]\s+\S/m;

// Title-Case word runs, e.g. "Blood Artist", "Yahenni", "Skullclamp". Allows
// short connector words (of/the/and/a/to) inside a multi-word run so names
// like "Sword of Fire and Ice" are captured as one candidate. Also allows a
// comma before a subsequent word (e.g. "Yahenni, Undying Partisan"), so
// comma-separated legendary names stay in one run instead of splitting into
// two.
const TITLE_CASE_RUN_RE =
  /\b[A-Z][a-zA-Z'-]*(?:,?\s+(?:of|the|and|a|to|[A-Z][a-zA-Z'-]*))*/g;

// Bound worst-case cost: skip windowing runs longer than this many words, and
// stop enumerating candidate windows altogether once this many predicate-
// worthy candidates have been collected for a single text.
const MAX_RUN_WORDS_FOR_WINDOWING = 8;
const MAX_CANDIDATES_PER_TEXT = 200;

/**
 * Pull cheap candidate substrings out of free text that might be card names:
 * capitalized/Title-Case runs, tested as every contiguous word-window (not
 * just prefixes), so names sitting anywhere inside a run surface as
 * candidates — e.g. "Skullclamp" inside "run Skullclamp here.", "Blood
 * Artist" inside "Blood Artist is great", and "Skullclamp" inside "The
 * Skullclamp is amazing here." (a suffix window, not a prefix) — plus
 * anything already wrapped in [[...]]. Runs are short in practice, so
 * enumerating all O(n^2) windows is cheap; still capped defensively.
 */
function candidatePhrases(text: string): string[] {
  const out = new Set<string>();

  for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
    const inner = m[1]?.trim();
    if (inner) out.add(inner);
  }

  outer: for (const m of text.matchAll(TITLE_CASE_RUN_RE)) {
    const run = m[0].trim();
    if (!run) continue;
    const words = run.split(/\s+/);
    if (words.length > MAX_RUN_WORDS_FOR_WINDOWING) {
      // Too long to window exhaustively; still test the full run and
      // prefixes/suffixes of length 1 as a cheap fallback.
      out.add(words.join(" "));
      if (out.size >= MAX_CANDIDATES_PER_TEXT) break outer;
      continue;
    }
    // All contiguous word-windows: drop words from the front (suffixes) and
    // from the back (prefixes), so a name sitting anywhere inside the run —
    // not just as a leading prefix — is a candidate.
    for (let start = 0; start < words.length; start++) {
      for (let end = start + 1; end <= words.length; end++) {
        out.add(words.slice(start, end).join(" "));
        if (out.size >= MAX_CANDIDATES_PER_TEXT) break outer;
      }
    }
  }

  return [...out];
}

/**
 * Layer 2 cost gate: does `text` plausibly contain card names worth an
 * expensive Haiku pass? True if there's a markdown table row, a bulleted or
 * numbered list line (tabular/listy contexts are where bare names slip
 * through, per issue #12), or any candidate phrase in the text is a known
 * card name per `isKnownCardName`.
 */
export function hasKnownCardName(
  text: string,
  isKnownCardName: (name: string) => boolean
): boolean {
  if (TABLE_ROW_RE.test(text) || BULLET_LIST_RE.test(text) || NUMBERED_LIST_RE.test(text)) {
    return true;
  }
  return candidatePhrases(text).some((p) => isKnownCardName(p));
}

type TableRegion = { start: number; end: number }; // [start, end) line indices

function findTableRegions(lines: string[]): TableRegion[] {
  const regions: TableRegion[] = [];
  let i = 0;
  while (i < lines.length) {
    if (TABLE_ROW_RE.test(lines[i])) {
      const start = i;
      while (i < lines.length && TABLE_ROW_RE.test(lines[i])) i++;
      regions.push({ start, end: i });
    } else {
      i++;
    }
  }
  return regions;
}

function splitTableRow(line: string): string[] {
  // Strip one leading/trailing pipe (if present), then split on unescaped
  // pipes. Markdown tables in LLM output essentially never contain escaped
  // pipes, but guard anyway by not treating "\|" as a delimiter.
  let s = line.trim();
  if (s.startsWith("|")) s = s.slice(1);
  if (s.endsWith("|")) s = s.slice(0, -1);
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "\\" && s[i + 1] === "|") {
      current += "|";
      i++;
    } else if (s[i] === "|") {
      cells.push(current);
      current = "";
    } else {
      current += s[i];
    }
  }
  cells.push(current);
  return cells;
}

function isSeparatorRow(cells: string[], expectedCellCount: number): boolean {
  return (
    cells.length > 0 &&
    cells.length === expectedCellCount &&
    cells.every((c) => /^\s*:?-{1,}:?\s*$/.test(c))
  );
}

/**
 * Layer 3 deterministic pre-pass: wraps bare card names in `[[...]]`, but
 * ONLY inside the name column of markdown tables. Never touches prose or
 * non-name columns. Idempotent — cells already containing `[[` are left
 * alone, so running this twice is a no-op on the second pass.
 */
export function wrapTableNameCells(
  markdown: string,
  isKnownCardName: (name: string) => boolean
): string {
  const lines = markdown.split("\n");
  const regions = findTableRegions(lines);
  if (regions.length === 0) return markdown;

  const out = lines.slice();

  for (const region of regions) {
    const regionLines = lines.slice(region.start, region.end);
    if (regionLines.length < 2) continue; // need header + separator at minimum

    const headerCells = splitTableRow(regionLines[0]);
    const separatorCells = splitTableRow(regionLines[1]);
    // Separator row must have the same cell count as the header row — a
    // lone "| - |" (single-cell separator) under a multi-column header is
    // not a real table separator, just a pseudo-table that happens to match
    // the pipe-row regex.
    if (!isSeparatorRow(separatorCells, headerCells.length)) continue;

    let nameColIdx = headerCells.findIndex((c) =>
      ["card", "name", "card name"].includes(c.trim().toLowerCase())
    );
    if (nameColIdx === -1) nameColIdx = 0;

    for (let r = region.start + 2; r < region.end; r++) {
      const line = lines[r];
      const cells = splitTableRow(line);
      if (nameColIdx >= cells.length) continue;

      const cell = cells[nameColIdx];
      const trimmed = cell.trim();
      if (!trimmed || cell.includes("[[")) continue;
      if (!isKnownCardName(trimmed)) continue;

      // Preserve surrounding whitespace of the cell, wrap only the trimmed
      // content.
      const leadMatch = cell.match(/^\s*/);
      const trailMatch = cell.match(/\s*$/);
      const lead = leadMatch ? leadMatch[0] : "";
      const trail = trailMatch ? trailMatch[0] : "";
      cells[nameColIdx] = `${lead}[[${trimmed}]]${trail}`;

      out[r] = `|${cells.join("|")}|`;
    }
  }

  return out.join("\n");
}
