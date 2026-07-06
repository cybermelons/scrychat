/**
 * Scryfall API client.
 *
 * Scryfall requires a real User-Agent + Accept header on every request or it
 * returns 403 Forbidden — never drop these headers. Be a courteous citizen of
 * the ~10 req/s rate limit: SCRYFALL_MIN_INTERVAL_MS is enforced between
 * requests made through scryfallFetch.
 */

const SCRYFALL_API_BASE = "https://api.scryfall.com";
const USER_AGENT = "scrychat/0.1";
const SCRYFALL_MIN_INTERVAL_MS = 100;

/**
 * Escape a card name for embedding inside a double-quoted search term (e.g.
 * `!"${name}"`). Card names can themselves contain literal double quotes
 * (e.g. Unhinged's `"Ach! Hans, Run!"`), which would otherwise break out of
 * the quoted term and corrupt the query.
 */
export function escapeQuotedTerm(name: string): string {
  return name.replace(/"/g, '\\"');
}

let lastRequestAt = 0;

async function throttle(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < SCRYFALL_MIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, SCRYFALL_MIN_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();
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

/**
 * Fetch a Scryfall URL (absolute or path beginning with "/"). Returns the
 * parsed JSON body. Non-200 responses throw ScryfallError, EXCEPT 404, which
 * resolves to `null` (Scryfall uses 404 for "no results" on search/named
 * endpoints, which callers usually want to treat as an empty result).
 */
export async function scryfallFetch<T = unknown>(path: string): Promise<T | null> {
  const url = path.startsWith("http") ? path : `${SCRYFALL_API_BASE}${path}`;

  await throttle();

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (res.status === 404) {
    return null;
  }

  if (!res.ok) {
    throw new ScryfallError(`Scryfall request failed: ${res.status} ${res.statusText}`, res.status, url);
  }

  return (await res.json()) as T;
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
  legalities: { commander?: string };
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
  };
}

interface ScryfallSearchResponse {
  object: string;
  total_cards: number;
  has_more: boolean;
  next_page?: string;
  data: ScryfallCardResponse[];
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

export async function getCard(name: string): Promise<Card | null> {
  const params = new URLSearchParams({ fuzzy: name });
  const raw = await scryfallFetch<ScryfallCardResponse>(`/cards/named?${params.toString()}`);
  if (raw === null) return null;
  return mapCard(raw);
}
