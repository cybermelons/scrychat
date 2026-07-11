// Decklist text parser + import orchestration.
//
// parseDecklist() is intentionally free of I/O, card resolution, and network
// access. It only performs deterministic text parsing to extract
// {name, count, commander?} tuples from a pasted decklist. Card legality /
// color identity / name resolution against Scryfall happens later, in
// addCards (see decks.ts) — NOT here.
//
// importDecklist() is the orchestration layer on top: it drives parseDecklist
// plus decks.ts (createDeck/getDeck/addCards/deckSummary) to implement the
// full deck_import behavior (new-deck vs existing-deck modes, commander
// inference, accounting of added/rejected/unparsed).

import type { CardEntry, CardResolver, Deck, DeckSummary, QuotaTargets } from "./decks.js";
import { addCards, createDeck, deckSummary, getDeck } from "./decks.js";

export type DeckImportEntry = { name: string; count: number; commander?: boolean };
export type DeckImportResult = { entries: DeckImportEntry[]; unparsed: string[] };

// Section kinds we recognize in headers. "included" sections contribute cards to
// entries (Deck/Mainboard = normal cards, Commander = commander cards). "excluded"
// sections (Sideboard/Maybeboard/Considering/Tokens) are skipped wholesale: every
// line under them is dropped silently (not even pushed to `unparsed`), since the
// user explicitly signaled these aren't part of the deck being imported.
type SectionKind = "deck" | "commander" | "excluded" | "none";

// Matches a header line like "Deck", "Mainboard:", "Sideboard (15)", "Commander:".
// Allows an optional trailing colon and/or a parenthesized count, and optionally
// a name on the same line after the colon (only meaningful for Commander).
const HEADER_RE =
  /^(deck|mainboard|main\s*board|commander|sideboard|maybeboard|maybe\s*board|considering|tokens)\s*(?::\s*(.*))?\s*(?:\(\s*\d+\s*\))?\s*:?\s*$/i;

const INCLUDED_DECK_HEADERS = new Set(["deck", "mainboard", "main board"]);
const EXCLUDED_HEADERS = new Set([
  "sideboard",
  "maybeboard",
  "maybe board",
  "considering",
  "tokens",
]);

// Commander suffix marker, e.g. "1 Atraxa, Praetors' Voice *CMDR*" (case-insensitive).
const CMDR_SUFFIX_RE = /\s*\*cmdr\*\s*$/i;

// Foil / finish markers Moxfield/Archidekt append, e.g. "*F*", "*Foil*", "*Etched*".
const FOIL_MARKER_RE = /\s*\*[a-z]+\*\s*$/i;

// Archidekt trailing category tag, e.g. "#Ramp", "#Card Draw" (single word/token,
// conservative — only strip a single trailing "#word" tag, not arbitrary text).
const CATEGORY_TAG_RE = /\s*#\S+\s*$/;

// Set code + optional collector number, e.g. "(2X2) 117", "(LEA) 161", "(C21)".
// Set codes are 2-6 alphanumeric characters inside parens.
const SET_COLLECTOR_RE = /\s*\([a-z0-9]{2,6}\)\s*(?:[a-z0-9-]+)?\s*$/i;

// Leading count: "1", "1x", "1X", "10x" etc, followed by whitespace.
const LEADING_COUNT_RE = /^(\d+)\s*x?\s+(.*)$/i;

// A plausible Magic card name: letters (incl. accented), digits, and the small
// set of punctuation that legitimately appears in card names (apostrophes,
// commas, hyphens, periods, colons, slashes, exclamation marks, ampersands,
// parens for names like "Kongming, \"Sleeping Dragon\"" survive since quotes
// aren't stripped elsewhere). This is a deliberately loose allowlist meant to
// reject obvious prose ("copies of that green ramp rock", "!!! ???") while
// accepting real card names, including double-faced/split names ("Fire //
// Ice") and long legendary names with subtitles.
const PLAUSIBLE_NAME_RE = /^[\p{L}\p{N}][\p{L}\p{N}\s,'’.\-:/!&"]*$/u;

// Freeform "N copies/of/that ..." prose that happens to start with a number —
// reject this from the leading-count fast path so it falls through to the
// bare-name plausibility check (and from there, to unparsed).
const PROSE_COUNT_RE = /^\d+\s+cop(?:y|ies)\s+of\b/i;

// Lowercase filler/stopwords that essentially never appear in a Magic card
// name but are common in freeform English prose ("copies of that green ramp
// rock"). Used as a cheap signal to reject prose that otherwise passes the
// character-class allowlist. Real card names occasionally contain "of" or
// "the" (e.g. "Sword of Fire and Ice", "Feast of the Unicorn") — the
// threshold below requires *two or more* hits before rejecting, so a single
// legitimate "of"/"the" doesn't cause a false rejection.
const PROSE_STOPWORDS = new Set([
  "copies",
  "copy",
  "that",
  "those",
  "these",
  "some",
  "any",
  "maybe",
  "probably",
  "something",
  "stuff",
  "thing",
  "things",
]);

function looksLikeCardName(name: string): boolean {
  if (!name) return false;
  if (!PLAUSIBLE_NAME_RE.test(name)) return false;
  // Reject names that are entirely non-letter/non-digit noise (shouldn't
  // happen given the regex above requires a leading letter/digit, but guard
  // against pure whitespace/punctuation runs sneaking through join artifacts).
  if (!/[\p{L}\p{N}]/u.test(name)) return false;

  // Reject obvious freeform prose: a name that still has an embedded leading
  // digit run followed by a stopword (e.g. "3 copies of that green ramp
  // rock") is prose describing a quantity, not a card name.
  const words = name.toLowerCase().split(/\s+/);
  const stopwordHits = words.filter((w) => PROSE_STOPWORDS.has(w.replace(/[^a-z]/g, ""))).length;
  if (stopwordHits >= 2) return false;
  if (/^\d+$/.test(words[0]) && stopwordHits >= 1) return false;

  return true;
}

function stripTrailingMarkers(raw: string): { name: string; commander: boolean } {
  let name = raw.trim();
  let commander = false;

  // Order matters: markers are appended in sequence by exporters, e.g.
  // "Sol Ring (C21) 263 *F*". Strip from the outside in, repeatedly, since a line
  // could (rarely) carry more than one stripped suffix in either order.
  let changed = true;
  while (changed) {
    changed = false;

    if (CMDR_SUFFIX_RE.test(name)) {
      name = name.replace(CMDR_SUFFIX_RE, "").trim();
      commander = true;
      changed = true;
      continue;
    }

    if (FOIL_MARKER_RE.test(name)) {
      name = name.replace(FOIL_MARKER_RE, "").trim();
      changed = true;
      continue;
    }

    if (CATEGORY_TAG_RE.test(name)) {
      name = name.replace(CATEGORY_TAG_RE, "").trim();
      changed = true;
      continue;
    }

    if (SET_COLLECTOR_RE.test(name)) {
      name = name.replace(SET_COLLECTOR_RE, "").trim();
      changed = true;
      continue;
    }
  }

  return { name, commander };
}

function matchHeader(line: string): { kind: SectionKind; inlineName?: string } | null {
  const m = HEADER_RE.exec(line.trim());
  if (!m) return null;

  const keyword = m[1].toLowerCase().replace(/\s+/g, " ");
  const inline = m[2]?.trim();

  if (keyword === "commander") {
    return { kind: "commander", inlineName: inline || undefined };
  }
  if (INCLUDED_DECK_HEADERS.has(keyword)) {
    return { kind: "deck" };
  }
  if (EXCLUDED_HEADERS.has(keyword)) {
    return { kind: "excluded" };
  }
  return null;
}

function isCommentLine(line: string): boolean {
  return line.startsWith("#") || line.startsWith("//");
}

/**
 * Parses a pasted decklist (Moxfield / Archidekt / MTGO / plain text export style)
 * into structured entries. Pure text parsing only — no card resolution, no I/O.
 *
 * Decision notes (see individual rules for detail):
 * - A line with a leading integer count (optionally followed by x/X) is always
 *   treated as a card line, e.g. "1 Sol Ring", "1x Sol Ring", "10 Forest".
 * - A bare line with NO leading count is treated as a card with count 1, UNLESS
 *   it matches a section header pattern or a comment marker (# / //) — those are
 *   handled separately and never become entries. This favors accepting bare-name
 *   exports (some tools omit counts for singleton nonland cards) while still
 *   letting section headers and comments do their job.
 * - Section state is tracked as we iterate: "Deck"/"Mainboard" flip to normal
 *   card mode; "Commander" flips to commander-card mode (every following card
 *   line is commander:true) until the next blank line or next header;
 *   "Sideboard"/"Maybeboard"/"Considering"/"Tokens" flip to a fully-excluded
 *   mode where lines are dropped without landing in `unparsed`.
 * - A blank line ends a "Commander" inline section's carry-over scope (returns
 *   to whatever the enclosing section was, defaulting to "deck" cards) but does
 *   NOT exit an explicit Sideboard/Maybeboard/etc. section — those stay excluded
 *   until the next header line, matching how these exports are structured (blank
 *   lines are common inside sideboard blocks too).
 * - Lines that have content, are in an included (non-excluded) section, and look
 *   like they should be cards but can't be confidently parsed into a clean name
 *   are pushed verbatim (trimmed) into `unparsed` — nothing is silently dropped
 *   except lines inside excluded sections, blank lines, and comment lines.
 */
export function parseDecklist(text: string): DeckImportResult {
  const entries: DeckImportEntry[] = [];
  const unparsed: string[] = [];

  const lines = text.split(/\r\n|\r|\n/);

  // `section` is the persistent section we're in (deck/commander/excluded/none).
  // `commanderCarry` is true only while we're within the scope of a bare
  // "Commander" header's following lines (reset on blank line or new header).
  let section: SectionKind = "none";
  let commanderCarry = false;

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === "") {
      // Blank line ends a Commander header's inline carry-over scope, but does
      // not exit an excluded section (Sideboard etc. commonly contain blank
      // lines/spacing within their own block in some exports).
      commanderCarry = false;
      continue;
    }

    if (isCommentLine(line)) {
      continue;
    }

    const header = matchHeader(line);
    if (header) {
      section = header.kind;
      if (header.kind === "commander") {
        commanderCarry = true;
        if (header.inlineName) {
          const { name, commander: alsoMarked } = stripTrailingMarkers(header.inlineName);
          if (name) {
            entries.push({ name, count: 1, commander: true });
          } else {
            unparsed.push(rawLine.trim());
          }
          void alsoMarked; // inline name under Commander: header is already commander:true
        }
      } else {
        commanderCarry = false;
      }
      continue;
    }

    if (section === "excluded") {
      // Intentionally excluded: not an entry, not unparsed.
      continue;
    }

    const isCommanderContext = section === "commander" && commanderCarry;

    // Reject "N copies of ..." style prose from the leading-count fast path —
    // it superficially looks like "<count> <name>" but isn't a card line.
    const countMatch = PROSE_COUNT_RE.test(line) ? null : LEADING_COUNT_RE.exec(line);
    if (countMatch) {
      const count = parseInt(countMatch[1], 10);
      const rest = countMatch[2].trim();
      const { name, commander: markedCommander } = stripTrailingMarkers(rest);
      if (!name || !looksLikeCardName(name)) {
        unparsed.push(rawLine.trim());
        continue;
      }
      entries.push({
        name,
        count,
        commander: markedCommander || isCommanderContext || undefined,
      });
      continue;
    }

    // No leading count (or a leading count that didn't look card-like): accept
    // as a bare card name (count 1) only if it plausibly reads as a card name.
    // This is not a header or comment (those were already handled above).
    // Still strip any trailing markers (set/collector, foil, cmdr, category
    // tag) in case the exporter omitted a count but kept suffixes. Anything
    // that doesn't look card-like (freeform prose, garbage) is pushed to
    // `unparsed` verbatim (trimmed) rather than silently dropped.
    const { name, commander: markedCommander } = stripTrailingMarkers(line);
    if (!name || !looksLikeCardName(name)) {
      unparsed.push(rawLine.trim());
      continue;
    }
    entries.push({
      name,
      count: 1,
      commander: markedCommander || isCommanderContext || undefined,
    });
  }

  return { entries, unparsed };
}

function toCardEntry(e: DeckImportEntry): CardEntry {
  return { name: e.name, count: e.count };
}

export type ImportDecklistOptions = {
  deckName?: string;
  mode?: "new" | "existing";
  targets?: Partial<QuotaTargets>;
};

/**
 * Orchestrates a full decklist import: parses the pasted text, then either
 * adds the parsed cards to an existing deck or creates a new deck (inferring
 * the commander from *CMDR*-marked entries, or resolving a single legendary
 * creature candidate when mode is forced to "new" with none marked).
 *
 * This is the implementation behind the MCP deck_import tool — factored out
 * here so it's usable without going through MCP, and to keep tools.ts as a
 * thin registration layer. Return shape is deliberately unchanged from the
 * original tools.ts implementation (parsed/error/needsCommander/candidates/
 * added/rejected/unparsed/summary/etc).
 */
export async function importDecklist(
  text: string,
  opts: ImportDecklistOptions,
  resolver: CardResolver,
  decksDir?: string,
): Promise<unknown> {
  const deckNameArg = opts.deckName;
  const modeArg = opts.mode;
  const targets = opts.targets;

  const parsed = parseDecklist(text);
  const parsedOut = { entries: parsed.entries, unparsed: parsed.unparsed };
  const commanderEntries = parsed.entries.filter((e) => e.commander);

  const mode: "new" | "existing" = modeArg ?? (commanderEntries.length > 0 ? "new" : "existing");

  if (mode === "existing") {
    if (!deckNameArg) {
      return { error: "deck_name required for existing-deck import", parsed: parsedOut };
    }
    const deck = await getDeck(deckNameArg, decksDir);
    if (!deck) {
      return { error: `Deck not found: ${deckNameArg}`, parsed: parsedOut };
    }
    const result = await addCards(deckNameArg, parsed.entries.map(toCardEntry), resolver, decksDir);
    const summary = await deckSummary(deckNameArg, resolver, decksDir, targets);
    return {
      mode,
      added: result.added,
      rejected: result.rejected,
      unparsed: parsed.unparsed,
      summary,
    };
  }

  // mode === "new"
  let commanderName: string | undefined;
  let commanderNote: string | undefined;
  let nonCommanderEntries: DeckImportEntry[];

  if (commanderEntries.length === 1) {
    commanderName = commanderEntries[0].name;
    nonCommanderEntries = parsed.entries.filter((e) => e !== commanderEntries[0]);
  } else if (commanderEntries.length > 1) {
    // Partner/background pair or ambiguous multi-marker list. Phase 1: keep it
    // simple, use the first as commander, demote the rest to normal cards.
    commanderName = commanderEntries[0].name;
    commanderNote =
      `Multiple *CMDR* markers found; used "${commanderName}" as commander and treated ` +
      `the rest (${commanderEntries.slice(1).map((e) => e.name).join(", ")}) as normal cards ` +
      `(partner/background pairing is not auto-resolved in phase 1).`;
    nonCommanderEntries = parsed.entries.filter((e) => e !== commanderEntries[0]);
  } else {
    // Zero commander-marked entries but mode forced to "new": try to infer a
    // single legal-commander candidate by resolving every entry. Only done in
    // this rare forced path — the common (marked) path above never resolves.
    const candidateEntries: DeckImportEntry[] = [];
    for (const entry of parsed.entries) {
      const resolved = await resolver(entry.name);
      if (resolved && resolved.typeLine.includes("Legendary") && resolved.typeLine.includes("Creature")) {
        candidateEntries.push(entry);
      }
    }
    // Dedupe candidate NAMES for the needsCommander list (a duplicate legendary
    // line shouldn't make it look like 2 distinct candidates).
    const candidates = [...new Set(candidateEntries.map((e) => e.name))];
    if (candidates.length === 1) {
      commanderName = candidates[0];
      const commanderEntry = candidateEntries[0]; // first matching entry object
      nonCommanderEntries = parsed.entries.filter((e) => e !== commanderEntry);
    } else if (candidates.length > 1) {
      return { needsCommander: true, candidates, parsed: parsedOut };
    } else {
      return {
        error: "No commander found in list; specify deck_name + a commander.",
        parsed: parsedOut,
      };
    }
  }

  const deckName = deckNameArg ?? commanderName!;
  if (!deckNameArg) {
    const defaultNote = `deck_name not given; defaulted to commander name "${deckName}".`;
    commanderNote = commanderNote ? `${commanderNote} ${defaultNote}` : defaultNote;
  }

  let deck: Deck;
  try {
    deck = await createDeck(deckName, commanderName!, resolver, decksDir);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { error: message, parsed: parsedOut };
  }

  const result = await addCards(deckName, nonCommanderEntries!.map(toCardEntry), resolver, decksDir);
  const summary: DeckSummary = await deckSummary(deckName, resolver, decksDir, targets);

  return {
    mode,
    created: {
      name: deck.name,
      commander: deck.commander,
      commanderIdentity: deck.commanderIdentity.join(""),
    },
    ...(commanderNote ? { commanderNote } : {}),
    added: result.added,
    rejected: result.rejected,
    unparsed: parsed.unparsed,
    summary,
  };
}
