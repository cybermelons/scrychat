import { mulberry32, shuffle } from "./goldfish.js";
import type { ResolvedCard } from "./decks.js";

export type PlaytestCard = { id: string; name: string; typeLine: string; cmc: number; image?: string | null; tapped?: boolean; token?: boolean };
export type Zone = "library" | "hand" | "battlefield" | "graveyard" | "exile" | "command";
type Zones = Record<Zone, PlaytestCard[]>;
type Snap = Zones & { seed: number; turn: number };
export type PlaytestState = Snap & { past: Snap[]; future: Snap[] };
export type PlaytestAction =
  | { type: "draw" }
  | { type: "move"; id: string; to: Zone }
  | { type: "tap"; id: string }
  | { type: "token"; name: string }
  | { type: "nextTurn" }
  | { type: "shuffle" }
  | { type: "mulligan" }
  | { type: "undo" }
  | { type: "redo" };

const ZONES: Zone[] = ["library", "hand", "battlefield", "graveyard", "exile", "command"];
const toCard = (c: ResolvedCard, id: string): PlaytestCard => ({ id, name: c.name, typeLine: c.typeLine, cmc: c.cmc, image: c.image ?? null });

export function newGame(cards: ResolvedCard[], commanders: ResolvedCard[], seed: number): PlaytestState {
  const library = cards.map((c, i) => toCard(c, `c${i}`));
  shuffle(library, mulberry32(seed));
  const command = commanders.map((c, i) => toCard(c, `k${i}`));
  const s: PlaytestState = { seed, turn: 1, library, hand: [], battlefield: [], graveyard: [], exile: [], command, past: [], future: [] };
  s.hand = s.library.splice(0, 7);
  return s;
}

const snap = (s: Snap): Snap => ({ seed: s.seed, turn: s.turn, ...(Object.fromEntries(ZONES.map((z) => [z, s[z].map((c) => ({ ...c }))])) as Zones) });

// Pure: clones zones, mutates only the clone, pushes the prior state to past.
export function playtest(state: PlaytestState, a: PlaytestAction): PlaytestState {
  if (a.type === "undo" || a.type === "redo") {
    const [from, to] = a.type === "undo" ? [state.past, state.future] : [state.future, state.past];
    if (!from.length) return state;
    const target = from[from.length - 1]!;
    return { ...snap(target), past: a.type === "undo" ? from.slice(0, -1) : [...to, snap(state)], future: a.type === "undo" ? [...to, snap(state)] : from.slice(0, -1) };
  }
  const s: PlaytestState = { ...snap(state), past: [...state.past, snap(state)], future: [] };
  const draw = () => { const c = s.library.shift(); if (c) s.hand.push(c); };
  const find = (id: string) => {
    for (const z of ZONES) { const i = s[z].findIndex((c) => c.id === id); if (i >= 0) return { z, i }; }
  };
  switch (a.type) {
    case "draw": draw(); break;
    case "move": {
      const f = find(a.id);
      if (!f) break;
      const [c] = s[f.z].splice(f.i, 1);
      s[a.to].push({ ...c!, tapped: false });
      break;
    }
    case "tap": {
      const f = find(a.id);
      if (f) s[f.z][f.i]!.tapped = !s[f.z][f.i]!.tapped;
      break;
    }
    case "token": {
      const n = ZONES.reduce((k, z) => k + s[z].filter((c) => c.token).length, 0);
      s.battlefield.push({ id: `t${n}`, name: a.name, typeLine: "Token", cmc: 0, token: true, tapped: false });
      break;
    }
    case "nextTurn":
      s.battlefield.forEach((c) => (c.tapped = false));
      s.turn++;
      draw();
      break;
    case "shuffle":
      shuffle(s.library, mulberry32(state.seed + state.turn + state.past.length));
      break;
    case "mulligan":
      s.library.push(...s.hand.splice(0));
      shuffle(s.library, mulberry32(state.seed + state.turn + state.past.length));
      for (let i = 0; i < 7; i++) draw();
      break;
  }
  return s;
}

export const sampleHand = (cards: ResolvedCard[], seed: number): PlaytestCard[] => newGame(cards, [], seed).hand;
export const drawCard = (s: PlaytestState): PlaytestState => playtest(s, { type: "draw" });
