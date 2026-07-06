/**
 * Commander Spellbook API client.
 *
 * Confirmed live against backend.commanderspellbook.com (OpenAPI schema at
 * GET /schema/ — note: /schema/swagger/?format=json 404s; /schema/ is the
 * real OpenAPI JSON document).
 *
 * GET /variants/ query params (from the OpenAPI schema):
 *   q        - search query string; card names can be passed as quoted terms,
 *              e.g. `q="Hullbreaker Horror"`. Multiple card names can be
 *              combined; we OR-join simple bareword/quoted terms per card.
 *   limit    - page size
 *   offset   - pagination offset
 *   ordering - sort field
 *   count    - include total count when true
 *   variant  - filter to variants of the same combo as a given variant id
 *
 * Response shape: { count, next, previous, results: Variant[] }. Each Variant:
 *   - id: string (used to build the commanderspellbook.com/combo/<id> link)
 *   - status: "OK" | other (draft/etc — only "OK" variants are user-facing)
 *   - identity: string (e.g. "U", "BG")
 *   - uses: { card: { name, ... }, quantity, ... }[]   -> combo pieces
 *   - produces: { feature: { name, ... }, quantity }[] -> combo results
 */

import { escapeQuotedTerm } from "./scryfall.js";

const SPELLBOOK_API_BASE = "https://backend.commanderspellbook.com";
const USER_AGENT = "scrychat/0.1";

interface SpellbookCardRef {
  name: string;
}

interface SpellbookUsesEntry {
  card: SpellbookCardRef;
  quantity: number;
}

interface SpellbookFeatureRef {
  name: string;
}

interface SpellbookProducesEntry {
  feature: SpellbookFeatureRef;
  quantity: number;
}

interface SpellbookVariant {
  id: string;
  status: string;
  identity: string;
  uses: SpellbookUsesEntry[];
  produces: SpellbookProducesEntry[];
}

interface SpellbookVariantsResponse {
  count: number | null;
  next: string | null;
  previous: string | null;
  results: SpellbookVariant[];
}

export interface Combo {
  pieces: string[];
  produces: string[];
  identity: string;
  link: string;
}

function mapVariant(variant: SpellbookVariant): Combo {
  return {
    pieces: variant.uses.map((u) => u.card.name),
    produces: variant.produces.map((p) => p.feature.name),
    identity: variant.identity,
    link: `https://commanderspellbook.com/combo/${variant.id}`,
  };
}

/**
 * Build a `q` search term that matches variants using ALL given card names.
 * Commander Spellbook's search grammar supports quoted exact-name terms;
 * space-joining multiple quoted names ANDs them (all must be present).
 */
export function buildCardsQuery(cards: string[]): string {
  return cards.map((c) => `"${escapeQuotedTerm(c)}"`).join(" ");
}

export async function findCombos(cards: string[], limit = 10): Promise<Combo[]> {
  if (cards.length === 0) return [];

  const params = new URLSearchParams({
    q: buildCardsQuery(cards),
    limit: String(limit),
  });

  const url = `${SPELLBOOK_API_BASE}/variants/?${params.toString()}`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
  });

  if (res.status === 404) return [];
  if (!res.ok) {
    throw new Error(`Commander Spellbook request failed: ${res.status} ${res.statusText}`);
  }

  const body = (await res.json()) as SpellbookVariantsResponse;

  return body.results.filter((v) => v.status === "OK").slice(0, limit).map(mapVariant);
}
