import { useState } from "react";
import { DeckPanel } from "./DeckPanel";
import { ChatPanel } from "./ChatPanel";

export function App() {
  const [selected, setSelected] = useState<string>("");
  return (
    <div className="app">
      <DeckPanel selected={selected} setSelected={setSelected} />
      <ChatPanel selected={selected} />
    </div>
  );
}
