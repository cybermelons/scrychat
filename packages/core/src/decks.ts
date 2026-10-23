import fs from "node:fs/promises";
import path from "node:path";

export type CardEntry = {
  name: string;
  tags?: string[];
  count?: number;
  /** Absent = mainboard. */
  board?: "side";
};

export type CardInput = CardEntry & {
  /** @deprecated use `tags`; accepted as a single-tag alias */
  role?: string;
};

export type QuotaTargets = {
  lands: [number, number];
  ramp: [number, number];
  draw: [number, number];
  interaction: [number, number];
  wipes: [number, number];
  wincon: [number, number];
};

export const DEFAULT_QUOTA_TARGETS: QuotaTargets = {
  lands: [36, 38],
  ramp: [10, 12],
  draw: [10, 12],
  interaction: [8, 10],
  wipes: [2, 4],
  wincon: [1, 3],
};

export type Deck = {
  name: string;
  commander: string;
  commanderIdentity: string[];
  cards: CardEntry[];
  updatedAt: string;
  quotaTargets?: Partial<QuotaTargets>;
  bracket?: 1 | 2 | 3 | 4 | 5;
  /** Whole-deck price ceiling in USD. */
  budgetUsd?: number;
  /** Free-text plan for the deck (≤2000 chars). */
  strategy?: string;
  /** Short theme labels (≤12, 1-40 chars, unique case-insensitively). */
  themes?: string[];
  /** Unsaved "New deck" draft: a real file so every editor/chat/MCP op works, flagged until saved. */
  draft?: true;
};

export type ResolvedCard = {
  name: string;
  colorIdentity: string[];
  cmc: number;
  typeLine: string;
  legalCommander: boolean;
  image?: string | null;
  manaCost?: string | null;
  producedMana?: string[] | null;
  arena?: boolean | null;
  usd?: number | null;
  edhrecRank?: number | null;
};

export type CardResolver = (name: string) => Promise<ResolvedCard | null>;

export type RejectedCard = { name: string; reason: string };

export type AddCardsResult = {
  added: CardEntry[];
  rejected: RejectedCard[];
};

export type QuotaCheck = {
  have: number;
  want: string;
  ok: boolean;
};

export type DeckReport = {
  sideboard: { name: string; count: number }[];
  total: number;
  targetTotal: number;
  overUnder: number;
  byTag: Record<string, number>;
  untaggedForQuota: number;
  curve: Record<string, number>;
  quotaCheck: {
    lands: QuotaCheck;
    ramp: QuotaCheck;
    draw: QuotaCheck;
    interaction: QuotaCheck;
    wipes: QuotaCheck;
    wincon: QuotaCheck;
  };
  priceUsd: { total: number; unpriced: number };
  originality: { score: number | null; ranked: number; unranked: number };
  violations: string[];
  identityViolations: string[];
  arenaCheck: {
    onArena: number;
    total: number;
    missing: string[];
    unknown: string[];
  };
};

const EDH_TARGET_TOTAL = 99;
const INTERACTION_ROLES = new Set(["interaction", "removal", "counterspell"]);

const DEFAULT_DECKS_DIR = () => path.join(process.cwd(), "decks");

function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function deckFilePath(decksDir: string, name: string): string {
  return path.join(decksDir, `${sanitizeName(name)}.json`);
}

async function ensureDir(decksDir: string): Promise<void> {
  await fs.mkdir(decksDir, { recursive: true });
}

async function atomicWrite(filePath: string, data: string): Promise<void> {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(
    dir,
    `.tmp-${path.basename(filePath)}-${process.pid}-${Math.random().toString(36).slice(2)}`
  );
  await fs.writeFile(tmpPath, data, "utf8");
  await fs.rename(tmpPath, filePath);
}

function migrateCardEntry(c: any): CardEntry {
  if (c && typeof c === "object") {
    const b = c.board === "side" ? { board: "side" as const } : {};
    if (Array.isArray(c.tags)) return { name: c.name, tags: c.tags, count: c.count, ...b };
    if (typeof c.role === "string" && c.role.length > 0) return { name: c.name, tags: [c.role], count: c.count, ...b };
    return { name: c.name, count: c.count, ...b };
  }
  return c;
}

async function readDeckFile(filePath: string): Promise<Deck | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const deck = JSON.parse(raw) as Deck;
    deck.cards = (deck.cards ?? []).map(migrateCardEntry);
    return deck;
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

async function writeDeckFile(decksDir: string, deck: Deck): Promise<void> {
  await ensureDir(decksDir);
  const filePath = deckFilePath(decksDir, deck.name);
  await atomicWrite(filePath, JSON.stringify(deck, null, 2));
}

export async function listDecks(
  decksDir: string = DEFAULT_DECKS_DIR()
): Promise<Deck[]> {
  await ensureDir(decksDir);
  const files = await fs.readdir(decksDir);
  const decks: Deck[] = [];
  for (const file of files) {
    if (!file.endsWith(".json") || file.startsWith(".tmp-")) continue;
    const deck = await readDeckFile(path.join(decksDir, file));
    if (deck) decks.push(deck);
  }
  return decks;
}

export async function getDeck(
  name: string,
  decksDir: string = DEFAULT_DECKS_DIR()
): Promise<Deck | null> {
  return readDeckFile(deckFilePath(decksDir, name));
}

export type DeckExportFormat = "plain" | "mtga" | "moxfield";

function cardLine(card: CardEntry, useFrontFace = false): string {
  const name = useFrontFace ? frontFace(card.name) : card.name;
  return `${card.count ?? 1} ${name}`;
}

// MTG Arena's decklist importer rejects the full "Front // Back" name stored
// for transform/DFC cards — it only accepts the front face. Other formats
// (Moxfield, plain) accept and round-trip the full name, so this is only
// applied for mtga export.
function frontFace(name: string): string {
  return name.split(" // ")[0];
}

export async function exportDeck(
  name: string,
  format: DeckExportFormat = "mtga",
  decksDir: string = DEFAULT_DECKS_DIR()
): Promise<string> {
  const deck = await getDeck(name, decksDir);
  if (!deck) {
    throw new Error(`Deck not found: ${name}`);
  }

  const main = deck.cards.filter((c) => c.board !== "side");
  const side = deck.cards.filter((c) => c.board === "side");
  const sideSection = side.length ? ["", "Sideboard", ...side.map((c) => cardLine(c))] : [];

  switch (format) {
    case "mtga": {
      // ponytail: Arena sideboard section omitted (importer treats it as a
      // 60-card sideboard, wrong for Commander); add if Arena support is confirmed.
      const cardLines = main.map((c) => cardLine(c, true));
      return [
        "Commander",
        `1 ${frontFace(deck.commander)}`,
        "",
        "Deck",
        ...cardLines,
      ].join("\n");
    }
    case "moxfield": {
      const cardLines = main.map((c) => cardLine(c));
      return [`1 ${deck.commander} *CMDR*`, ...cardLines, ...sideSection].join("\n");
    }
    case "plain":
    default: {
      const cardLines = main.map((c) => cardLine(c));
      return [`1 ${deck.commander} *CMDR*`, "", ...cardLines, ...sideSection].join("\n");
    }
  }
}

function isLegalCommanderCandidate(resolved: ResolvedCard): boolean {
  return resolved.legalCommander && resolved.typeLine.includes("Legendary");
}

export async function createDeck(
  name: string,
  commander: string,
  resolver: CardResolver,
  decksDir: string = DEFAULT_DECKS_DIR()
): Promise<Deck> {
  const resolved = await resolver(commander);
  if (!resolved) {
    throw new Error(`Commander not found: ${commander}`);
  }
  if (!isLegalCommanderCandidate(resolved)) {
    throw new Error(`Card is not a legal commander: ${commander}`);
  }

  const deck: Deck = {
    name,
    commander: resolved.name,
    commanderIdentity: resolved.colorIdentity,
    cards: [],
    updatedAt: new Date().toISOString(),
  };

  await writeDeckFile(decksDir, deck);
  return deck;
}

/** Empty draft deck (no commander yet) under a generated `untitled-xxxxxx` name. */
export async function createDraftDeck(decksDir: string = DEFAULT_DECKS_DIR()): Promise<Deck> {
  const name = `untitled-${Math.random().toString(16).slice(2, 8)}`;
  const deck: Deck = { name, commander: "", commanderIdentity: [], cards: [], updatedAt: new Date().toISOString(), draft: true };
  await writeDeckFile(decksDir, deck);
  return deck;
}

/** Rename a draft to its real name (refuses collisions / invalid names) and clear the flag. */
export async function saveDraft(name: string, newName: string, decksDir: string = DEFAULT_DECKS_DIR()): Promise<Deck> {
  const cur = await getDeck(name, decksDir);
  if (!cur) throw new Error(`Deck not found: ${name}`);
  if (!cur.draft) throw new Error(`Not a draft: ${name}`);
  const deck = await renameDeck(name, newName, decksDir);
  delete deck.draft;
  await writeDeckFile(decksDir, deck);
  return deck;
}

/** Delete a draft. Refuses saved decks. */
export async function discardDraft(name: string, decksDir: string = DEFAULT_DECKS_DIR()): Promise<void> {
  const cur = await getDeck(name, decksDir);
  if (!cur) throw new Error(`Deck not found: ${name}`);
  if (!cur.draft) throw new Error(`Not a draft: ${name}`);
  await deleteDeck(name, decksDir);
}

export async function deleteDeck(
  name: string,
  decksDir: string = DEFAULT_DECKS_DIR()
): Promise<boolean> {
  const filePath = deckFilePath(decksDir, name);
  try {
    await fs.unlink(filePath);
    return true;
  } catch (err: any) {
    if (err?.code === "ENOENT") return false;
    throw err;
  }
}

function isSubsetIdentity(cardIdentity: string[], commanderIdentity: string[]): boolean {
  const allowed = new Set(commanderIdentity);
  return cardIdentity.every((c) => allowed.has(c));
}

export async function renameDeck(
  oldName: string,
  newName: string,
  decksDir: string = DEFAULT_DECKS_DIR()
): Promise<Deck> {
  const deck = await getDeck(oldName, decksDir);
  if (!deck) {
    throw new Error(`Deck not found: ${oldName}`);
  }

  if (sanitizeName(newName) === "") {
    throw new Error(`Invalid deck name: ${newName}`);
  }

  const oldPath = deckFilePath(decksDir, oldName);
  const newPath = deckFilePath(decksDir, newName);

  if (newPath !== oldPath) {
    const existing = await getDeck(newName, decksDir);
    if (existing) {
      throw new Error(`Deck already exists: ${newName}`);
    }
  }

  deck.name = newName;
  deck.updatedAt = new Date().toISOString();

  await ensureDir(decksDir);
  await atomicWrite(newPath, JSON.stringify(deck, null, 2));

  if (newPath !== oldPath) {
    await fs.unlink(oldPath);
  }

  return deck;
}

export type SetCommanderResult = {
  deck: Deck;
  changed: boolean;
  nowIllegal: RejectedCard[];
};

export async function setCommander(
  name: string,
  newCommander: string,
  resolver: CardResolver,
  decksDir: string = DEFAULT_DECKS_DIR()
): Promise<SetCommanderResult> {
  const deck = await getDeck(name, decksDir);
  if (!deck) {
    throw new Error(`Deck not found: ${name}`);
  }

  const resolved = await resolver(newCommander);
  if (!resolved) {
    throw new Error(`Commander not found: ${newCommander}`);
  }
  if (!isLegalCommanderCandidate(resolved)) {
    throw new Error(`Card is not a legal commander: ${newCommander}`);
  }

  const changed = resolved.name !== deck.commander;

  deck.commander = resolved.name;
  deck.commanderIdentity = resolved.colorIdentity;
  deck.updatedAt = new Date().toISOString();

  const nowIllegal: RejectedCard[] = [];
  for (const card of deck.cards) {
    const cardResolved = await resolver(card.name);
    if (!cardResolved) continue;
    if (!isSubsetIdentity(cardResolved.colorIdentity, deck.commanderIdentity)) {
      nowIllegal.push({
        name: card.name,
        reason: `Color identity [${cardResolved.colorIdentity.join(
          ""
        )}] is not within commander identity [${deck.commanderIdentity.join("")}]`,
      });
    }
  }

  await writeDeckFile(decksDir, deck);

  return { deck, changed, nowIllegal };
}

export async function addCards(
  name: string,
  cards: CardInput[],
  resolver: CardResolver,
  decksDir: string = DEFAULT_DECKS_DIR(),
  opts: { board?: "main" | "side" } = {}
): Promise<AddCardsResult> {
  const deck = await getDeck(name, decksDir);
  if (!deck) {
    throw new Error(`Deck not found: ${name}`);
  }

  const added: CardEntry[] = [];
  const rejected: RejectedCard[] = [];

  const existingNamesLower = new Set(deck.cards.map((c) => c.name.toLowerCase()));

  for (const card of cards) {
    const resolved = await resolver(card.name);
    if (!resolved) {
      rejected.push({ name: card.name, reason: "Card not found" });
      continue;
    }
    if (!resolved.legalCommander) {
      rejected.push({ name: card.name, reason: "Card is not legal in Commander" });
      continue;
    }
    if (deck.commander && !isSubsetIdentity(resolved.colorIdentity, deck.commanderIdentity)) {
      rejected.push({
        name: card.name,
        reason: `Color identity [${resolved.colorIdentity.join(
          ""
        )}] is not within commander identity [${deck.commanderIdentity.join("")}]`,
      });
      continue;
    }

    const isBasicLand = resolved.typeLine.includes("Basic Land");

    if (!isBasicLand) {
      if (existingNamesLower.has(resolved.name.toLowerCase())) {
        rejected.push({
          name: card.name,
          reason: "Duplicate card violates singleton rule",
        });
        continue;
      }
      if ((card.count ?? 1) > 1) {
        rejected.push({
          name: card.name,
          reason: "Count > 1 only allowed for Basic Land",
        });
        continue;
      }
    }

    const tags = card.tags ?? (typeof card.role === "string" ? [card.role] : undefined);
    const entry: CardEntry = {
      name: resolved.name,
      tags,
      count: card.count ?? 1,
      ...(opts.board === "side" ? { board: "side" as const } : {}),
    };
    deck.cards.push(entry);
    existingNamesLower.add(resolved.name.toLowerCase());
    added.push(entry);
  }

  deck.updatedAt = new Date().toISOString();
  await writeDeckFile(decksDir, deck);

  return { added, rejected };
}

export async function moveCardBoard(
  deckName: string,
  cardName: string,
  board: "main" | "side",
  decksDir: string = DEFAULT_DECKS_DIR()
): Promise<Deck> {
  const deck = await getDeck(deckName, decksDir);
  if (!deck) throw new Error(`Deck not found: ${deckName}`);
  const card = deck.cards.find((c) => c.name.toLowerCase() === cardName.toLowerCase());
  if (!card) throw new Error(`Card not in deck: ${cardName}`);
  if (board === "side") card.board = "side";
  else delete card.board;
  deck.updatedAt = new Date().toISOString();
  await writeDeckFile(decksDir, deck);
  return deck;
}

export async function removeCards(
  name: string,
  names: string[],
  decksDir: string = DEFAULT_DECKS_DIR()
): Promise<Deck> {
  const deck = await getDeck(name, decksDir);
  if (!deck) {
    throw new Error(`Deck not found: ${name}`);
  }

  const toRemove = new Set(names.map((n) => n.toLowerCase()));
  deck.cards = deck.cards.filter((c) => !toRemove.has(c.name.toLowerCase()));
  deck.updatedAt = new Date().toISOString();

  await writeDeckFile(decksDir, deck);
  return deck;
}

export async function setCardTags(
  name: string,
  updates: { name: string; tags: string[] }[],
  decksDir: string = DEFAULT_DECKS_DIR()
): Promise<Deck> {
  const deck = await getDeck(name, decksDir);
  if (!deck) {
    throw new Error(`Deck not found: ${name}`);
  }

  const byNameLower = new Map(updates.map((u) => [u.name.toLowerCase(), u.tags]));
  deck.cards = deck.cards.map((c) => {
    const tags = byNameLower.get(c.name.toLowerCase());
    if (tags === undefined) return c;
    return { ...c, tags };
  });
  deck.updatedAt = new Date().toISOString();

  await writeDeckFile(decksDir, deck);
  return deck;
}

export type SetCardTagsResult = {
  deck: Deck;
  updated: { name: string; tags: string[] }[];
  rejected: RejectedCard[];
};

export async function setCardTagsResult(
  name: string,
  updates: { name: string; tags: string[] }[],
  decksDir: string = DEFAULT_DECKS_DIR()
): Promise<SetCardTagsResult> {
  const deck = await getDeck(name, decksDir);
  if (!deck) {
    throw new Error(`Deck not found: ${name}`);
  }

  const byNameLower = new Map(deck.cards.map((c) => [c.name.toLowerCase(), c]));
  const updated: { name: string; tags: string[] }[] = [];
  const rejected: RejectedCard[] = [];

  for (const update of updates) {
    const card = byNameLower.get(update.name.toLowerCase());
    if (!card) {
      rejected.push({ name: update.name, reason: "Card not in deck" });
      continue;
    }
    card.tags = update.tags;
    updated.push({ name: card.name, tags: update.tags });
  }

  deck.updatedAt = new Date().toISOString();
  await writeDeckFile(decksDir, deck);

  return { deck, updated, rejected };
}

export async function renameTag(
  name: string,
  from: string,
  to: string,
  decksDir: string = DEFAULT_DECKS_DIR()
): Promise<Deck> {
  const deck = await getDeck(name, decksDir);
  if (!deck) {
    throw new Error(`Deck not found: ${name}`);
  }

  deck.cards = deck.cards.map((c) => {
    if (!c.tags || !c.tags.includes(from)) return c;
    const renamed = c.tags.map((t) => (t === from ? to : t));
    const deduped = [...new Set(renamed)];
    return { ...c, tags: deduped };
  });
  deck.updatedAt = new Date().toISOString();

  await writeDeckFile(decksDir, deck);
  return deck;
}

export type SetCardCountResult = {
  deck: Deck;
  updated: { name: string; count: number } | null;
  rejected: RejectedCard | null;
};

export async function setCardCount(
  name: string,
  cardName: string,
  count: number,
  resolver: CardResolver,
  decksDir: string = DEFAULT_DECKS_DIR()
): Promise<SetCardCountResult> {
  const deck = await getDeck(name, decksDir);
  if (!deck) {
    throw new Error(`Deck not found: ${name}`);
  }

  if (!Number.isInteger(count) || count < 1) {
    return { deck, updated: null, rejected: { name: cardName, reason: "Count must be an integer >= 1" } };
  }

  const card = deck.cards.find((c) => c.name.toLowerCase() === cardName.toLowerCase());
  if (!card) {
    return { deck, updated: null, rejected: { name: cardName, reason: "Card not in deck" } };
  }

  if (count > 1) {
    const resolved = await resolver(card.name);
    if (!resolved || !resolved.typeLine.includes("Basic Land")) {
      return {
        deck,
        updated: null,
        rejected: { name: cardName, reason: "Count > 1 only allowed for Basic Land" },
      };
    }
  }

  card.count = count;
  deck.updatedAt = new Date().toISOString();
  await writeDeckFile(decksDir, deck);

  return { deck, updated: { name: card.name, count }, rejected: null };
}

export type RemoveTagResult = {
  deck: Deck;
  affected: number;
};

export async function removeTag(
  name: string,
  tag: string,
  decksDir: string = DEFAULT_DECKS_DIR()
): Promise<RemoveTagResult> {
  const deck = await getDeck(name, decksDir);
  if (!deck) {
    throw new Error(`Deck not found: ${name}`);
  }

  let affected = 0;
  deck.cards = deck.cards.map((c) => {
    if (!c.tags || !c.tags.includes(tag)) return c;
    affected += 1;
    return { ...c, tags: c.tags.filter((t) => t !== tag) };
  });
  deck.updatedAt = new Date().toISOString();

  await writeDeckFile(decksDir, deck);
  return { deck, affected };
}

const QUOTA_TAG_NAMES = new Set(["land", "ramp", "draw", "interaction", "wipe", "wincon"]);
const UNTAGGED = "untagged";

export const RECOGNIZED_QUOTA_TAGS: string[] = [...new Set([...QUOTA_TAG_NAMES, ...INTERACTION_ROLES])];

function isRecognizedQuotaTag(tag: string): boolean {
  const lower = tag.toLowerCase();
  return QUOTA_TAG_NAMES.has(lower) || INTERACTION_ROLES.has(lower);
}

function quota(have: number, [min, max]: [number, number]): QuotaCheck {
  return {
    have,
    want: `${min}-${max}`,
    ok: have >= min && have <= max,
  };
}

const QUOTA_TARGET_FIELDS = ["lands", "ramp", "draw", "interaction", "wipes", "wincon"] as const;

function isValidTuple(value: unknown): value is [number, number] {
  if (!Array.isArray(value) || value.length !== 2) return false;
  const [min, max] = value;
  return (
    typeof min === "number" &&
    typeof max === "number" &&
    Number.isFinite(min) &&
    Number.isFinite(max) &&
    min <= max
  );
}

/**
 * Merges quota target overrides field-wise: for each field, use `perDeck`'s
 * value if valid, else `global`'s value if valid, else the built-in default.
 * A field only "applies" if it's a 2-tuple of finite numbers with min <= max;
 * an invalid field silently falls back to the next layer down (never throws).
 */
export function resolveQuotaTargets(
  global?: Partial<QuotaTargets>,
  perDeck?: Partial<QuotaTargets>
): QuotaTargets {
  const result = {} as QuotaTargets;
  for (const field of QUOTA_TARGET_FIELDS) {
    const perDeckValue = perDeck?.[field];
    const globalValue = global?.[field];
    if (isValidTuple(perDeckValue)) {
      result[field] = perDeckValue;
    } else if (isValidTuple(globalValue)) {
      result[field] = globalValue;
    } else {
      result[field] = DEFAULT_QUOTA_TARGETS[field];
    }
  }
  return result;
}

/**
 * The deck's stated contract as a list of misses: quota counts outside their
 * target and total price over `budgetUsd`. Empty = contract met.
 * ponytail: bracket is stored, not checked; official brackets need the
 * game-changer / tutor / extra-turn / combo lists. Add `checkBracket()` when
 * that list is in the local mirror.
 */
export function contractViolations(
  deck: Deck,
  report: Pick<DeckReport, "quotaCheck" | "priceUsd">
): string[] {
  const out: string[] = [];
  for (const [key, q] of Object.entries(report.quotaCheck)) {
    if (q.ok) continue;
    const min = Number(q.want.split("-")[0]);
    out.push(`${key} ${q.have} ${q.have < min ? "<" : ">"} ${q.want}`);
  }
  const { budgetUsd } = deck;
  if (budgetUsd != null && report.priceUsd.total > budgetUsd) {
    out.push(`budget $${report.priceUsd.total.toFixed(2)} > $${budgetUsd}`);
  }
  return out;
}

export type DeckMeta = {
  bracket?: number;
  budget_usd?: number;
  quota_targets?: Partial<QuotaTargets>;
  strategy?: string;
  themes?: string[];
};

/** Sets bracket / budget / per-deck quota targets. Only given fields change. */
export async function setDeckMeta(
  name: string,
  meta: DeckMeta,
  decksDir: string = DEFAULT_DECKS_DIR()
): Promise<Deck> {
  const deck = await getDeck(name, decksDir);
  if (!deck) throw new Error(`Deck not found: ${name}`);
  if (meta.bracket !== undefined) {
    if (![1, 2, 3, 4, 5].includes(meta.bracket)) throw new Error(`bracket must be 1-5: ${meta.bracket}`);
    deck.bracket = meta.bracket as Deck["bracket"];
  }
  if (meta.budget_usd !== undefined) {
    if (!(meta.budget_usd > 0)) throw new Error(`budget_usd must be positive: ${meta.budget_usd}`);
    deck.budgetUsd = meta.budget_usd;
  }
  if (meta.strategy !== undefined) {
    if (meta.strategy.length > 2000) throw new Error("strategy must be at most 2000 chars");
    deck.strategy = meta.strategy;
  }
  if (meta.themes !== undefined) {
    const seen = new Set<string>();
    const themes: string[] = [];
    for (const raw of meta.themes) {
      const t = raw.trim();
      if (t.length < 1 || t.length > 40) throw new Error(`theme must be 1-40 chars: "${raw}"`);
      if (seen.has(t.toLowerCase())) continue;
      seen.add(t.toLowerCase());
      themes.push(t);
    }
    if (themes.length > 12) throw new Error("at most 12 themes");
    if (themes.length) deck.themes = themes;
    else delete deck.themes;
  }
  for (const field of QUOTA_TARGET_FIELDS) {
    const v = meta.quota_targets?.[field];
    if (v === undefined) continue;
    if (!isValidTuple(v)) throw new Error(`quota_targets.${field} must be [min, max] with min <= max`);
    deck.quotaTargets = { ...deck.quotaTargets, [field]: v };
  }
  deck.updatedAt = new Date().toISOString();
  await writeDeckFile(decksDir, deck);
  return deck;
}

/** Deterministic originality score from EDHREC rank; see docs/design.md "Originality score". */
export function originalityScore(
  cards: { count: number; typeLine: string; edhrecRank?: number | null }[],
): { score: number | null; ranked: number; unranked: number } {
  let sum = 0;
  let ranked = 0;
  let unranked = 0;
  for (const c of cards) {
    if (c.typeLine.includes("Basic Land")) continue;
    if (typeof c.edhrecRank === "number") {
      sum += c.count * Math.min(1, Math.log10(Math.max(1, c.edhrecRank)) / 4);
      ranked += c.count;
    } else unranked += c.count;
  }
  return { score: ranked ? Math.round((100 * sum) / ranked) : null, ranked, unranked };
}

export async function deckReport(
  name: string,
  resolver: CardResolver,
  decksDir: string = DEFAULT_DECKS_DIR(),
  targets?: Partial<QuotaTargets>
): Promise<DeckReport> {
  const deck = await getDeck(name, decksDir);
  if (!deck) {
    throw new Error(`Deck not found: ${name}`);
  }

  const effectiveTargets = resolveQuotaTargets(targets, deck.quotaTargets);
  const sideboard = deck.cards
    .filter((c) => c.board === "side")
    .map((c) => ({ name: c.name, count: c.count ?? 1 }));
  const mainCards = deck.cards.filter((c) => c.board !== "side");

  const byTag: Record<string, number> = {};
  const curve: Record<string, number> = {
    "0": 0,
    "1": 0,
    "2": 0,
    "3": 0,
    "4": 0,
    "5": 0,
    "6": 0,
    "7+": 0,
  };
  const identityViolations: string[] = [];
  let total = 0;
  let untaggedForQuota = 0;
  let interactionHave = 0;
  let onArena = 0;
  let priceTotal = 0;
  let unpriced = 0;
  const arenaMissing: string[] = [];
  const arenaUnknown: string[] = [];
  const originalityInput: { count: number; typeLine: string; edhrecRank?: number | null }[] = [];

  // Resolve every card up front, concurrently. Resolving inside the loop below
  // made the report cost one serial round trip per card, which is ~75 of them
  // for a full Commander deck. Duplicate names are resolved once.
  const resolvedByName = new Map<string, ResolvedCard | null>();
  await Promise.all(
    [...new Set(mainCards.map((c) => c.name))].map(async (name) => {
      resolvedByName.set(name, await resolver(name));
    }),
  );

  for (const card of mainCards) {
    const count = card.count ?? 1;
    total += count;

    const tags = card.tags ?? [];
    if (tags.length === 0) {
      byTag[UNTAGGED] = (byTag[UNTAGGED] ?? 0) + count;
    } else {
      for (const tag of tags) {
        byTag[tag] = (byTag[tag] ?? 0) + count;
      }
    }
    if (!tags.some((t) => isRecognizedQuotaTag(t))) {
      untaggedForQuota += count;
    }
    if (tags.some((t) => INTERACTION_ROLES.has(t.toLowerCase()))) {
      interactionHave += count;
    }

    const resolved = resolvedByName.get(card.name) ?? null;
    originalityInput.push({ count, typeLine: resolved?.typeLine ?? "", edhrecRank: resolved?.edhrecRank ?? null });
    if (typeof resolved?.usd === "number") priceTotal += resolved.usd * count;
    else unpriced += count;
    if (resolved) {
      if (deck.commander && !isSubsetIdentity(resolved.colorIdentity, deck.commanderIdentity)) {
        identityViolations.push(card.name);
      }
      const isLand = resolved.typeLine.includes("Land");
      if (!isLand) {
        const cmc = Math.floor(resolved.cmc);
        const bucket = cmc >= 7 ? "7+" : String(Math.max(0, cmc));
        curve[bucket] = (curve[bucket] ?? 0) + count;
      }

      if (resolved.arena === true) {
        onArena += count;
      } else if (resolved.arena === false) {
        arenaMissing.push(card.name);
      } else {
        arenaUnknown.push(card.name);
      }
    } else {
      arenaUnknown.push(card.name);
    }
  }

  const landsHave = byTag["land"] ?? 0;
  const rampHave = byTag["ramp"] ?? 0;
  const drawHave = byTag["draw"] ?? 0;
  const wipesHave = byTag["wipe"] ?? 0;
  const winconHave = byTag["wincon"] ?? 0;

  const quotaCheck = {
    lands: quota(landsHave, effectiveTargets.lands),
    ramp: quota(rampHave, effectiveTargets.ramp),
    draw: quota(drawHave, effectiveTargets.draw),
    interaction: quota(interactionHave, effectiveTargets.interaction),
    wipes: quota(wipesHave, effectiveTargets.wipes),
    wincon: quota(winconHave, effectiveTargets.wincon),
  };
  const priceUsd = { total: Math.round(priceTotal * 100) / 100, unpriced };

  return {
    sideboard,
    total,
    targetTotal: EDH_TARGET_TOTAL,
    overUnder: total - EDH_TARGET_TOTAL,
    byTag,
    untaggedForQuota,
    curve,
    quotaCheck,
    priceUsd,
    originality: originalityScore(originalityInput),
    violations: contractViolations(deck, { quotaCheck, priceUsd }),
    identityViolations,
    arenaCheck: {
      onArena,
      total,
      missing: arenaMissing,
      unknown: arenaUnknown,
    },
  };
}

export type DeckSummary = {
  total: number;
  quotaCheck: DeckReport["quotaCheck"];
  untaggedForQuota: number;
  remaining: number;
  arenaCheck: DeckReport["arenaCheck"];
  violations: string[];
  priceUsd: DeckReport["priceUsd"];
};

export async function deckSummary(
  name: string,
  resolver: CardResolver,
  decksDir: string = DEFAULT_DECKS_DIR(),
  targets?: Partial<QuotaTargets>
): Promise<DeckSummary> {
  const report = await deckReport(name, resolver, decksDir, targets);
  return {
    total: report.total,
    quotaCheck: report.quotaCheck,
    untaggedForQuota: report.untaggedForQuota,
    remaining: 100 - report.total,
    arenaCheck: report.arenaCheck,
    violations: report.violations,
    priceUsd: report.priceUsd,
  };
}
