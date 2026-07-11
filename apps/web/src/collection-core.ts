/**
 * Pure, testable helpers for the /api/collection route (Arena-collection
 * import). No SDK, no network, no fs — everything here is a plain data
 * transform, so it's cheap to unit test and safe to call synchronously from
 * server.ts.
 */

export type ParsedCollectionBody =
  | { kind: "log"; text: string }
  | { kind: "cards"; cards: Record<string, number> }
  | { error: string };

/**
 * Classify a request body for POST /api/collection:
 *  - a string body (any content-type, but text/plain is the intended one)
 *    is treated as a raw Player.log excerpt to run through parseArenaLog.
 *  - a JSON object with a `cards` map of numeric-string keys -> non-negative
 *    integer counts is treated as an already-parsed collection.
 *  - anything else (missing, wrong shape, invalid entries) is an error.
 */
export function parseCollectionBody(
  contentType: string | undefined,
  body: unknown,
): ParsedCollectionBody {
  if (typeof body === "string") {
    if (body.length === 0) {
      return { error: "empty request body" };
    }
    return { kind: "log", text: body };
  }

  if (body == null || typeof body !== "object" || Array.isArray(body)) {
    return {
      error:
        "expected text/plain Player.log content or a JSON object with a 'cards' map",
    };
  }

  const rec = body as Record<string, unknown>;
  if (!("cards" in rec)) {
    return { error: "JSON body missing 'cards' field" };
  }

  const rawCards = rec.cards;
  if (
    rawCards == null ||
    typeof rawCards !== "object" ||
    Array.isArray(rawCards)
  ) {
    return { error: "'cards' must be an object mapping arena id -> count" };
  }

  const entries = Object.entries(rawCards as Record<string, unknown>);
  if (entries.length === 0) {
    return { error: "'cards' object is empty" };
  }

  const cards: Record<string, number> = {};
  for (const [key, value] of entries) {
    if (!/^\d+$/.test(key)) {
      return { error: `invalid arena id key (must be numeric): "${key}"` };
    }
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
      return { error: `invalid count for arena id "${key}" (must be a non-negative integer)` };
    }
    cards[key] = value;
  }

  return { kind: "cards", cards };
}

export interface ImportResult {
  uniqueOwned: number;
  totalCards: number;
  unmatchedCount: number;
  unmatchedIds: string[];
}

const MAX_UNMATCHED_IDS = 100;

/**
 * Build the summary returned to the client after an import: counts plus a
 * capped list of unmatched arena ids (so a big log doesn't blow up the
 * response).
 */
export function buildImportResult(
  cards: Record<string, number>,
  mapResult: { byArenaId: Map<string, { oracleId: string; name: string }>; unmatched: string[] },
): ImportResult {
  const totalCards = Object.values(cards).reduce((sum, n) => sum + n, 0);
  return {
    uniqueOwned: mapResult.byArenaId.size,
    totalCards,
    unmatchedCount: mapResult.unmatched.length,
    unmatchedIds: mapResult.unmatched.slice(0, MAX_UNMATCHED_IDS),
  };
}
