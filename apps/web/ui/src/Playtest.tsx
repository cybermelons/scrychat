import { useEffect, useReducer, useState } from "react";
// Pure reducer shared with core; reaches only playtest.ts -> goldfish.ts (type-only decks import), no sqlite.
import { newGame, playtest } from "../../../../packages/core/src/playtest.ts";
import type { PlaytestAction, PlaytestCard, Zone } from "../../../../packages/core/src/playtest.ts";
import type { Deck } from "./types";

export function toResolved(deck: Deck, commander: boolean) {
  const mk = (name: string, image?: string | null, typeLine?: string | null) =>
    ({ name, image, typeLine: typeLine ?? "", cmc: 0, colorIdentity: [], legalCommander: true }) as never;
  if (commander) return [mk(deck.commander, deck.commanderImage, "Legendary Creature")];
  return deck.cards.flatMap((c) => Array.from({ length: c.count ?? 1 }, () => mk(c.name, c.image, c.typeLine)));
}

const MOVES: [string, Zone][] = [["Hand", "hand"], ["Battlefield", "battlefield"], ["Graveyard", "graveyard"], ["Exile", "exile"], ["Library", "library"]];

function Card({ c, onClick, onMenu }: { c: PlaytestCard; onClick: () => void; onMenu: (e: React.MouseEvent) => void }) {
  return (
    <div className={`ptcard${c.tapped ? " tapped" : ""}`} title={c.name} onClick={onClick} onContextMenu={(e) => { e.preventDefault(); onMenu(e); }}>
      {c.image ? <img src={c.image} alt={c.name} draggable={false} /> : <span>{c.name}</span>}
      <button type="button" className="ptmore" aria-label="Move" onClick={(e) => { e.stopPropagation(); onMenu(e); }}>⋯</button>
    </div>
  );
}

export function Playtest({ deck, onClose }: { deck: Deck; onClose: () => void }) {
  const [seed] = useState(() => Date.now());
  const [s, dispatch] = useReducer(playtest, undefined as never, () => newGame(toResolved(deck, false), toResolved(deck, true), seed));
  const [menu, setMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [showLib, setShowLib] = useState(false);
  const act = (a: PlaytestAction) => dispatch(a);
  const token = () => { const n = window.prompt("Token name", "Token"); if (n !== null) act({ type: "token", name: n.trim() || "Token" }); };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input,textarea")) return;
      const k = e.key.toLowerCase();
      if (e.key === "Escape") onClose();
      else if (k === "a") { e.preventDefault(); token(); }
      else if (k === "n") act({ type: "nextTurn" });
      else if (k === "d") act({ type: "draw" });
      else if (k === "v") setShowLib((v) => !v);
      else if (k === "s") act({ type: "shuffle" });
      else if (k === "z") act({ type: e.shiftKey ? "redo" : "undo" });
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const menuFor = (c: PlaytestCard) => (e: React.MouseEvent) => setMenu({ id: c.id, x: e.clientX, y: e.clientY });
  const pile = (label: string, z: Zone, onClick?: () => void) => {
    const top = s[z][s[z].length - 1];
    return (
      <div className="pile" id={`pt-${z}`}>
        {label} <span className="ptcount">{s[z].length}</span>
        <div className="slot" onClick={onClick} style={onClick ? { cursor: "pointer" } : undefined}>
          {z === "library" ? (s.library.length ? <div className="ptback">Draw</div> : null) : top && (top.image ? <img src={top.image} alt={top.name} /> : <span>{top.name}</span>)}
        </div>
      </div>
    );
  };

  return (
    <div className="playtest" id="playtest" onClick={() => setMenu(null)}>
      <div id="pt-topbar">
        <button type="button" className="btn" id="pt-back" onClick={onClose}>← Back</button>
        <span className="sp" />
        <span className="pill" id="pt-turn">Turn {s.turn}</span>
        <span className="pill" id="pt-seed">seed {s.seed}</span>
        <button type="button" className="btn" onClick={() => act({ type: "undo" })} disabled={!s.past.length}>Undo</button>
        <button type="button" className="btn" onClick={token}>Create token <kbd>A</kbd></button>
        <button type="button" className="btn primary" onClick={() => act({ type: "nextTurn" })}>Next turn <kbd>N</kbd></button>
        <details className="ptmoredd" onClick={(e) => e.stopPropagation()}>
          <summary className="btn">More ▾</summary>
          <div className="ptmenu ptmorem">
            <button type="button" onClick={() => act({ type: "redo" })} disabled={!s.future.length}>Redo</button>
            <button type="button" onClick={() => act({ type: "shuffle" })}>Shuffle (S)</button>
            <button type="button" onClick={() => act({ type: "mulligan" })}>Mulligan</button>
          </div>
        </details>
      </div>
      <div id="pt-battlefield">
        {s.battlefield.map((c) => <Card key={c.id} c={c} onClick={() => act({ type: "tap", id: c.id })} onMenu={menuFor(c)} />)}
        {!s.battlefield.length && <span>Battlefield empty — click a hand card to play it</span>}
      </div>
      <div id="pt-bottom">
        <div id="pt-hand">
          <div>HAND (<span id="pt-handcount">{s.hand.length}</span>)</div>
          <div className="ptrow">
            {s.hand.map((c) => <Card key={c.id} c={c} onClick={() => act({ type: "move", id: c.id, to: "battlefield" })} onMenu={menuFor(c)} />)}
          </div>
        </div>
        <div id="pt-piles">
          {pile("Library", "library", () => act({ type: "draw" }))}
          {pile("Graveyard", "graveyard")}
          {pile("Exile", "exile")}
          <div className="pile" id="pt-command">
            Command <span className="ptcount">{s.command.length}</span>
            <div className="ptstack">
              {s.command.map((c) => <Card key={c.id} c={c} onClick={() => act({ type: "move", id: c.id, to: "battlefield" })} onMenu={menuFor(c)} />)}
            </div>
          </div>
        </div>
      </div>
      {menu && (
        <div className="ptmenu" style={{ left: menu.x, top: menu.y }}>
          {MOVES.map(([l, z]) => <button type="button" key={z} onClick={() => act({ type: "move", id: menu.id, to: z })}>To {l.toLowerCase()}</button>)}
        </div>
      )}
      {showLib && (
        <div className="ptlib" onClick={(e) => e.stopPropagation()}>
          <b>Library ({s.library.length}) <button type="button" className="mini" onClick={() => setShowLib(false)}>Close</button></b>
          <ol>{s.library.map((c) => <li key={c.id}>{c.name}</li>)}</ol>
        </div>
      )}
    </div>
  );
}
