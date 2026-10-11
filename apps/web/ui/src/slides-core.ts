/**
 * Pure, testable validation for the deck_present result a tool call carries.
 *
 * Sibling of chart-core.ts and compare-core.ts, same contract: the result is
 * untrusted (tool output derived from card data the model saw), a null return
 * is not a user-visible error (the caller falls back to the plain tool chip),
 * and truncated results (2048 chars + "…") fail JSON.parse and land in the same
 * null path. No DOM, no React — ChatPanel owns the rendering.
 *
 * Each slide's chart is validated by parseChartSpec, not a second validator.
 */

import { parseChartSpec } from "./chart-core.js";
import { checkSlideHtml } from "./slide-html-core.js";
import type { Slide, SlideSpec } from "./types.js";

/** Most slides the strip will show. Also bounds the 2048-char tool-result budget. */
export const MAX_SLIDES = 6;
/** Longest slide title (a tab label). */
export const MAX_TITLE_LEN = 40;
/** Longest slide text body. */
export const MAX_TEXT_LEN = 320;

/**
 * Returns the validated spec, or null if anything about it is wrong.
 */
export function parseSlideSpec(result?: string): SlideSpec | null {
  if (typeof result !== "string" || result.length === 0) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(result);
  } catch {
    console.debug("parseSlideSpec: result is not JSON");
    return null;
  }
  const bad = (why: string): null => {
    console.debug(`parseSlideSpec: ${why}`);
    return null;
  };
  if (parsed === null || typeof parsed !== "object") return bad("not an object");
  const p = parsed as Record<string, unknown>;
  if (p.kind !== "slides") return bad("wrong kind");
  if (!Array.isArray(p.slides) || p.slides.length < 1 || p.slides.length > MAX_SLIDES) {
    return bad("bad slides length");
  }
  const slides: Slide[] = [];
  for (const row of p.slides) {
    if (row === null || typeof row !== "object") return bad("bad slide");
    const s = row as Record<string, unknown>;
    if (typeof s.title !== "string" || s.title.length < 1 || s.title.length > MAX_TITLE_LEN) {
      return bad("bad title");
    }
    if (s.text !== undefined && (typeof s.text !== "string" || s.text.length > MAX_TEXT_LEN)) {
      return bad("bad text");
    }
    const hasText = typeof s.text === "string" && s.text.length > 0;
    const hasChart = s.chart !== undefined;
    const hasHtml = s.html !== undefined;
    if (!hasText && !hasChart && !hasHtml) {
      return bad("slide has neither text, chart nor html");
    }
    const slide: Slide = { title: s.title };
    if (hasText) slide.text = s.text as string;
    if (hasHtml) {
      // Rejecting the html rejects the whole spec rather than silently
      // dropping the slide: a slide that exists only to carry html would
      // otherwise render as an empty titled tab.
      const html = checkSlideHtml(s.html);
      if (!html) return bad("bad html");
      slide.html = html;
    }
    if (hasChart) {
      // parseChartSpec reads the `chart` key of a JSON string, so re-wrap.
      const chart = parseChartSpec(JSON.stringify({ chart: s.chart }));
      if (!chart) return bad("bad chart");
      slide.chart = chart;
    }
    slides.push(slide);
  }
  return { slides };
}
