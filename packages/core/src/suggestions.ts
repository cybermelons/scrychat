import fs from "node:fs/promises";
import path from "node:path";

/**
 * Suggestions are AI-proposed deck changes awaiting a human verdict.
 *
 * Stored in a `suggestions/` directory that is a SIBLING of `decks/`, not
 * inside it: `listDecks` reads every `*.json` under `decks/`, so a
 * suggestions file living there would be parsed as a malformed deck and
 * show up in the deck list.
 */

export type SuggestionKind = "add" | "cut" | "swap";
export type SuggestionStatus = "pending" | "accepted" | "rejected";

export type Suggestion = {
  id: string;
  kind: SuggestionKind;
  status: SuggestionStatus;
  /** Card leaving the deck. Required for "cut" and "swap". */
  out?: string;
  /** Card entering the deck. Required for "add" and "swap". */
  in?: string;
  /** Functional role this change serves, e.g. "removal", "ramp". */
  role?: string;
  /** Why this change is an improvement. The reasoning a human reviews. */
  why: string;
  createdAt: string;
  /** Set when the suggestion leaves "pending". */
  decidedAt?: string;
  /** Optional human reason recorded with a verdict. */
  note?: string;
};

export type SuggestionFile = {
  deck: string;
  suggestions: Suggestion[];
};

const DEFAULT_SUGGESTIONS_DIR = () => path.join(process.cwd(), "suggestions");

/** Mirrors sanitizeName in decks.ts so a deck and its suggestions agree on slug. */
function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function filePath(dir: string, deckName: string): string {
  return path.join(dir, `${sanitizeName(deckName)}.json`);
}

async function atomicWrite(target: string, data: string): Promise<void> {
  const dir = path.dirname(target);
  const tmp = path.join(
    dir,
    `.tmp-${path.basename(target)}-${process.pid}-${Math.random().toString(36).slice(2)}`
  );
  await fs.writeFile(tmp, data, "utf8");
  await fs.rename(tmp, target);
}

function validate(s: Pick<Suggestion, "kind" | "out" | "in" | "why">): void {
  if (!s.why || !s.why.trim()) {
    throw new Error("suggestion requires a non-empty 'why'");
  }
  const needsIn = s.kind === "add" || s.kind === "swap";
  const needsOut = s.kind === "cut" || s.kind === "swap";
  if (needsIn && !s.in?.trim()) throw new Error(`kind "${s.kind}" requires 'in'`);
  if (needsOut && !s.out?.trim()) throw new Error(`kind "${s.kind}" requires 'out'`);
  if (s.kind === "add" && s.out) throw new Error(`kind "add" must not set 'out'`);
  if (s.kind === "cut" && s.in) throw new Error(`kind "cut" must not set 'in'`);
}

export async function listSuggestions(
  deckName: string,
  dir: string = DEFAULT_SUGGESTIONS_DIR()
): Promise<Suggestion[]> {
  try {
    const raw = await fs.readFile(filePath(dir, deckName), "utf8");
    const parsed = JSON.parse(raw) as SuggestionFile;
    return parsed.suggestions ?? [];
  } catch (err: any) {
    if (err?.code === "ENOENT") return [];
    throw err;
  }
}

async function save(
  deckName: string,
  suggestions: Suggestion[],
  dir: string
): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
  const body: SuggestionFile = { deck: deckName, suggestions };
  await atomicWrite(filePath(dir, deckName), JSON.stringify(body, null, 2));
}

export type NewSuggestion = {
  kind: SuggestionKind;
  out?: string;
  in?: string;
  role?: string;
  why: string;
};

/** Append proposals. Returns every suggestion for the deck, newest last. */
export async function addSuggestions(
  deckName: string,
  proposals: NewSuggestion[],
  dir: string = DEFAULT_SUGGESTIONS_DIR()
): Promise<Suggestion[]> {
  if (!proposals.length) throw new Error("no suggestions given");
  proposals.forEach(validate);

  const existing = await listSuggestions(deckName, dir);
  const now = new Date().toISOString();
  // Monotonic ids: continue past the highest existing number so a decided
  // suggestion's id is never reused after the list is filtered.
  let next =
    existing.reduce((max, s) => {
      const n = Number(/^s(\d+)$/.exec(s.id)?.[1] ?? 0);
      return n > max ? n : max;
    }, 0) + 1;

  const created: Suggestion[] = proposals.map((p) => ({
    id: `s${next++}`,
    kind: p.kind,
    status: "pending" as SuggestionStatus,
    ...(p.out ? { out: p.out } : {}),
    ...(p.in ? { in: p.in } : {}),
    ...(p.role ? { role: p.role } : {}),
    why: p.why,
    createdAt: now,
  }));

  const all = [...existing, ...created];
  await save(deckName, all, dir);
  return all;
}

/**
 * Record a verdict. Does NOT touch the deck: accepting marks intent, and the
 * caller applies the card change through the existing deck API. This keeps
 * one writer per deck file.
 */
export async function decideSuggestion(
  deckName: string,
  id: string,
  status: Exclude<SuggestionStatus, "pending">,
  note?: string,
  dir: string = DEFAULT_SUGGESTIONS_DIR()
): Promise<Suggestion> {
  const all = await listSuggestions(deckName, dir);
  const target = all.find((s) => s.id === id);
  if (!target) throw new Error(`no suggestion "${id}" for deck "${deckName}"`);
  if (target.status !== "pending") {
    throw new Error(`suggestion "${id}" is already ${target.status}`);
  }
  target.status = status;
  target.decidedAt = new Date().toISOString();
  if (note) target.note = note;
  await save(deckName, all, dir);
  return target;
}

export async function clearDecided(
  deckName: string,
  dir: string = DEFAULT_SUGGESTIONS_DIR()
): Promise<number> {
  const all = await listSuggestions(deckName, dir);
  const pending = all.filter((s) => s.status === "pending");
  const removed = all.length - pending.length;
  if (removed > 0) await save(deckName, pending, dir);
  return removed;
}
