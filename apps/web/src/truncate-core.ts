/**
 * Length-capping for tool results (issue #70).
 *
 * WHAT THE CAP IS ACTUALLY FOR
 *
 * `TOOL_RESULT_MAX_CHARS` arrived in a4420e4 (2026-07-07, "Rich chat
 * rendering"), alongside the tool chip and its hover popover. Its job is to
 * keep a 4KB blob out of `data-result` on every chip and out of the <pre>
 * popover. That is a DISPLAY bound.
 *
 * It was never a model-context bound. The loop in server.ts that applied it is
 * a read-only observer of the Agent SDK's message stream: by the time a
 * tool_result block is seen there, the model has already received it in full
 * inside the SDK's own conversation. And it was never a storage bound either —
 * measured 2026-10-11, all of chats/ is 33 KB across 8 chats and 10 tool
 * results; uncapping the largest realistic result costs tens of KiB.
 *
 * Applying a display bound at CAPTURE time is what caused #70. Measured on the
 * real "Grothama Fight Draw" deck:
 *
 *   deck_get full result        5458 chars, 76 card names
 *   sliced at 2048             "...,{"name":"Ete<cut>"  -> 29 names, INVALID JSON
 *
 * Two consumers break, neither of which displays anything:
 *
 *   - parseChartSpec / parseCompareSpec / parseSlideSpec JSON.parse the stored
 *     string; invalid JSON returns null and the component silently degrades to
 *     a plain chip, with only a console.debug.
 *   - grounding-core.ts resolves card claims against names in the result. Its
 *     header documents the consequence as a CONTRACT: "a name past the
 *     truncation point is invisible here, so a claim can be reported
 *     ungrounded when the fetch was real." Tier B's B-fmt-7 has failed on
 *     every run with truncatedResults=1 while naming cards that WERE fetched.
 *
 * WHY NOT JUST TRUNCATE ON A RECORD BOUNDARY
 *
 * That was the first fix attempted here, and it was measured and rejected
 * rather than reasoned away. Dropping whole trailing records keeps the JSON
 * valid, but on the real deck it preserved 28 names where the raw slice
 * preserved 29 — the `__omitted` key and the closing braces for each emptied
 * tag cost the bytes the slice spent on names. Validity improved; blindness
 * did not. B-fmt-7 would still have failed. Nor can deck_get be reshaped
 * under the cap: byTag 5412 chars, a flat list 4421, and bare names 1348 —
 * so only a shape that discards tags and counts fits, which the deck panel
 * needs. A 75-card deck and a 2048-char cap are simply incompatible.
 *
 * So the cap moves to where it belongs: results are STORED AND STREAMED
 * WHOLE, and the cap is applied when rendering the hover popover, where
 * dropping the tail genuinely costs nothing (a human does not read 76 names
 * in a tooltip). Machine consumers get complete, parseable data.
 */

/**
 * Longest tool result rendered into the hover popover. A display bound — see
 * the header for why this must not be applied when storing.
 */
export const TOOL_RESULT_MAX_CHARS = 2048;

/**
 * Cap a tool result for DISPLAY. Cuts on a character offset deliberately: the
 * output is read by a human, never parsed, so a mid-record cut is harmless
 * and showing the first 2048 chars is strictly more useful than showing a
 * record-aligned prefix.
 */
export function truncateForDisplay(s: string, max = TOOL_RESULT_MAX_CHARS): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

/**
 * True when a result was cut by an OLD build (or by the display path) and so
 * may be missing card names. Results captured after #70 are whole, but chats/
 * on disk still holds results truncated by the previous behaviour, and
 * grounding-core must keep reporting those as unverifiable rather than
 * scoring a sliced result as complete.
 */
export function isTruncatedResult(s: string): boolean {
  return s.endsWith("…");
}
