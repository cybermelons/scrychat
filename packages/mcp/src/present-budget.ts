/*
 * The size budget deck_present has to fit inside, and the helpers that measure
 * it.
 *
 * WHY THIS EXISTS AS ITS OWN MODULE
 *
 * apps/web truncates every tool result at TOOL_RESULT_MAX_CHARS (2048) before
 * the UI sees it. A slides result over that is cut mid-string, so it is no
 * longer valid JSON, so parseSlideSpec returns null (it only console.debug's),
 * so the slide strip silently becomes a plain tool chip. Nothing throws and
 * nothing goes red: the failure mode is a missing feature, not an error.
 *
 * deck_present therefore has to know the budget. It cannot import it: the
 * dependency arrow runs away from the web app (@scrychat/mcp depends on
 * @scrychat/core; apps/web does not depend on @scrychat/mcp, and mcp must not
 * depend on the web app, because the same server also mounts in a Claude Code
 * terminal session). So the number below is a MIRROR of
 * apps/web/src/server.ts's TOOL_RESULT_MAX_CHARS, exactly as
 * apps/web/ui/src/attach-core.ts mirrors apps/web/src/image-core.ts. The
 * mirror is pinned by test/present-budget.test.ts, which reads the other file
 * and fails if the two numbers diverge.
 *
 * WHY THE EXISTING PER-FIELD CAPS DO NOT COVER THIS
 *
 * tools.ts clips each field (title 40, text 320) and slide-html-core caps html
 * at MAX_HTML_LEN (1600). Those are all satisfied by a payload that still
 * overflows, because the budget applies to the WHOLE serialized result --
 * four slides, their chart data, and the JSON punctuation -- not to any one
 * field. Measured 2026-10-11: the quota html slide runs ~1117 chars, well
 * inside its own 1600 cap, while the whole payload reaches 2223 against the
 * 2048 budget. Checking html against MAX_HTML_LEN says nothing about this;
 * only measuring the serialized result does.
 */

/**
 * MIRROR of TOOL_RESULT_MAX_CHARS in apps/web/src/server.ts. Do not edit one
 * without the other -- test/present-budget.test.ts fails on drift.
 */
export const TOOL_RESULT_BUDGET_CHARS = 2048;

/**
 * Headroom kept below the budget. A result that lands exactly at the cap is
 * one character of future punctuation away from vanishing, and the failure is
 * silent, so the producer aims under rather than at the line.
 */
export const PRESENT_BUDGET_SLACK = 64;

export type BudgetSlide = {
  title: string;
  text?: string;
  chart?: unknown;
  html?: string;
};

/**
 * The exact bytes apps/web measures. The web app truncates the stringified
 * tool result, so the budget has to be checked against the same
 * serialization -- counting fields, or the slides array alone, undercounts the
 * JSON punctuation that pushes a payload over.
 */
export function presentPayloadLength(result: {
  kind: string;
  deck: string;
  slides: BudgetSlide[];
}): number {
  return JSON.stringify(result).length;
}

/**
 * Drops whole slides from the END until the serialized result fits.
 *
 * Whole slides, not truncated text: a half-slide is indistinguishable from a
 * complete one in the UI, so trimming text would silently show the human a
 * quota table missing its worst rows. Dropping a slide is visible -- the strip
 * is shorter -- and the slides are emitted in priority order (Curve, Quotas,
 * Queue, Pending), so what goes is the least important.
 *
 * The first slide is never dropped: a slides result with no slides renders as
 * an empty strip, which is the very outcome this exists to prevent. If even
 * one slide cannot fit, it is returned and the caller is over budget -- that
 * is a bug to fix at the producer, not something to paper over here, and
 * fitPresentSlides reports it by returning `dropped` with a still-over length.
 */
export function fitPresentSlides(
  deck: string,
  slides: BudgetSlide[],
  budget = TOOL_RESULT_BUDGET_CHARS - PRESENT_BUDGET_SLACK,
): { slides: BudgetSlide[]; dropped: number; length: number } {
  const kept = [...slides];
  let dropped = 0;
  while (
    kept.length > 1 &&
    presentPayloadLength({ kind: "slides", deck, slides: kept }) > budget
  ) {
    kept.pop();
    dropped += 1;
  }
  return {
    slides: kept,
    dropped,
    length: presentPayloadLength({ kind: "slides", deck, slides: kept }),
  };
}
