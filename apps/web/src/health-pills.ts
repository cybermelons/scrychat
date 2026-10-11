import type { CollectionHealth, DbHealth } from "./health-core.js";

/**
 * Pure classification of GET /api/health into the three status pills.
 *
 * Classification is driven by the server's data, not by client constants:
 * `collection.freshness` is already decided by the server, and
 * `staleAfterDays` is echoed so the threshold is only quoted in the hover
 * text, never duplicated as a second copy that can drift.
 *
 * It is a pure function (no DOM, React, fetch or fs) so it tests with plain
 * objects: no fetch mock, no renderer.
 */
export interface HealthResponse {
  ok: boolean;
  repoRoot: string;
  skillLoaded: boolean;
  /** path.join(...) in the handler: always a string, even when unreadable */
  skillPath: string;
  db: DbHealth;
  collection: CollectionHealth;
}

export type PillTone = "ok" | "warn" | "dim";

export interface Pill {
  id: string;
  tone: PillTone;
  /** short, fits a pill */
  label: string;
  /** hover text: longer explanation naming the fix */
  title: string;
}

const n = (v: number): string => v.toLocaleString("en-US");

function mirrorPill(db: DbHealth): Pill {
  const id = "health-mirror";
  if (!db.exists) {
    return {
      id,
      tone: "warn",
      label: "mirror: absent",
      title: `No local card mirror at ${db.path}. Card lookups leave the machine. Ingest the mirror to fix.`,
    };
  }
  if (db.cardCount === null) {
    return {
      id,
      tone: "dim",
      label: "mirror: unknown",
      title: `Mirror file exists at ${db.path} but its card count could not be read (usable as mirror: ${db.usableAsMirror ? "yes" : "no"}).`,
    };
  }
  if (db.cardCount === 0) {
    return {
      id,
      tone: "warn",
      label: "mirror: empty",
      title: `Mirror file at ${db.path} exists but holds 0 cards. Card lookups leave the machine. Re-ingest to fix.`,
    };
  }
  const arena =
    db.arenaPopulated !== null && db.arenaPopulated > 0 ? ` + ${n(db.arenaPopulated)} arena` : "";
  const label = `mirror: ${n(db.cardCount)} cards${arena}`;
  if (!db.usableAsMirror) {
    return {
      id,
      tone: "warn",
      label,
      title: `Mirror at ${db.path} has ${n(db.cardCount)} cards but is NOT usable as a mirror, so lookups still leave the machine. Re-ingest to fix.`,
    };
  }
  return {
    id,
    tone: "ok",
    label,
    title: `Mirror at ${db.path} has ${n(db.cardCount)} cards and is usable as a mirror: lookups stay local.`,
  };
}

function skillPill(h: HealthResponse): Pill {
  return h.skillLoaded
    ? { id: "health-skill", tone: "ok", label: "skill: readable", title: `Skill file readable at ${h.skillPath}.` }
    : {
        id: "health-skill",
        tone: "warn",
        label: "skill: missing",
        title: `Skill file not readable at ${h.skillPath}. Restore it so the deck-builder skill loads.`,
      };
}

function arenaPill(c: CollectionHealth): Pill {
  const id = "health-arena";
  if (!c.exists) {
    return {
      id,
      tone: "dim",
      label: "arena: none",
      title: `No Arena collection snapshot at ${c.path}. Import one from Settings.`,
    };
  }
  const label = `arena: ${c.label}`;
  switch (c.freshness) {
    case "fresh":
      return { id, tone: "ok", label, title: `Arena snapshot is fresh (stale after ${c.staleAfterDays} days).` };
    case "stale":
      return {
        id,
        tone: "warn",
        label,
        title: `Arena snapshot is stale (older than ${c.staleAfterDays} days). Re-import it.`,
      };
    case "future":
      return {
        id,
        tone: "warn",
        label,
        title: `Arena snapshot is dated in the future (clock skew). Check the system clock or re-import. Stale after ${c.staleAfterDays} days.`,
      };
    default:
      return {
        id,
        tone: "dim",
        label,
        title: `Arena snapshot age is unknown (no usable import time). Stale after ${c.staleAfterDays} days.`,
      };
  }
}

/** Always 3 pills, in order: mirror, skill, arena. */
export function healthPills(h: HealthResponse): Pill[] {
  return [mirrorPill(h.db), skillPill(h), arenaPill(h.collection)];
}
