/**
 * Pure, testable guard for deck-name inputs coming over HTTP (issue #34
 * hardening). Deck names legitimately contain spaces, commas, and
 * apostrophes (e.g. "Trostani, Selesnya's Voice") so this deliberately does
 * NOT restrict to an alnum-only charset like isValidChatId — it just rejects
 * path-traversal-shaped input (path separators, null bytes) and junk
 * (empty, too long, no letters/digits at all).
 */

const MAX_DECK_NAME_LENGTH = 128;
const HAS_ALNUM_RE = /[a-zA-Z0-9]/;

export function isValidDeckName(name: unknown): name is string {
  if (typeof name !== "string") return false;
  if (name.length === 0 || name.length > MAX_DECK_NAME_LENGTH) return false;
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) return false;
  if (!HAS_ALNUM_RE.test(name)) return false;
  return true;
}
