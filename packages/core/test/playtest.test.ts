import { describe, it, expect } from "vitest";
import { newGame, playtest, sampleHand, drawCard } from "../src/playtest.js";
import type { ResolvedCard } from "../src/decks.js";

const card = (i: number): ResolvedCard => ({ name: `Card ${i}`, colorIdentity: [], cmc: i % 5, typeLine: "Creature", legalCommander: false });
const deck = Array.from({ length: 20 }, (_, i) => card(i));
const names = (cs: { name: string }[]) => cs.map((c) => c.name);

describe("playtest", () => {
  it("same seed gives identical hand", () => {
    expect(names(sampleHand(deck, 1))).toEqual(names(sampleHand(deck, 1)));
    expect(sampleHand(deck, 1).map((c) => c.id)).toEqual(sampleHand(deck, 1).map((c) => c.id));
  });
  it("different seed gives different order", () => {
    expect(names(sampleHand(deck, 1))).not.toEqual(names(sampleHand(deck, 2)));
  });
  it("new game: 7 in hand, 13 in library, commander in command", () => {
    const s = newGame(deck, [card(99)], 1);
    expect([s.hand.length, s.library.length, s.command.length, s.turn]).toEqual([7, 13, 1, 1]);
  });
  it("move to battlefield then undo/redo", () => {
    const s0 = newGame(deck, [], 1);
    const id = s0.hand[0]!.id;
    const s1 = playtest(s0, { type: "move", id, to: "battlefield" });
    expect([s1.hand.length, s1.battlefield.length]).toEqual([6, 1]);
    expect(s0.hand.length).toBe(7);
    const s2 = playtest(s1, { type: "undo" });
    expect([s2.hand.length, s2.battlefield.length]).toEqual([7, 0]);
    const s3 = playtest(s2, { type: "redo" });
    expect([s3.hand.length, s3.battlefield.length]).toEqual([6, 1]);
  });
  it("nextTurn untaps, turn 2, hand 8", () => {
    let s = newGame(deck, [], 1);
    s = playtest(s, { type: "move", id: s.hand[0]!.id, to: "battlefield" });
    s = playtest(s, { type: "tap", id: s.battlefield[0]!.id });
    expect(s.battlefield[0]!.tapped).toBe(true);
    s = playtest(s, { type: "nextTurn" });
    expect([s.turn, s.hand.length, s.battlefield[0]!.tapped]).toEqual([2, 7, false]);
  });
  it("nextTurn from fresh game gives hand 8", () => {
    const s = playtest(newGame(deck, [], 1), { type: "nextTurn" });
    expect([s.turn, s.hand.length]).toEqual([2, 8]);
  });
  it("token lands on battlefield", () => {
    const s = playtest(newGame(deck, [], 1), { type: "token", name: "Goblin" });
    expect(s.battlefield[0]).toMatchObject({ name: "Goblin", token: true });
  });
  it("draw from empty library is a no-op", () => {
    let s = newGame(deck.slice(0, 3), [], 1);
    expect(s.library.length).toBe(0);
    s = drawCard(s);
    expect(s.hand.length).toBe(3);
  });
  it("mulligan redraws 7, shuffle keeps library size", () => {
    const s = playtest(newGame(deck, [], 1), { type: "mulligan" });
    expect([s.hand.length, s.library.length]).toEqual([7, 13]);
    expect(playtest(s, { type: "shuffle" }).library.length).toBe(13);
  });
});
