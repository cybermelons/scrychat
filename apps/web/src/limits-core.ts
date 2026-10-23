/**
 * Shared-subscription limits (docs/multi-user.md decision 9). Pure and clock-
 * injectable. State is in memory and resets on restart.
 * ponytail: persist the daily counts in users/<email>/usage.json if a restart
 * mid-day starts to matter.
 */
export const MAX_CONCURRENT_TURNS = 2;
export const DAILY_TURNS = 40;
export const DEFAULT_PAUSE_MS = 15 * 60 * 1000;

export type Refusal = "busy" | "user-busy" | "budget" | "paused";
export const REFUSAL_MESSAGE: Record<Refusal, string> = {
  busy: "busy, retry in a minute",
  "user-busy": "you already have a turn running",
  budget: "daily turn limit reached, try again tomorrow",
  paused: "the shared Claude quota is used up, try again later",
};

export type Acquire = { ok: true; release: () => void } | { ok: false; reason: Refusal };

/** True for the SDK's usage/quota-exhausted errors. */
export function isUsageLimitError(message: string): boolean {
  return /usage limit|limit reached|hit your limit|out of extra usage/i.test(message);
}

/**
 * Reset time (ms epoch) from a usage-limit message. The CLI formats it as
 * "...limit reached|<epoch seconds>"; anything else gets now + 15 min.
 */
export function pauseUntilFromError(message: string, now: number): number {
  const m = /\|(\d{10})\b/.exec(message);
  if (m) {
    const at = Number(m[1]) * 1000;
    if (at > now) return at;
  }
  return now + DEFAULT_PAUSE_MS;
}

export interface LimiterOpts {
  ownerId?: string | null;
  maxConcurrent?: number;
  dailyTurns?: number;
  now?: () => number;
}

export function createTurnLimiter(opts: LimiterOpts = {}) {
  const max = opts.maxConcurrent ?? MAX_CONCURRENT_TURNS;
  const daily = opts.dailyTurns ?? DAILY_TURNS;
  const now = opts.now ?? Date.now;
  const day = () => new Date(now()).toISOString().slice(0, 10);
  const active = new Set<string>(); // user ids with a turn running (1 per user)
  let counts = new Map<string, number>();
  let countsDay = day();
  let pausedUntil = 0;

  const isOwner = (u: string) => opts.ownerId != null && u === opts.ownerId;

  return {
    tryAcquire(user: string): Acquire {
      if (countsDay !== day()) {
        counts = new Map();
        countsDay = day();
      }
      const owner = isOwner(user);
      if (!owner && now() < pausedUntil) return { ok: false, reason: "paused" };
      if (active.has(user)) return { ok: false, reason: "user-busy" };
      if (active.size >= max) return { ok: false, reason: "busy" };
      if (!owner && (counts.get(user) ?? 0) >= daily) return { ok: false, reason: "budget" };
      active.add(user);
      counts.set(user, (counts.get(user) ?? 0) + 1);
      let released = false;
      return {
        ok: true,
        release: () => {
          if (released) return;
          released = true;
          active.delete(user);
        },
      };
    },
    pause(until: number): void {
      pausedUntil = Math.max(pausedUntil, until);
    },
    usage() {
      if (countsDay !== day()) {
        counts = new Map();
        countsDay = day();
      }
      return {
        day: countsDay,
        dailyTurns: daily,
        maxConcurrent: max,
        activeTurns: active.size,
        activeUsers: [...active],
        pausedUntil: pausedUntil > now() ? new Date(pausedUntil).toISOString() : null,
        counts: Object.fromEntries(counts),
      };
    },
  };
}
