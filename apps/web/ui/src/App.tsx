import { useState } from "react";
import { DeckPanel } from "./DeckPanel";
import { ChatPanel } from "./ChatPanel";

export function App() {
  const [selected, setSelected] = useState<string>("");
  // Lowercased card-name set of the currently-loaded deck (commander + cards),
  // reported by DeckPanel on every load/refresh (including deck-events-driven
  // reloads) so ChatPanel can render in-deck badges and know what to toggle.
  const [deckCardNames, setDeckCardNames] = useState<Set<string>>(new Set());
  return (
    <div className="app">
      <DeckPanel selected={selected} setSelected={setSelected} onDeckNames={setDeckCardNames} />
      <ChatPanel selected={selected} deckCardNames={deckCardNames} />
    </div>
  );
}
