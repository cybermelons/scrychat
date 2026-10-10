/**
 * Scryfall API client.
 *
 * Scryfall requires a real User-Agent + Accept header on every request or it
 * returns 403 Forbidden — never drop these headers. Be a courteous citizen of
 * the ~10 req/s rate limit: SCRYFALL_MIN_INTERVAL_MS is enforced between
 * requests made through scryfallFetch.
 *
 * On 429 (rate limited) or 5xx-transient (503) responses, scryfallFetch
 * retries with backoff (Retry-After header if present, else a fixed
 * schedule) instead of surfacing the error immediately — downstream callers
 * shouldn't have to manually sleep-and-retry around Scryfall hiccups.
 */

import { getLocalDb, getCardLocal } from "./local.js";

const SCRYFALL_API_BASE = "https://api.scryfall.com";
const USER_AGENT = "scrychat/0.1";
const SCRYFALL_MIN_INTERVAL_MS = 150;
const MAX_RETRIES = 4;
const RETRY_BACKOFF_MS = [2000, 4000, 8000, 16000];

/**
 * Override point for tests: replaces the backoff schedule and the sleep
 * implementation so retry tests don't take (2+4+8+16)s in real time.
 */
let retryBackoffMs = RETRY_BACKOFF_MS;
let retrySleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export function __setRetryConfigForTests(config: { backoffMs?: number[]; sleep?: (ms: number) => Promise<void> } | null): void {
  retryBackoffMs = config?.backoffMs ?? RETRY_BACKOFF_MS;
  retrySleep = config?.sleep ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
}

/**
 * Escape a card name for embedding inside a double-quoted search term (e.g.
 * `!"${name}"`). Card names can themselves contain literal double quotes
 * (e.g. Unhinged's `"Ach! Hans, Run!"`), which would otherwise break out of
 * the quoted term and corrupt the query.
 */
export function escapeQuotedTerm(name: string): string {
  return name.replace(/"/g, '\\"');
}

/**
 * Time the next request may be sent, as a timestamp rather than a record of the
 * last one. Concurrent callers each claim their own slot off this value and
 * push it forward, so N callers arriving together are spaced instead of all
 * reading the same "last request" time and firing at once.
 */
let nextRequestAt = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const slot = Math.max(now, nextRequestAt);
  nextRequestAt = slot + SCRYFALL_MIN_INTERVAL_MS;
  const wait = slot - now;
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

export class ScryfallError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = "ScryfallError";
    this.status = status;
    this.url = url;
  }
}

function parseRetryAfterMs(res: Response): number | null {
  const header = res.headers.get("Retry-After");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const date = Date.parse(header);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return null;
}

/**
 * Fetch a Scryfall URL (absolute or path beginning with "/"). Returns the
 * parsed JSON body. Non-200 responses throw ScryfallError, EXCEPT 404, which
 * resolves to `null` (Scryfall uses 404 for "no results" on search/named
 * endpoints, which callers usually want to treat as an empty result).
 *
 * 429 and 503 responses are retried up to MAX_RETRIES times with backoff
 * (Retry-After header if present, else RETRY_BACKOFF_MS) before finally
 * throwing ScryfallError.
 */
export async function scryfallFetch<T = unknown>(path: string, body?: unknown): Promise<T | null> {
  const url = path.startsWith("http") ? path : `${SCRYFALL_API_BASE}${path}`;

  let attempt = 0;
  for (;;) {
    await throttle();

    const res = await fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (res.status === 404) {
      return null;
    }

    if (res.status === 429 || res.status === 503) {
      if (attempt >= MAX_RETRIES) {
        throw new ScryfallError(`Scryfall request failed: ${res.status} ${res.statusText}`, res.status, url);
      }
      const delay = parseRetryAfterMs(res) ?? retryBackoffMs[attempt] ?? retryBackoffMs[retryBackoffMs.length - 1];
      await retrySleep(delay);
      attempt += 1;
      continue;
    }

    if (!res.ok) {
      throw new ScryfallError(`Scryfall request failed: ${res.status} ${res.statusText}`, res.status, url);
    }

    return (await res.json()) as T;
  }
}

export interface Card {
  name: string;
  manaCost: string | null;
  cmc: number;
  typeLine: string;
  oracleText: string | null;
  colorIdentity: string[];
  usd: number | null;
  edhrecRank: number | null;
  image: string | null;
  uri: string;
  legalCommander: boolean;
  arena: boolean | null;
  brawlLegal: boolean | null;
  standardBrawlLegal: boolean | null;
  historicLegal: boolean | null;
  timelessLegal: boolean | null;
  producedMana: string[] | null;
  oracleId?: string;
  arenaId?: number | null;
}

interface ScryfallCardFace {
  name: string;
  mana_cost?: string;
  type_line?: string;
  oracle_text?: string;
  image_uris?: { normal?: string; large?: string };
}

interface ScryfallCardResponse {
  name: string;
  mana_cost?: string;
  cmc: number;
  type_line: string;
  oracle_text?: string;
  color_identity: string[];
  prices?: { usd?: string | null };
  edhrec_rank?: number | null;
  image_uris?: { normal?: string; large?: string };
  card_faces?: ScryfallCardFace[];
  uri: string;
  legalities: { commander?: string; brawl?: string; standardbrawl?: string; historic?: string; timeless?: string };
  games?: string[];
  produced_mana?: string[];
  oracle_id?: string;
  arena_id?: number;
}

function mapCard(raw: ScryfallCardResponse): Card {
  const faces = raw.card_faces;
  const front = faces?.[0];

  const manaCost = raw.mana_cost ?? front?.mana_cost ?? null;
  const typeLine = raw.type_line ?? front?.type_line ?? "";
  const oracleText = faces
    ? faces.map((f) => f.oracle_text ?? "").filter(Boolean).join(" // ") || null
    : raw.oracle_text ?? null;
  const image = raw.image_uris?.normal ?? front?.image_uris?.normal ?? null;

  return {
    name: raw.name,
    manaCost: manaCost || null,
    cmc: raw.cmc,
    typeLine,
    oracleText,
    colorIdentity: raw.color_identity,
    usd: raw.prices?.usd != null ? Number(raw.prices.usd) : null,
    edhrecRank: raw.edhrec_rank ?? null,
    image,
    uri: raw.uri,
    legalCommander: raw.legalities.commander === "legal",
    arena: raw.games ? raw.games.includes("arena") : null,
    brawlLegal: raw.legalities.brawl != null ? raw.legalities.brawl === "legal" : null,
    standardBrawlLegal: raw.legalities.standardbrawl != null ? raw.legalities.standardbrawl === "legal" : null,
    historicLegal: raw.legalities.historic != null ? raw.legalities.historic === "legal" : null,
    timelessLegal: raw.legalities.timeless != null ? raw.legalities.timeless === "legal" : null,
    producedMana: raw.produced_mana ?? null,
    oracleId: raw.oracle_id,
    arenaId: raw.arena_id ?? null,
  };
}

interface ScryfallSearchResponse {
  object: string;
  total_cards: number;
  has_more: boolean;
  next_page?: string;
  data: ScryfallCardResponse[];
}

interface ScryfallCollectionResponse {
  data: ScryfallCardResponse[];
  not_found?: { name?: string }[];
}

export interface SearchCardsOptions {
  limit?: number;
  order?: string;
}

export interface SearchCardsResult {
  total: number;
  cards: Card[];
}

const DEFAULT_SEARCH_LIMIT = 20;
const MAX_SEARCH_LIMIT = 175;

export async function searchCards(query: string, opts: SearchCardsOptions = {}): Promise<SearchCardsResult> {
  const limit = Math.min(opts.limit ?? DEFAULT_SEARCH_LIMIT, MAX_SEARCH_LIMIT);

  const params = new URLSearchParams({ q: query });
  if (opts.order) params.set("order", opts.order);

  let path: string | null = `/cards/search?${params.toString()}`;
  const collected: ScryfallCardResponse[] = [];
  let total = 0;
  let first = true;

  while (path) {
    const page: ScryfallSearchResponse | null = await scryfallFetch<ScryfallSearchResponse>(path);

    if (page === null) {
      if (first) return { total: 0, cards: [] };
      break;
    }
    first = false;

    total = page.total_cards;
    collected.push(...page.data);

    if (collected.length >= limit || !page.has_more || !page.next_page) {
      break;
    }
    path = page.next_page;
  }

  return {
    total,
    cards: collected.slice(0, limit).map(mapCard),
  };
}

/**
 * Memo of resolved lookups, keyed by the caller's name string.
 * A deck report resolves every card in the list on every call, so without this
 * a 75-card deck costs 75 throttled Scryfall round trips each time. Misses are
 * cached too: a name Scryfall does not know will not be known on a retry.
 * Process-lifetime only, deliberately: card data is static enough that a
 * long-lived MCP server rereading it is waste, and a fresh process reloads it.
 */
const cardCache = new Map<string, Card | null>();

/** Clears the getCard() memo. Exists for tests that change the backing data. */
export function clearCardCache(): void {
  cardCache.clear();
}

export async function getCard(name: string): Promise<Card | null> {
  const cached = cardCache.get(name);
  if (cached !== undefined) return cached;

  const card = await getCardUncached(name);
  cardCache.set(name, card);
  return card;
}

/** Scryfall accepts at most 75 identifiers per /cards/collection request. */
const COLLECTION_BATCH_SIZE = 75;

/**
 * Resolves many card names in as few requests as possible.
 *
 * /cards/collection takes 75 names per request, which turns a whole deck into
 * one or two round trips instead of one per card. It matches exact names only,
 * so any name it reports as not_found is retried through getCard()'s fuzzy
 * lookup. Results go through the same memo as getCard(), so a later getCard()
 * for any of these names costs nothing.
 */
export async function getCards(names: string[]): Promise<Map<string, Card | null>> {
  const out = new Map<string, Card | null>();
  const unresolved: string[] = [];

  for (const name of new Set(names)) {
    const cached = cardCache.get(name);
    if (cached !== undefined) out.set(name, cached);
    else unresolved.push(name);
  }

  const db = getLocalDb();
  const needRemote: string[] = [];
  for (const name of unresolved) {
    const local = db ? getCardLocal(db, name) : null;
    if (local) {
      cardCache.set(name, local);
      out.set(name, local);
    } else {
      needRemote.push(name);
    }
  }

  for (let i = 0; i < needRemote.length; i += COLLECTION_BATCH_SIZE) {
    const chunk = needRemote.slice(i, i + COLLECTION_BATCH_SIZE);
    const res = await scryfallFetch<ScryfallCollectionResponse>("/cards/collection", {
      identifiers: chunk.map((name) => ({ name })),
    });

    // Scryfall returns the matched cards in data and echoes the identifiers it
    // could not match in not_found. It does not say which request name produced
    // which card, so match them back up by name, case-insensitively.
    const byLowerName = new Map<string, Card>();
    for (const raw of res?.data ?? []) {
      const card = mapCard(raw);
      byLowerName.set(card.name.toLowerCase(), card);
    }

    for (const name of chunk) {
      const card = byLowerName.get(name.toLowerCase());
      if (card) {
        cardCache.set(name, card);
        out.set(name, card);
      }
    }
  }

  // Anything the exact-name batch missed gets one fuzzy lookup each. A deck
  // normally has few of these, so the serial cost is small.
  for (const name of needRemote) {
    if (!out.has(name)) out.set(name, await getCard(name));
  }

  return out;
}

async function getCardUncached(name: string): Promise<Card | null> {
  const db = getLocalDb();
  if (db) {
    const local = getCardLocal(db, name);
    if (local) return local;
  }

  const params = new URLSearchParams({ fuzzy: name });
  const raw = await scryfallFetch<ScryfallCardResponse>(`/cards/named?${params.toString()}`);
  if (raw === null) return null;
  return mapCard(raw);
}
