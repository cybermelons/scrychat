import type { CardResolver, Deck, ResolvedCard } from "./decks.js";

// Deterministic goldfish: what does this deck do unopposed? Pure and seeded —
// same cards + same options => byte-identical result, so two decks compare.
// Never use Math.random() here; that would silently break comparability.

export type GoldfishOptions = {
  iterations?: number; // default 1000
  seed?: number; // default 0
  maxTurns?: number; // default 15
  handSize?: number; // default 7
};

export type GoldfishResult = {
  iterations: number;
  seed: number;
  maxTurns: number;
  /** fraction of games that mulliganed */
  mulliganRate: number;
  /** CMC bucket ("0".."7+") -> median turn a card of that bucket was first cast (games where one was cast) */
  turnToCast: Record<string, number>;
  /** index = turn (1-based, [0] unused), mean mana available that turn */
  manaAvailable: number[];
  /** games ending at maxTurns with nonland cards still in hand */
  stalledGames: number;
  /** index = turn (1-based, [0] unused), mean nonland cards cast cumulatively */
  castByTurn: number[];
  /** mean turn a game first had ONLINE_THRESHOLD nonland spells cast; games that never got there count as maxTurns + 1 */
  turnsToOnline: number;
  /** cumulative nonland casts that counts as "online" (the bar turnsToOnline measures) */
  onlineThreshold: number;
};

// mulberry32: small seeded PRNG, returns [0,1).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(a: T[], rnd: () => number): void {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
}

const isLand = (c: ResolvedCard) => /\bLand\b/.test(c.typeLine);
const isCreature = (c: ResolvedCard) => /\bCreature\b/.test(c.typeLine);
const bucket = (cmc: number) => (cmc >= 7 ? "7+" : String(Math.max(0, Math.floor(cmc))));
const round = (n: number) => Math.round(n * 1e4) / 1e4;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
// Coloured pips in manaCost, e.g. "{W}{W}" -> {W: 2}. Everything else (numbers, hybrid, Phyrexian, {X}, {C}) rides on cmc as generic.
// No manaCost => no pips => the card is all generic (castable on cmc alone).
const pips = (c: ResolvedCard): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const m of (c.manaCost ?? "").matchAll(/\{([WUBRG])\}/g)) out[m[1]!] = (out[m[1]!] ?? 0) + 1;
  return out;
};

/** Cumulative nonland spells that counts as a deck being "online".
 *
 *  Absolute, not deck-relative, so two different decks are comparable: a
 *  deck-relative bar (e.g. "half the curve") moves with the deck and would
 *  make a faster deck score worse. 3 is low enough that nearly every
 *  Commander deck reaches it within maxTurns, and high enough that it
 *  measures the curve rather than a single opener. */
export const ONLINE_THRESHOLD = 3;

export function goldfish(cards: ResolvedCard[], opts: GoldfishOptions = {}): GoldfishResult {
  const iterations = opts.iterations ?? 1000;
  const seed = opts.seed ?? 0;
  const maxTurns = opts.maxTurns ?? 15;
  const handSize = opts.handSize ?? 7;
  const rnd = mulberry32(seed);

  const manaSum = new Array<number>(maxTurns + 1).fill(0);
  const castSum = new Array<number>(maxTurns + 1).fill(0);
  const firstCast: Record<string, number[]> = {};
  let mulligans = 0;
  let stalled = 0;
  let onlineSum = 0;

  for (let g = 0; g < iterations; g++) {
    let library = [...cards];
    shuffle(library, rnd);
    let hand = library.splice(0, handSize);
    // ponytail: mulligan once if <2 or >5 lands, no bottoming (not London). Upgrade to London + keep heuristics if opening-hand stats matter.
    const landsIn = hand.filter(isLand).length;
    if (landsIn < 2 || landsIn > 5) {
      mulligans++;
      library = [...cards];
      shuffle(library, rnd);
      hand = library.splice(0, handSize);
    }

    let total = 0; // one per land in play + one per cast nonland with producedMana
    const src: Record<string, number> = {}; // coloured sources, by producedMana colour
    const addSrc = (c: ResolvedCard) => { for (const m of c.producedMana ?? []) src[m] = (src[m] ?? 0) + 1; };
    let cast = 0;
    let onlineTurn = 0;
    const seen = new Set<string>();

    for (let turn = 1; turn <= maxTurns; turn++) {
      const drawn = library.shift();
      if (drawn) hand.push(drawn);

      // Colour-aware land drop: prefer a land making a colour the hand DEMANDS MORE OF than
      // play supplies. Demand is the max pip count over the hand, not a boolean — a {W}{W} card
      // still wants a second white source when one Plains is already down.
      const want: Record<string, number> = {};
      for (const c of hand) if (!isLand(c)) for (const [k, n] of Object.entries(pips(c))) want[k] = Math.max(want[k] ?? 0, n);
      let li = hand.findIndex((c) => isLand(c) && !!c.producedMana?.some((m) => (want[m] ?? 0) > (src[m] ?? 0)));
      if (li < 0) li = hand.findIndex(isLand);
      if (li >= 0) {
        const [l] = hand.splice(li, 1);
        total++;
        addSrc(l!);
      }

      // ponytail: per-colour check is independent, not a bipartite matching — a dual land counts toward every colour it lists at once. OPTIMISTIC. Upgrade: match sources to pips.
      // ponytail: coloured sources are not consumed between casts within one turn (only the generic total is). OPTIMISTIC. Upgrade: decrement src per pip paid.
      // ponytail: hybrid / Phyrexian / {X} / {C} pips are treated as generic. OPTIMISTIC. Upgrade: parse them into pips.
      // ponytail: land drop has no look-ahead and does not resolve fetches (a land without producedMana = 1 generic). OPTIMISTIC. Upgrade: simulate the land drop against the next turns' casts.
      // ponytail: any nonland card with producedMana = +1 mana from the turn it is cast (no summoning sickness, always 1), plus its colours as sources. Upgrade: sum producedMana per source.
      let avail = total;
      manaSum[turn]! += avail;

      // ponytail: greedy sequencing, no lookahead (highest castable CMC first, creatures win ties, then name for determinism). Upgrade to 1-turn lookahead if numbers disagree with real play.
      for (;;) {
        let best = -1;
        for (let i = 0; i < hand.length; i++) {
          const c = hand[i]!;
          if (isLand(c) || c.cmc > avail || Object.entries(pips(c)).some(([k, n]) => n > (src[k] ?? 0))) continue;
          if (best < 0) { best = i; continue; }
          const b = hand[best]!;
          if (
            c.cmc > b.cmc ||
            (c.cmc === b.cmc && Number(isCreature(c)) > Number(isCreature(b))) ||
            (c.cmc === b.cmc && isCreature(c) === isCreature(b) && c.name < b.name)
          ) best = i;
        }
        if (best < 0) break;
        const [c] = hand.splice(best, 1);
        avail -= c!.cmc;
        cast++;
        if (c!.producedMana?.length) { total++; avail++; addSrc(c!); }
        const k = bucket(c!.cmc);
        if (!seen.has(k)) { seen.add(k); (firstCast[k] ??= []).push(turn); }
      }
      castSum[turn]! += cast;
      if (onlineTurn === 0 && cast >= ONLINE_THRESHOLD) onlineTurn = turn;
    }
    if (hand.some((c) => !isLand(c))) stalled++;
    onlineSum += onlineTurn === 0 ? maxTurns + 1 : onlineTurn;
  }

  const n = Math.max(iterations, 1);
  const turnToCast: Record<string, number> = {};
  for (const k of Object.keys(firstCast).sort()) turnToCast[k] = median(firstCast[k]!);
  return {
    iterations,
    seed,
    maxTurns,
    mulliganRate: round(mulligans / n),
    turnToCast,
    manaAvailable: manaSum.map((x) => round(x / n)),
    stalledGames: stalled,
    castByTurn: castSum.map((x) => round(x / n)),
    turnsToOnline: onlineSum / n,
    onlineThreshold: ONLINE_THRESHOLD,
  };
}

// Deck -> the real library goldfish() shuffles: a 4-of appears 4 times. One resolver call per
// DISTINCT name. goldfish never mutates its cards, so copies share one ResolvedCard reference.
// ponytail: deckReport (decks.ts:683) keeps its own near-identical resolve loop. Upgrade: route it through this helper.
export async function resolveDeckLibrary(
  deck: Deck,
  resolver: CardResolver,
): Promise<{ library: ResolvedCard[]; unresolved: string[] }> {
  const resolvedByName = new Map<string, ResolvedCard | null>();
  await Promise.all(
    [...new Set(deck.cards.map((c) => c.name))].map(async (name) => {
      resolvedByName.set(name, await resolver(name));
    }),
  );
  const library: ResolvedCard[] = [];
  // Set keeps first-appearance (deck) order and reports each missing name once, not once per copy.
  const unresolved = new Set<string>();
  for (const entry of deck.cards) {
    const resolved = resolvedByName.get(entry.name);
    if (!resolved) { unresolved.add(entry.name); continue; }
    for (let i = 0; i < (entry.count ?? 1); i++) library.push(resolved);
  }
  return { library, unresolved: [...unresolved] };
}

// Presentation spec the web chart component renders. x / y are AXIS LABELS, not data keys.
export type ChartSpec = {
  type: "bar";
  data: { x: string; y: number }[];
  x: string;
  y: string;
  caption?: string;
};

/** Longest `data` array a ChartSpec consumer is required to render.
 *
 *  This mirrors MAX_CHART_ROWS in the web app's chart-core, which REJECTS a
 *  longer spec outright — a 33-row chart does not render small, it renders
 *  not at all, falling back to a plain tool chip. The two bounds live in
 *  different packages because core must not import from apps/web, so this
 *  constant is the only thing tying them: grep it before changing either.
 *
 *  Today the only production caller clamps maxTurns to 20 in the MCP tool
 *  schema (packages/mcp/src/tools.ts), so nothing hits this. A direct
 *  goldfish() caller asking for more turns would, and would lose its chart
 *  with no error anywhere. Hence clamping here rather than trusting callers. */
export const CHART_MAX_ROWS = 32;

export function goldfishChart(r: GoldfishResult): ChartSpec {
  // Clamp, not reject: the scalars in the caption are still valid at any
  // maxTurns, so a long sim keeps a readable chart of its first 32 turns
  // instead of silently losing the whole spec at the consumer.
  const rows = Math.min(r.maxTurns, CHART_MAX_ROWS);
  return {
    type: "bar",
    // castByTurn[0] is documented unused (always 0): start at turn 1 or the chart draws a meaningless empty bar.
    data: Array.from({ length: rows }, (_, i) => ({ x: String(i + 1), y: r.castByTurn[i + 1] ?? 0 })),
    x: "turn",
    y: "spells cast",
    caption: `mulligan ${Math.round(r.mulliganRate * 100)}% · ${r.stalledGames}/${r.iterations} games stalled · seed ${r.seed}`,
  };
}
