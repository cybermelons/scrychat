/**
 * Pure, testable validation for the goldfish_compare result a tool call carries.
 *
 * Sibling of chart-core.ts, same contract: the result is untrusted (tool output
 * derived from card data the model saw), a null return is not a user-visible
 * error (the caller falls back to the plain tool chip), and truncated results
 * (2048 chars + "…") fail JSON.parse and land in the same null path.
 * No DOM, no React — ChatPanel owns the rendering.
 */

import type { CompareBuild, CompareSpec } from "./types.js";

/** Longest build label the renderer will show. */
export const MAX_LABEL_LEN = 80;

/**
 * Mean-turn differences smaller than this are reported as a tie, not a winner.
 *
 * Why 0.25: turnsToOnline is a mean of whole-number turns, so 0.25 means fewer
 * than 1 game in 4 came online a turn sooner. The simulator carries a one-sided
 * ceiling that no iteration count averages away: core goldfish.ts marks the
 * mana model OPTIMISTIC (per-colour check is not a bipartite matching, coloured
 * sources are not consumed between casts, hybrid/Phyrexian/{X} pips count as
 * generic) and sequencing as "greedy, no lookahead". Those comments do not
 * quantify the bias, so this is a judgement call: a quarter turn is the
 * smallest gap a player would act on, and anything below it is inside what the
 * model cannot resolve. Raise it if real-play numbers disagree.
 */
export const DELTA_NOISE_FLOOR = 0.25;

export type CompareVerdict = { fasterIndex: 0 | 1 | null; magnitude: number };

/** Which build is faster, or null when the gap is inside the noise floor.
 *  delta < 0 means builds[0] came online sooner. magnitude is |delta|. */
export function compareVerdict(spec: CompareSpec): CompareVerdict {
  const magnitude = Math.abs(spec.delta);
  if (magnitude < DELTA_NOISE_FLOOR) return { fasterIndex: null, magnitude };
  return { fasterIndex: spec.delta < 0 ? 0 : 1, magnitude };
}

const nonNeg = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

/**
 * Returns the validated spec, or null if anything about it is wrong.
 */
export function parseCompareSpec(result?: string): CompareSpec | null {
  if (typeof result !== "string" || result.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch {
    console.debug("parseCompareSpec: result is not JSON");
    return null;
  }
  const bad = (why: string): null => {
    console.debug(`parseCompareSpec: ${why}`);
    return null;
  };
  if (parsed === null || typeof parsed !== "object") return bad("not an object");
  const p = parsed as Record<string, unknown>;
  if (p.kind !== "goldfish_compare") return bad("wrong kind");
  for (const k of ["seed", "iterations", "maxTurns", "onlineThreshold"] as const) {
    if (!nonNeg(p[k])) return bad(`bad ${k}`);
  }
  // delta is the one field that is legitimately negative.
  if (typeof p.delta !== "number" || !Number.isFinite(p.delta)) return bad("bad delta");
  if (!Array.isArray(p.builds) || p.builds.length !== 2) return bad("builds is not exactly 2");
  const builds: CompareBuild[] = [];
  for (const row of p.builds) {
    if (row === null || typeof row !== "object") return bad("bad build");
    const b = row as Record<string, unknown>;
    if (typeof b.label !== "string" || b.label.length < 1 || b.label.length > MAX_LABEL_LEN) {
      return bad("bad build label");
    }
    if (!nonNeg(b.turnsToOnline)) return bad("bad turnsToOnline");
    // goldfish() returns mulligans / n, a 0..1 fraction (the chart caption multiplies by 100).
    if (!nonNeg(b.mulliganRate) || b.mulliganRate > 1) return bad("bad mulliganRate");
    if (!nonNeg(b.stalledGames)) return bad("bad stalledGames");
    builds.push({
      label: b.label,
      turnsToOnline: b.turnsToOnline,
      mulliganRate: b.mulliganRate,
      stalledGames: b.stalledGames,
    });
  }
  // The verdict reads delta; a delta that disagrees with the builds would name a false winner.
  if (Math.abs(p.delta - (builds[0].turnsToOnline - builds[1].turnsToOnline)) > 1e-6) {
    return bad("delta disagrees with builds");
  }
  return {
    seed: p.seed as number,
    iterations: p.iterations as number,
    maxTurns: p.maxTurns as number,
    onlineThreshold: p.onlineThreshold as number,
    builds: [builds[0], builds[1]],
    delta: p.delta,
  };
}
