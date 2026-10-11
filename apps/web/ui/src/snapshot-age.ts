/**
 * Classify how old an Arena collection snapshot is.
 *
 * The threshold is an absolute number of days, not a fraction of some sync
 * cadence: the snapshot is only refreshed when the user re-exports from Arena,
 * so there is no expected interval to compare against. Past two weeks, card
 * pools drift enough (drafts, packs, crafting) that suggestions built on it
 * are suspect.
 *
 * `now` is a parameter, not read internally, so tests pass an explicit instant
 * and need no fake timers or Date mocking.
 */
export const SNAPSHOT_STALE_DAYS = 14;

/**
 * A timestamp this far ahead of `now` is treated as ordinary clock jitter
 * (client vs server clocks) and reported as "just now". Beyond it, the value
 * is clock skew or a corrupt file and must be surfaced, not hidden.
 */
const FUTURE_TOLERANCE_MS = 60_000;

export type SnapshotFreshness = "fresh" | "stale" | "future" | "unknown";

export interface SnapshotAge {
  freshness: SnapshotFreshness;
  /** Whole days elapsed; null when unknown or in the future. */
  ageDays: number | null;
  /** Human text: "just now", "Nm ago", "Nh ago", "Nd ago", "unknown", "clock skew". */
  label: string;
}

export function snapshotAge(importedAt: string | null | undefined, now: number = Date.now()): SnapshotAge {
  const t = importedAt ? Date.parse(importedAt) : NaN;
  if (!Number.isFinite(t)) return { freshness: "unknown", ageDays: null, label: "unknown" };

  const ms = now - t;
  if (ms < -FUTURE_TOLERANCE_MS) return { freshness: "future", ageDays: null, label: "clock skew" };

  const mins = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(mins / 60);
  const ageDays = Math.floor(hours / 24);
  const label =
    mins < 1 ? "just now" : mins < 60 ? `${mins}m ago` : hours < 24 ? `${hours}h ago` : `${ageDays}d ago`;
  return { freshness: ageDays >= SNAPSHOT_STALE_DAYS ? "stale" : "fresh", ageDays, label };
}
