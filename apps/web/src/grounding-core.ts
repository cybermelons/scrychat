/**
 * Grounding check: the machine form of issue #47's test, "chip present on
 * every card claim". Every card the reply asserts must trace to a card the
 * conversation actually fetched (a tool call), not to the model's memory.
 * evals/run-tier-b.mjs B-fmt-6 only asserts that SOME tool ran; this checks
 * each claim.
 *
 * Claims are the card refs the UI renders as chips, so they are machine
 * detectable. The syntax MIRRORS apps/web/ui/src/markdown.ts (renderCardGroups
 * / renderCardRefs), which is the spec; it is restated here because src/ may
 * not import from ui/ (tsconfig.build.json rootDir=src) and the eval harness
 * runs plain node against the built output. Same shapes as CHIP_RE in
 * group-chips-core.ts, with bounded quantifiers added:
 *   [[Name]]  ![[Name]]  [[Name|alias]]  ![[Name|alias]]   (name = before the pipe)
 *   [[group:LABEL|Name A; Name B]]                         (members split on ";")
 * A malformed `[[group:ramp]]` (no pipe) survives the group pass; as in
 * markdown.ts it is skipped, never minted as a card claim named "group:ramp".
 *
 * The fetched set is NOT "every `name` input". `name` is a CARD name on
 * get_card but a DECK name on deck_get, deck_add, deck_rename and others; a
 * naive collect would let a deck called "Sol Ring Tribal" ground a claim of
 * Sol Ring: a false pass, the exact failure this check exists to catch. So
 * each tool has an explicit entry in TOOLS naming which input fields and which
 * result fields carry CARD names. A tool not listed grounds nothing.
 *
 * Results are used as well as inputs: search_cards, find_alternatives and
 * find_combos return card names a reply may legitimately cite. Result names
 * are pulled by regex over the raw string, per tool, rather than by
 * JSON.parse, because a result can still arrive lossily cut (see below) and a
 * regex degrades gracefully where a parse throws. Names whose closing quote
 * was cut off are never emitted.
 *
 * CONTRACT (revised by #70): the server used to cap every stored result at
 * 2048 chars, cutting mid-record. On the real "Grothama Fight Draw" deck that
 * left 29 of 76 card names visible here, so B-fmt-7 reported genuinely
 * fetched cards as ungrounded on every run. That cap was a display bound
 * misapplied at capture time; results are now stored whole and the cap lives
 * in the UI. New results are therefore complete.
 *
 * `truncatedResults` stays, for two reasons: chats/ on disk still holds
 * results truncated by the old build, and a future change could reintroduce a
 * capture-time cut. A nonzero count means names may be missing, so a claim can
 * read ungrounded when the fetch was real -- treat it as "cannot distinguish
 * hallucination from unseen fetch", not as a pass or a fail.
 * A tool call whose result is an error grounds nothing (a failed get_card
 * of a hallucinated name must not ground that name).
 *
 * Name comparison: case-insensitive, trimmed, whitespace-collapsed, curly
 * apostrophes folded. DFC rule: a name is split on "//" into faces and a
 * claim is grounded when ANY face matches ANY face of a fetched name, so
 * "Lightning Bolt" matches "Lightning Bolt // X" and vice versa, as does a
 * back-face citation.
 *
 * Pure: no DOM, fs, fetch. Scans are capped (MAX_SCAN_CHARS, MAX_CLAIMS,
 * MAX_GROUP_MEMBERS) and regexes use bounded quantifiers so unclosed `[[`
 * runs stay linear; `truncated` on the report says a cap was hit.
 */

export interface CardClaim {
  name: string;
  form: "hover" | "embed" | "group";
}

export interface ToolCall {
  name: string;
  input?: unknown;
  result?: string;
}

export interface GroundingReport {
  claims: CardClaim[];
  grounded: CardClaim[];
  ungrounded: CardClaim[];
  /** Card names the calls fetched (original spelling, sorted). */
  fetched: string[];
  /** Tool results cut off by the server's length cap (names past the cut are unseen). */
  truncatedResults: number;
  /** True when a scan cap dropped part of the text or some claims. */
  truncated: boolean;
}

export const MAX_SCAN_CHARS = 100_000;
export const MAX_CLAIMS = 1000;
export const MAX_GROUP_MEMBERS = 200;

// Bounded twins of markdown.ts / group-chips-core.ts regexes. Newlines are NOT
// excluded from the name class: markdown.ts uses [^\]|]+, which matches across a
// line break, so a wrapped [[Sol\nRing]] renders as a ref and must be seen here
// too. Whitespace collapse in faces() makes it compare equal to "Sol Ring".
const GROUP_RE = /\[\[group:([^|\]]{1,200})\|([^\]]{1,10000})\]\]/g;
const EMBED_RE = /!\[\[([^\]|]{1,200})(?:\|([^\]]{1,500}))?\]\]/g;
const HOVER_RE = /\[\[([^\]|]{1,200})(?:\|([^\]]{1,500}))?\]\]/g;

export function extractCardClaims(text: string): CardClaim[] {
  return scan(text).claims;
}

function scan(text: string): { claims: CardClaim[]; truncated: boolean } {
  let truncated = text.length > MAX_SCAN_CHARS;
  let rest = truncated ? text.slice(0, MAX_SCAN_CHARS) : text;
  const found: { at: number; claim: CardClaim }[] = [];

  // Order matters: group, then embed, then hover. Each pass blanks what it
  // consumed so the next cannot re-match inside it (`![[x]]` also contains
  // `[[x]]`; a group chip also starts with `[[`).
  rest = rest.replace(GROUP_RE, (...args) => {
    const at = args[args.length - 2] as number;
    const members = (args[2] as string).split(";").map((n) => n.trim()).filter(Boolean);
    if (members.length > MAX_GROUP_MEMBERS) truncated = true;
    for (const name of members.slice(0, MAX_GROUP_MEMBERS)) found.push({ at, claim: { name, form: "group" } });
    return " ".repeat((args[0] as string).length);
  });
  for (const [re, form] of [[EMBED_RE, "embed"], [HOVER_RE, "hover"]] as const) {
    rest = rest.replace(re, (...args) => {
      const whole = args[0] as string;
      const name = (args[1] as string).trim();
      const at = args[args.length - 2] as number;
      if (name.startsWith("group:")) return whole; // malformed chip: not a card
      if (name) found.push({ at, claim: { name, form } });
      return " ".repeat(whole.length);
    });
  }
  found.sort((a, b) => a.at - b.at);
  if (found.length > MAX_CLAIMS) truncated = true;
  return { claims: found.slice(0, MAX_CLAIMS).map((f) => f.claim), truncated };
}

// ---- fetched set ----

const STR = String.raw`"((?:[^"\\]|\\.)*)"`;

function unescapeJson(s: string): string {
  try {
    return JSON.parse(`"${s}"`) as string;
  } catch {
    return s;
  }
}

function keyed(result: string, keys: string[]): string[] {
  const out: string[] = [];
  for (const key of keys) {
    for (const m of result.matchAll(new RegExp(`"${key}"\\s*:\\s*${STR}`, "g"))) out.push(unescapeJson(m[1]));
  }
  return out;
}

function pieces(result: string): string[] {
  const out: string[] = [];
  for (const arr of result.matchAll(/"pieces"\s*:\s*\[([^\]]*)/g)) {
    for (const m of arr[1].matchAll(new RegExp(STR, "g"))) out.push(unescapeJson(m[1]));
  }
  return out;
}

const asObj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});
const str = (v: unknown): string[] => (typeof v === "string" ? [v] : []);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.flatMap(str) : []);
const objList = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.map(asObj) : []);

interface ToolSpec {
  /** Card names carried by the INPUT. `name`/`deck_name` are deliberately absent unless the tool's `name` is a card. */
  inputs?: (input: Record<string, unknown>) => string[];
  /** Card names carried by the RESULT string. */
  results?: (result: string) => string[];
  /** Result holds the canonical (fuzzy-resolved) name; input only counts while no result exists. */
  canonical?: boolean;
}

// Verified against packages/mcp/src/tools.ts. Tools absent here (deck_get's
// and deck_add's `name`, deck_rename, deck_list, deck_export, deck_import,
// goldfish_*, search_tags, collection_stats, ...) ground nothing via inputs.
const TOOLS: Record<string, ToolSpec> = {
  get_card: { inputs: (i) => str(i.name), results: (r) => keyed(r, ["name"]), canonical: true }, // name = CARD
  search_cards: { results: (r) => keyed(r, ["n"]) }, // query = Scryfall syntax, not a name
  find_alternatives: { inputs: (i) => str(i.card), results: (r) => keyed(r, ["card", "n"]), canonical: true },
  find_combos: { inputs: (i) => strList(i.cards), results: pieces },
  deck_add: { inputs: (i) => objList(i.cards).flatMap((c) => str(c.name)) }, // top-level name = DECK
  deck_remove: { inputs: (i) => strList(i.cards) }, // top-level name = DECK
  deck_set_card_tags: { inputs: (i) => objList(i.cards).flatMap((c) => str(c.name)) }, // deck_name = DECK
  deck_set_card_count: { inputs: (i) => str(i.card) },
  deck_create: { inputs: (i) => str(i.commander) }, // name = DECK
  deck_set_commander: { inputs: (i) => str(i.commander) },
  deck_suggest: { inputs: (i) => objList(i.suggestions).flatMap((s) => [...str(s.in), ...str(s.out)]) },
  deck_suggestions: { results: (r) => keyed(r, ["in", "out"]) },
  deck_get: {
    // top-level "name" is the DECK; card names live under byTag, plus commander.
    results: (r) => {
      const at = r.indexOf('"byTag"');
      return [...keyed(r, ["commander"]), ...(at < 0 ? [] : keyed(r.slice(at), ["name"]))];
    },
  },
};

function isErrorResult(result: string): boolean {
  try {
    const p = JSON.parse(result);
    if (p && typeof p === "object" && !Array.isArray(p)) return "error" in p || !!(p as { isError?: unknown }).isError;
    return false;
  } catch {
    return /^\s*\{\s*"error"/.test(result);
  }
}

/** "mcp__scrychat__get_card" -> "get_card". */
function bareTool(name: string): string {
  const i = name.lastIndexOf("__");
  return i < 0 ? name : name.slice(i + 2);
}

/**
 * True when a result was cut and so may be missing card names. Post-#70 the
 * server stores results whole, so this only fires on records written by an
 * older build -- or on a regression that reintroduces a capture-time cut.
 */
export function isLossyTruncated(result: string): boolean {
  return result.endsWith("…");
}

function collect(calls: ToolCall[]): { names: Set<string>; truncatedResults: number } {
  const names = new Set<string>();
  let truncatedResults = 0;
  for (const call of calls) {
    const spec = TOOLS[bareTool(call.name)];
    if (!spec) continue;
    const hasResult = typeof call.result === "string";
    if (hasResult && isErrorResult(call.result as string)) continue;
    // A cut result hides names (#70). Post-fix these are only records from
    // an older build, but they must still be reported as unverifiable rather
    // than scored as complete.
    if (hasResult && isLossyTruncated(call.result as string)) truncatedResults++;
    const useInput = spec.inputs && !(spec.canonical && hasResult);
    const fromInput = useInput ? spec.inputs!(asObj(call.input)) : [];
    const fromResult = hasResult && spec.results ? spec.results(call.result as string) : [];
    for (const n of [...fromInput, ...fromResult]) {
      const t = n.trim();
      if (t) names.add(t);
    }
  }
  return { names, truncatedResults };
}

export function fetchedCardNames(calls: ToolCall[]): Set<string> {
  return collect(calls).names;
}

// ---- comparison ----

function faces(name: string): string[] {
  return name
    .replace(/[‘’]/g, "'")
    .toLowerCase()
    .split("//")
    .map((f) => f.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

export function checkGrounding(text: string, calls: ToolCall[]): GroundingReport {
  const { claims, truncated } = scan(text);
  const { names, truncatedResults } = collect(calls);
  const index = new Set<string>();
  for (const n of names) for (const f of faces(n)) index.add(f);
  const grounded: CardClaim[] = [];
  const ungrounded: CardClaim[] = [];
  for (const c of claims) (faces(c.name).some((f) => index.has(f)) ? grounded : ungrounded).push(c);
  return { claims, grounded, ungrounded, fetched: [...names].sort(), truncatedResults, truncated };
}
