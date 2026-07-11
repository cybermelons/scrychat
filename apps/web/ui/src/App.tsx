import { useEffect, useState } from "react";
import { DeckPanel } from "./DeckPanel";
import { ChatPanel } from "./ChatPanel";
import type { AppConfig } from "./types";

export function App() {
  const [selected, setSelected] = useState<string>("");
  // Lowercased card-name set of the currently-loaded deck (commander + cards),
  // reported by DeckPanel on every load/refresh (including deck-events-driven
  // reloads) so ChatPanel can render in-deck badges and know what to toggle.
  const [deckCardNames, setDeckCardNames] = useState<Set<string>>(new Set());
  // Deck panel as slide-over drawer below ~900px (see styles.css media query).
  const [drawerOpen, setDrawerOpen] = useState(false);

  // App-wide server config (linkify pass, default export format, quota
  // targets): fetched once here and passed down so DeckPanel and ChatPanel's
  // settings drawer share one source of truth instead of each fetching it.
  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AppConfig | null) => setConfig(data))
      .catch(() => void 0);
  }, []);

  return (
    <div className="app">
      <DeckPanel
        selected={selected}
        setSelected={setSelected}
        onDeckNames={setDeckCardNames}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        defaultExportFormat={config?.defaultExportFormat}
      />
      <ChatPanel
        selected={selected}
        deckCardNames={deckCardNames}
        onOpenDeckDrawer={() => setDrawerOpen(true)}
        config={config}
        onConfigChange={setConfig}
      />
    </div>
  );
}
