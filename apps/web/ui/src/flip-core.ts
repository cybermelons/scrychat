/**
 * Pure logic for the deck riffle (Flip) view. No DOM, no React.
 *
 * Geometry: the front card sits at the bottom of a stage; the headers of the
 * NEXT cards cascade above it. Scrolling UP (a swipe down) pulls the next card
 * down over the front. Card i has a fractional distance d = i - progress from
 * the front; cardPose(d) places it. The scroller is a sizer whose scrollTop
 * goes DOWN as progress goes up, one STEP per card.
 */

export const RIFFLE_STEP = 220;

/** scrollTop at which card i is the front, for n cards. */
export function riffleTop(i: number, n: number, step = RIFFLE_STEP): number {
  return Math.max(n - 1 - i, 0) * step;
}

/** Fractional card progress for a scrollTop (0 = first card is front). */
export function riffleProgress(scrollTop: number, n: number, step = RIFFLE_STEP): number {
  return ((Math.max(n, 1) - 1) * step - scrollTop) / step;
}

/** Index of the front card (nearest snap point), clamped to [0, n-1]. */
export function riffleFront(scrollTop: number, n: number, step = RIFFLE_STEP): number {
  if (n <= 0) return 0;
  return Math.min(n - 1, Math.max(0, Math.round(riffleProgress(scrollTop, n, step))));
}

/**
 * Placement of a card at fractional distance d from the front.
 * d <= 0: front or passed, parked at the front slot (cap * hdr), stacked under.
 * d > 0: upcoming, header cascaded above the front; at most cap headers show,
 * the rest collapse at y = 0 under the nearer ones.
 * z: the front beats the next card, which beats the one after; a card being
 * pulled (0 < d < 1) beats the card it is leaving (d < 0).
 */
export function cardPose(d: number, hdr: number, cap: number): { y: number; z: number; show: boolean } {
  const y = d <= 0 ? cap * hdr : Math.max(0, (cap - d) * hdr);
  const z = Math.round(1000 - Math.abs(d) * 10 - (d < 0 ? 1 : 0));
  return { y, z, show: d > -2 && d < cap + 2 };
}

/** Group-key choices for a cut. "none" = one stack. */
export type CutKey = "none" | "type" | "tag" | "cmc";
export const CUT_KEYS: CutKey[] = ["none", "type", "tag", "cmc"];

export type Sub = { key: string; start: number; count: number };
export type CutGroup = Sub & { subs: Sub[] };

type CutOpts<T> = {
  k1?: (t: T) => string;
  r1?: (key: string) => number;
  k2?: (t: T) => string;
  r2?: (key: string) => number;
  cmp: (a: T, b: T) => number;
};

function bucket<T>(items: T[], k: (t: T) => string, r?: (key: string) => number): [string, T[]][] {
  const m = new Map<string, T[]>();
  for (const t of items) {
    const key = k(t);
    if (!m.has(key)) m.set(key, []);
    m.get(key)!.push(t);
  }
  return [...m.entries()].sort((a, b) => (r ? r(a[0]) - r(b[0]) : 0) || a[0].localeCompare(b[0]));
}

/**
 * Cut a stack: group by k1 (ordered by rank r1, then key), optionally by k2
 * inside each group, `cmp` sorts within the innermost group. Returns the flat
 * card order plus each group's flat start/count and its sub-groups.
 * Without k1 the stack is one unnamed group.
 */
export function cutStack<T>(items: T[], o: CutOpts<T>): { order: T[]; groups: CutGroup[] } {
  const order: T[] = [];
  const groups: CutGroup[] = [];
  const top: [string, T[]][] = o.k1 ? bucket(items, o.k1, o.r1) : [["", items]];
  for (const [key, rows] of top) {
    const start = order.length;
    const subs: Sub[] = [];
    const inner: [string, T[]][] = o.k1 && o.k2 ? bucket(rows, o.k2, o.r2) : [["", rows]];
    for (const [sk, srows] of inner) {
      subs.push({ key: sk, start: order.length, count: srows.length });
      order.push(...[...srows].sort(o.cmp));
    }
    groups.push({ key, start, count: order.length - start, subs });
  }
  return { order, groups };
}

/** Flat index of each group's first card, from the group sizes. */
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
