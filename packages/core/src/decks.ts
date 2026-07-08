import fs from "node:fs/promises";
import path from "node:path";

export type CardEntry = {
  name: string;
  tags?: string[];
  count?: number;
};

export type Deck = {
  name: string;
  commander: string;
  commanderIdentity: string[];
  cards: CardEntry[];
  updatedAt: string;
};

export type ResolvedCard = {
  name: string;
  colorIdentity: string[];
  cmc: number;
  typeLine: string;
  legalCommander: boolean;
  image?: string | null;
  manaCost?: string | null;
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
  };
  identityViolations: string[];
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
    if (Array.isArray(c.tags)) return { name: c.name, tags: c.tags, count: c.count };
    if (typeof c.role === "string" && c.role.length > 0) return { name: c.name, tags: [c.role], count: c.count };
    return { name: c.name, count: c.count };
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

export async function addCards(
  name: string,
  cards: CardEntry[],
  resolver: CardResolver,
  decksDir: string = DEFAULT_DECKS_DIR()
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
    if (!isSubsetIdentity(resolved.colorIdentity, deck.commanderIdentity)) {
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

    const tags = card.tags ?? (typeof (card as any).role === "string" ? [(card as any).role] : undefined);
    const entry: CardEntry = {
      name: resolved.name,
      tags,
      count: card.count ?? 1,
    };
    deck.cards.push(entry);
    existingNamesLower.add(resolved.name.toLowerCase());
    added.push(entry);
  }

  deck.updatedAt = new Date().toISOString();
  await writeDeckFile(decksDir, deck);

  return { added, rejected };
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

const QUOTA_TAG_NAMES = new Set(["land", "ramp", "draw", "interaction", "wipe"]);
const UNTAGGED = "untagged";

function isRecognizedQuotaTag(tag: string): boolean {
  const lower = tag.toLowerCase();
  return QUOTA_TAG_NAMES.has(lower) || INTERACTION_ROLES.has(lower);
}

function quota(have: number, min: number, max: number): QuotaCheck {
  return {
    have,
    want: `${min}-${max}`,
    ok: have >= min && have <= max,
  };
}

export async function deckReport(
  name: string,
  resolver: CardResolver,
  decksDir: string = DEFAULT_DECKS_DIR()
): Promise<DeckReport> {
  const deck = await getDeck(name, decksDir);
  if (!deck) {
    throw new Error(`Deck not found: ${name}`);
  }

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

  for (const card of deck.cards) {
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

    const resolved = await resolver(card.name);
    if (resolved) {
      if (!isSubsetIdentity(resolved.colorIdentity, deck.commanderIdentity)) {
        identityViolations.push(card.name);
      }
      const isLand = resolved.typeLine.includes("Land");
      if (!isLand) {
        const cmc = Math.floor(resolved.cmc);
        const bucket = cmc >= 7 ? "7+" : String(Math.max(0, cmc));
        curve[bucket] = (curve[bucket] ?? 0) + count;
      }
    }
  }

  const landsHave = byTag["land"] ?? 0;
  const rampHave = byTag["ramp"] ?? 0;
  const drawHave = byTag["draw"] ?? 0;
  const wipesHave = byTag["wipe"] ?? 0;

  return {
    total,
    targetTotal: EDH_TARGET_TOTAL,
    overUnder: total - EDH_TARGET_TOTAL,
    byTag,
    untaggedForQuota,
    curve,
    quotaCheck: {
      lands: quota(landsHave, 36, 38),
      ramp: quota(rampHave, 10, 12),
      draw: quota(drawHave, 10, 12),
      interaction: quota(interactionHave, 8, 10),
      wipes: quota(wipesHave, 2, 4),
    },
    identityViolations,
  };
}
