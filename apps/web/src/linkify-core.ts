/**
 * Pure, testable helpers for the linkify pass (issue #18). No SDK, no
 * network, no fs — everything here is a plain string transform, so it's
 * cheap to unit test and safe to call synchronously from server.ts.
 */

const TABLE_ROW_RE = /^\s*\|.*\|\s*$/m;
const BULLET_LIST_RE = /^\s*[-*+]\s+\S/m;
const NUMBERED_LIST_RE = /^\s*\d+[.)]\s+\S/m;

/** Escape a string for safe interpolation into a RegExp source. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

  // Windows every contiguous word-window of `segment` into `out`. Returns
  // false once the global candidate cap is hit (caller must stop).
  const windowSegment = (segment: string): boolean => {
    const trimmed = segment.trim();
    if (!trimmed) return true;
    const words = trimmed.split(/\s+/);
    if (words.length > MAX_RUN_WORDS_FOR_WINDOWING) {
      // Too long to window exhaustively; still test the full segment as a
      // cheap fallback.
      out.add(words.join(" "));
      return out.size < MAX_CANDIDATES_PER_TEXT;
    }
    // All contiguous word-windows: drop words from the front (suffixes) and
    // from the back (prefixes), so a name sitting anywhere inside the run —
    // not just as a leading prefix — is a candidate.
    for (let start = 0; start < words.length; start++) {
      for (let end = start + 1; end <= words.length; end++) {
        out.add(words.slice(start, end).join(" "));
        if (out.size >= MAX_CANDIDATES_PER_TEXT) return false;
      }
    }
    return true;
  };

  outer: for (const m of text.matchAll(TITLE_CASE_RUN_RE)) {
    const run = m[0].trim();
    if (!run) continue;

    // Window the raw run first: comma-carrying names like "Yahenni, Undying
    // Partisan" only surface from raw-run windows (the comma split below
    // would sever them).
    if (!windowSegment(run)) break outer;

    // ALSO split the run on commas and window each trimmed sub-segment. A
    // comma-separated list of names ("Viscera Seer, Carrion Feeder, Altar of
    // Dementia") matches TITLE_CASE_RUN_RE as ONE run whose raw whitespace-
    // split windows keep trailing commas on words ("Seer," / "Feeder,"), so
    // joined windows like "Viscera Seer," fail exact-match validation while
    // a bare inner word ("Carrion") validates and gets mis-wrapped inside
    // the longer name. Comma-split sub-segments yield the clean full names.
    if (run.includes(",")) {
      for (const segment of run.split(",")) {
        if (!windowSegment(segment)) break outer;
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

/**
 * Word-boundary-anchored, longest-first, idempotent bare-name wrapper. Given
 * a list of DB-validated card names, wraps every bare (unbracketed)
 * occurrence of each name in `[[...]]`. Leaves `[[..]]`, `![[..]]`, and
 * `[[group:..]]` spans untouched (never matches inside an existing bracket
 * pair, and never re-wraps something already wrapped). Longest names are
 * matched first so a shorter name that is a substring of a longer one (e.g.
 * "Opt" inside a hypothetical "Opt of Fire") never steals the match.
 */
export function wrapNamesInText(
  text: string,
  names: string[],
  isKnownCardName: (name: string) => boolean
): string {
  const uniqueNames = [...new Set(names.map((n) => n.trim()).filter(Boolean))].filter((n) =>
    isKnownCardName(n)
  );
  if (uniqueNames.length === 0) return text;

  // Longest first (by character length) so overlapping/substring names don't
  // shadow the longer, more specific match.
  uniqueNames.sort((a, b) => b.length - a.length);

  // Claim-interval algorithm: every match decision is made against the
  // ORIGINAL text offsets, and the output is built in one splice pass at the
  // end. This is what makes overlap handling correct — a naive sequential
  // per-name String.replace mutates the string as it goes, so a shorter name
  // (e.g. "Remembrance") could later match INSIDE the brackets of a longer
  // name ("Bastion of Remembrance") just inserted, producing nested
  // "[[Bastion of [[Remembrance]]]]" wraps.

  type Range = { start: number; end: number }; // [start, end)
  const overlaps = (start: number, end: number, r: Range) => start < r.end && end > r.start;

  // Anything already inside [[...]], ![[...]], or [[group:...]] is
  // pre-claimed: matches overlapping those spans are rejected, which keeps
  // the function idempotent.
  const claimed: Range[] = [];
  for (const m of text.matchAll(/!?\[\[[^\]]*\]\]/g)) {
    claimed.push({ start: m.index!, end: m.index! + m[0].length });
  }

  const inserts: Range[] = [];
  for (const name of uniqueNames) {
    const re = new RegExp(`\\b${escapeRegExp(name)}\\b`, "g");
    for (const m of text.matchAll(re)) {
      const start = m.index!;
      const end = start + m[0].length;
      if (claimed.some((r) => overlaps(start, end, r))) continue;
      claimed.push({ start, end });
      inserts.push({ start, end });
    }
  }
  if (inserts.length === 0) return text;

  inserts.sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  for (const { start, end } of inserts) {
    out += `${text.slice(cursor, start)}[[${text.slice(start, end)}]]`;
    cursor = end;
  }
  out += text.slice(cursor);
  return out;
}

// ~90 lowercased common English words that also happen to be real MTG card
// names. A DB-validated single-word candidate is treated as AMBIGUOUS (needs
// Haiku span-verdict) iff its lowercase form is in this set — everything
// else (multi-word names, or single words not in this list) is UNAMBIGUOUS
// and safe to auto-wrap deterministically. When unsure whether a word reads
// as "common English", err toward INCLUDING it here (escalate to Haiku
// rather than risk mis-auto-wrapping ordinary prose).
export const AMBIGUOUS_WORDLIST: ReadonlySet<string> = new Set([
  // the five basic land names — real cards AND ultra-common English words
  "island",
  "mountain",
  "forest",
  "plains",
  "swamp",
  "fear",
  "balance",
  "damn",
  "stasis",
  "opt",
  "fog",
  "counterspell",
  "anger",
  "arena",
  "wish",
  "gnaw",
  "brainstorm",
  "ponder",
  "negate",
  "dismiss",
  "duress",
  "thoughtseize",
  "regrowth",
  "growth",
  "harmony",
  "control",
  "dominate",
  "banish",
  "exhaustion",
  "fireball",
  "shock",
  "doom",
  "plague",
  "brutality",
  "cultivate",
  "terror",
  "murder",
  "opportunity",
  "dictate",
  "revival",
  "unearth",
  "cremate",
  "animate",
  "reanimate",
  "entomb",
  "rest",
  "meditate",
  "contemplate",
  "guidance",
  "insight",
  "foresight",
  "prophecy",
  "augury",
  "portent",
  "omen",
  "glimpse",
  "peek",
  "reveal",
  "expose",
  "exile",
  "banishment",
  "corruption",
  "despair",
  "torment",
  "agony",
  "anguish",
  "misery",
  "sorrow",
  "vengeance",
  "wrath",
  "fury",
  "rage",
  "frenzy",
  "havoc",
  "chaos",
  "discord",
  "disorder",
  "confusion",
  "distortion",
  "warp",
  "shatter",
  "demolish",
  "annihilate",
  "obliterate",
  "eradicate",
  "extinction",
  "genesis",
  "creation",
  "renewal",
  "rebirth",
  "salvation",
  "redemption",
  "absolution",
  "penance",
  "devotion",
  "faith",
  "conviction",
  "resolve",
  "defiance",
  "triumph",
  "victory",
  "conquest",
  "domination",
  "supremacy",
  "ascendancy",
  "ascension",
  "awakening",
  "recall",
  "recollect",
  "memory",
  "vision",
  "clarity",
  "focus",
]);

/**
 * Splits DB-validated candidate card names found in `text` into unambiguous
 * (auto-wrap, zero LLM) vs ambiguous (escalate to a Haiku span-verdict pass).
 * Only bare (not-already-bracketed) occurrences count as candidates — a name
 * that only appears inside an existing `[[..]]` is not re-listed in either
 * output list.
 */
export function classifyLinkifyCandidates(
  text: string,
  isKnownCardName: (name: string) => boolean
): { unambiguous: string[]; ambiguous: string[] } {
  const unambiguous = new Set<string>();
  const ambiguous = new Set<string>();

  for (const candidate of candidatePhrases(text)) {
    if (!isKnownCardName(candidate)) continue;

    // Only consider candidates that appear as a bare (non-bracketed)
    // whole-word occurrence in text — this excludes names whose only
    // occurrence in `text` is inside an existing [[...]] (candidatePhrases
    // extracts bracket contents too, so without this check an already-linked
    // name would be re-proposed here).
    const escaped = escapeRegExp(candidate);
    const bareRe = new RegExp(`(?<!\\[)\\b${escaped}\\b(?!\\])`);
    if (!bareRe.test(text)) continue;

    const isSingleWord = !/\s/.test(candidate);
    if (isSingleWord && AMBIGUOUS_WORDLIST.has(candidate.toLowerCase())) {
      ambiguous.add(candidate);
    } else {
      unambiguous.add(candidate);
    }
  }

  return { unambiguous: [...unambiguous], ambiguous: [...ambiguous] };
}
