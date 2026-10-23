// ponytail: in-memory ring, lost on restart; persist to JSONL in core when users ask
export type HistoryEntry = { at: string; action: string };
export const HISTORY_CAP = 200;

export function createDeckHistory(cap = HISTORY_CAP) {
  const rings = new Map<string, HistoryEntry[]>();
  const key = (deck: string) => deck.toLowerCase();
  return {
    record(deck: string, action: string, at = new Date().toISOString()): HistoryEntry {
      const entry = { at, action };
      const ring = rings.get(key(deck)) ?? [];
      ring.push(entry);
      if (ring.length > cap) ring.shift();
      rings.set(key(deck), ring);
      return entry;
    },
    /** newest first */
    list(deck: string): HistoryEntry[] {
      return [...(rings.get(key(deck)) ?? [])].reverse();
    },
    rename(from: string, to: string): void {
      const ring = rings.get(key(from));
      if (!ring || key(from) === key(to)) return;
      rings.delete(key(from));
      rings.set(key(to), ring);
    },
    delete(deck: string): void {
      rings.delete(key(deck));
    },
  };
}

const META_KEYS = ["bracket", "budget_usd", "quota_targets", "strategy", "themes"];
/** Returns an error string, or null when every key is allowed. */
export function unknownMetaField(body: Record<string, unknown>): string | null {
  const bad = Object.keys(body).find((k) => !META_KEYS.includes(k));
  return bad ? `unknown field: ${bad}` : null;
}

/** feedback patch: {[messageId]: 1|-1|0}; null on invalid. */
export function mergeFeedback(
  current: Record<string, 1 | -1> | undefined,
  patch: unknown,
): Record<string, 1 | -1> | null {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return null;
  const out = { ...(current ?? {}) };
  for (const [id, v] of Object.entries(patch)) {
    if (id.length === 0 || id.length > 200) return null;
    if (v === 0) delete out[id];
    else if (v === 1 || v === -1) out[id] = v;
    else return null;
  }
  return out;
}
