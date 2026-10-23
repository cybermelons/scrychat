/**
 * Pure geometry for the deck "Flip" view (stacking cards + scroll snap).
 * Card i sticks at min(i, cap) * hdr from the container top, so its snap
 * point is i * cardH - min(i, cap) * hdr. No DOM here; DeckPanel measures.
 */

/** Sticky/stack offset of card i: older cards past `cap` collapse under. */
export function stackOffset(i: number, hdr: number, cap: number): number {
  return Math.min(Math.max(i, 0), cap) * hdr;
}

/** scrollTop at which card i is the front card. */
export function snapTop(i: number, cardH: number, hdr: number, cap: number): number {
  return i * cardH - stackOffset(i, hdr, cap);
}

/** Index of the front card for a scrollTop (nearest snap point), clamped to [0, n-1]. */
export function frontIndex(scrollTop: number, cardH: number, hdr: number, cap: number, n: number): number {
  if (n <= 0) return 0;
  const step = cardH - hdr; // spacing between snaps while the cascade is growing
  const raw = scrollTop <= snapTop(cap, cardH, hdr, cap)
    ? scrollTop / step
    : cap + (scrollTop - snapTop(cap, cardH, hdr, cap)) / cardH;
  return Math.min(n - 1, Math.max(0, Math.round(raw)));
}

/** Flat index of each group's first card, from the group sizes (empty groups skipped upstream). */
export function groupStarts(sizes: number[]): number[] {
  const out: number[] = [];
  let at = 0;
  for (const n of sizes) {
    out.push(at);
    at += n;
  }
  return out;
}

/** Index of the group containing flat card index `front`. */
export function groupOf(front: number, starts: number[]): number {
  let g = 0;
  for (let k = 0; k < starts.length; k++) if (starts[k] <= front) g = k;
  return g;
}

/**
 * Flat index to land on for a next (+1) / previous (-1) group jump. "Previous"
 * from mid-group goes to that group's own start first, like a media player.
 */
export function jumpGroupStart(front: number, starts: number[], dir: 1 | -1): number {
  if (starts.length === 0) return 0;
  const g = groupOf(front, starts);
  if (dir === 1) return starts[Math.min(g + 1, starts.length - 1)];
  return front > starts[g] ? starts[g] : starts[Math.max(g - 1, 0)];
}
