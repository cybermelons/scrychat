import type { ResolvedCard } from "./decks.js";

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

    let landsInPlay = 0;
    let rocks = 0; // nonland permanents with producedMana
    let cast = 0;
    const seen = new Set<string>();

    for (let turn = 1; turn <= maxTurns; turn++) {
      const drawn = library.shift();
      if (drawn) hand.push(drawn);

      const li = hand.findIndex(isLand);
      if (li >= 0) {
        hand.splice(li, 1);
        landsInPlay++;
      }

      // ponytail: no color requirements — every land is 1 generic mana, so numbers are OPTIMISTIC. Upgrade: track colored sources vs. manaCost pips.
      // ponytail: any nonland card with producedMana = +1 mana from the turn it is cast (no summoning sickness, always 1). Upgrade: sum producedMana per source.
      let avail = landsInPlay + rocks;
      manaSum[turn]! += avail;

      // ponytail: greedy sequencing, no lookahead (highest castable CMC first, creatures win ties, then name for determinism). Upgrade to 1-turn lookahead if numbers disagree with real play.
      for (;;) {
        let best = -1;
        for (let i = 0; i < hand.length; i++) {
          const c = hand[i]!;
          if (isLand(c) || c.cmc > avail) continue;
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
        if (c!.producedMana?.length) { rocks++; avail++; }
        const k = bucket(c!.cmc);
        if (!seen.has(k)) { seen.add(k); (firstCast[k] ??= []).push(turn); }
      }
      castSum[turn]! += cast;
    }
    if (hand.some((c) => !isLand(c))) stalled++;
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
  };
}
