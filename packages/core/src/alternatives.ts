/**
 * Functional-alternatives finder: "what else does what <card> does?"
 *
 * Algorithm:
 *  1. getCard(cardName) for oracle text + type line.
 *  2. Tokenize the card's oracle text + type line into meaningful lowercase
 *     words (stopwords removed). Score every tag in the index by how many of
 *     its own tokens (from slug/label/aliases/description) overlap with the
 *     card's tokens. Take the top ~10 candidates, preferring higher
 *     specificity (lower `count`) to break ties.
 *  3. VERIFY each candidate against Scryfall directly: a card only "really"
 *     has a tag if `otag:<slug> !"<name>"` (the card is a match on its own
 *     tag) returns at least one result — i.e. we confirm the card itself is
 *     tagged, not just that the words happen to overlap.
 *  4. For up to 4 confirmed roles (most specific / lowest-count first), run a
 *     constrained search for OTHER cards sharing that tag, and return grouped
 *     results.
 */

import type { Card } from "./scryfall.js";
import { searchCards, getCard, escapeQuotedTerm } from "./scryfall.js";
import { allTags } from "./tags.js";
import type { TagEntry } from "./tags.js";
import { getLocalDb, findAlternativesLocal } from "./local.js";

const STOPWORDS = new Set([
  "a", "an", "the", "of", "to", "and", "or", "for", "with", "your", "you",
  "this", "that", "it", "its", "into", "on", "in", "at", "as", "is", "are",
  "if", "would", "instead", "one", "more", "than", "under", "control", "each",
  "when", "whenever", "then", "may", "from", "up", "put", "puts", "other",
  "creature", "creatures", "permanent", "permanents", "player", "players",
  "card", "cards", "target", "any", "all", "not", "be", "have", "has",
]);

const MAX_CANDIDATES = 10;
const MAX_CONFIRMED_ROLES = 4;
const DEFAULT_LIMIT_PER_ROLE = 8;

function tokenize(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
  return new Set(words);
}

function tagTokens(tag: TagEntry): Set<string> {
  const parts = [tag.slug.replace(/-/g, " "), tag.label, ...tag.aliases, tag.description ?? ""];
  return tokenize(parts.join(" "));
}

function overlapScore(cardTokens: Set<string>, candidateTokens: Set<string>): number {
  let score = 0;
  for (const t of candidateTokens) {
    if (cardTokens.has(t)) score += 1;
  }
  return score;
}

async function rankCandidateTags(card: Card): Promise<TagEntry[]> {
  const cardTokens = tokenize(`${card.oracleText ?? ""} ${card.typeLine}`);
  if (cardTokens.size === 0) return [];

  const tags = await allTags();

  const scored = tags
    .map((tag) => ({ tag, score: overlapScore(cardTokens, tagTokens(tag)) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      // Prefer higher specificity (lower count) as a tiebreaker.
      const ac = a.tag.count ?? Number.MAX_SAFE_INTEGER;
      const bc = b.tag.count ?? Number.MAX_SAFE_INTEGER;
      return ac - bc;
    });

  return scored.slice(0, MAX_CANDIDATES).map((s) => s.tag);
}

async function verifyCardHasTag(cardName: string, slug: string): Promise<boolean> {
  const { total } = await searchCards(`otag:${slug} !"${escapeQuotedTerm(cardName)}"`, { limit: 1 });
  return total > 0;
}

export interface RoleAlternatives {
  slug: string;
  label: string;
  members: Card[];
}

export interface FindAlternativesResult {
  card: string;
  roles: RoleAlternatives[];
}

export interface FindAlternativesOptions {
  colorIdentityWithin?: string;
  maxPrice?: number;
  limitPerRole?: number;
}

export async function findAlternatives(
  cardName: string,
  opts: FindAlternativesOptions = {},
): Promise<FindAlternativesResult> {
  const db = getLocalDb();
  if (db) {
    const local = findAlternativesLocal(db, cardName, opts);
    if (local) return local;
  }

  return findAlternatives_live(cardName, opts);
}

async function findAlternatives_live(
  cardName: string,
  opts: FindAlternativesOptions = {},
): Promise<FindAlternativesResult> {
  const limitPerRole = opts.limitPerRole ?? DEFAULT_LIMIT_PER_ROLE;

  const card = await getCard(cardName);
  if (!card) {
    return { card: cardName, roles: [] };
  }

  const candidates = await rankCandidateTags(card);

  const confirmed: TagEntry[] = [];
  for (const tag of candidates) {
    if (confirmed.length >= MAX_CONFIRMED_ROLES) break;
    const has = await verifyCardHasTag(card.name, tag.slug);
    if (has) confirmed.push(tag);
  }

  // Most specific (lowest count) first among confirmed roles.
  confirmed.sort((a, b) => (a.count ?? Number.MAX_SAFE_INTEGER) - (b.count ?? Number.MAX_SAFE_INTEGER));

  const roles: RoleAlternatives[] = [];
  for (const tag of confirmed) {
    let query = `otag:${tag.slug} legal:commander -!"${escapeQuotedTerm(card.name)}"`;
    if (opts.colorIdentityWithin) {
      query += ` id<=${opts.colorIdentityWithin}`;
    }
    if (opts.maxPrice != null) {
      query += ` usd<${opts.maxPrice} prefer:usd-low`;
    }

    const { cards } = await searchCards(query, { limit: limitPerRole });
    roles.push({ slug: tag.slug, label: tag.label, members: cards });
  }

  return { card: card.name, roles };
}
