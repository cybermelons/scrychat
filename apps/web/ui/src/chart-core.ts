/**
 * Pure, testable validation for the chart spec a tool result carries.
 *
 * Extracted from ChatPanel.tsx so the rejection paths are unit-testable: the
 * spec is untrusted (it arrives as tool output derived from card data the
 * model saw), and it is the only thing standing between a malformed result
 * and the renderer. No DOM, no React — ChatPanel owns the rendering.
 */

import type { ChartSpec } from "./types.js";

/** Longest `data` array the renderer will draw. Keeps one bad spec from
 *  emitting thousands of DOM nodes. */
export const MAX_CHART_ROWS = 32;

/**
 * Returns the validated spec, or null if anything about it is wrong.
 * A null return is not an error path the user sees: the caller falls back to
 * the plain tool chip. Truncated results (2048 chars + "…") fail JSON.parse
 * and land here too.
 */
export function parseChartSpec(result?: string): ChartSpec | null {
  if (typeof result !== "string" || result.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch {
    console.debug("parseChartSpec: result is not JSON");
    return null;
  }
  const bad = (why: string): null => {
    console.debug(`parseChartSpec: ${why}`);
    return null;
  };
  if (parsed === null || typeof parsed !== "object") return bad("not an object");
  const chart = (parsed as Record<string, unknown>).chart;
  if (chart === null || typeof chart !== "object") return bad("no chart");
  const c = chart as Record<string, unknown>;
  if (c.type !== "bar") return bad("unsupported type");
  if (!Array.isArray(c.data) || c.data.length < 1 || c.data.length > MAX_CHART_ROWS) {
    return bad("bad data length");
  }
  for (const row of c.data) {
    if (row === null || typeof row !== "object") return bad("bad row");
    const r = row as Record<string, unknown>;
    if (typeof r.x !== "string" || r.x.length > 16) return bad("bad row x");
    if (typeof r.y !== "number" || !Number.isFinite(r.y) || r.y < 0) {
      return bad("bad row y");
    }
  }
  if (typeof c.x !== "string" || c.x.length > 80) return bad("bad x label");
  if (typeof c.y !== "string" || c.y.length > 80) return bad("bad y label");
  if (c.caption !== undefined && (typeof c.caption !== "string" || c.caption.length > 120)) {
    return bad("bad caption");
  }
  return chart as ChartSpec;
}
