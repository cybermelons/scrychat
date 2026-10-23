import { useEffect, useState } from "react";
import { DeckPanel } from "./DeckPanel";
import { ChatPanel } from "./ChatPanel";
import { Browse, type BrowseTarget } from "./Browse";
import type { AppConfig } from "./types";

export function App() {
  const [selected, setSelected] = useState<string>("");
  // Lowercased card-name set of the currently-loaded deck (commander + cards),
  // reported by DeckPanel on every load/refresh (including deck-events-driven
  // reloads) so ChatPanel can render in-deck badges and know what to toggle.
  const [deckCardNames, setDeckCardNames] = useState<Set<string>>(new Set());
  // Mobile (<=819px) shows one pane at a time; wider layouts show all three.
  const [tab, setTab] = useState<"deck" | "chat">("chat");
  // Mobile "More": the sidebar as an overlay.
  const [moreOpen, setMoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [browse, setBrowse] = useState<BrowseTarget | null>(null);

  // App-wide server config (default export format, quota
  // targets): fetched once here and passed down so DeckPanel and ChatPanel's
  // settings drawer share one source of truth instead of each fetching it.
  const [config, setConfig] = useState<AppConfig | null>(null);
  useEffect(() => {
    fetch("/api/config")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: AppConfig | null) => setConfig(data))
      .catch(() => void 0);
  }, []);

  const goTab = (t: "deck" | "chat") => {
    setTab(t);
    setMoreOpen(false);
  };
  const goAnalysis = () => {
    goTab("deck");
    // #benchmarks is added by a later unit; wait a frame for the pane to show.
    requestAnimationFrame(() => document.getElementById("benchmarks")?.scrollIntoView());
  };
  // Cards pane lives inside ChatPanel: show it, then click its tab.
  const openCards = () => {
    goTab("chat");
    requestAnimationFrame(() => document.getElementById("tab-cards")?.click());
  };
  const mtab = (_id: string, active: boolean) => `mtab${active ? " active" : ""}`;

  return (
    <div
      className={`workspace${moreOpen ? " more-open" : ""}`}
      id="app-shell"
      data-tab={tab}
      // Any nav item click inside the overlay closes it.
      onClick={(e) => {
        if (moreOpen && (e.target as Element).closest(".sidebar .navitem")) setMoreOpen(false);
      }}
    >
      <DeckPanel
        selected={selected}
        setSelected={setSelected}
        onDeckNames={setDeckCardNames}
        defaultExportFormat={config?.defaultExportFormat}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenBrowse={setBrowse}
      />
      <div className="divider" id="divider" title="drag to resize" />
      <ChatPanel
        selected={selected}
        deckCardNames={deckCardNames}
        config={config}
        onConfigChange={setConfig}
        settingsOpen={settingsOpen}
        onOpenSettings={() => setSettingsOpen(true)}
        onCloseSettings={() => setSettingsOpen(false)}
        onSelectDeck={setSelected}
        onOpenBrowse={setBrowse}
      />
      {browse && (
        <Browse
          key={`${browse.tab}:${browse.precon ?? ""}`}
          target={browse}
          onClose={() => setBrowse(null)}
          onOpenDeck={(name) => {
            setBrowse(null);
            setSelected(name);
            window.dispatchEvent(new CustomEvent("sc:deck-created", { detail: name }));
          }}
        />
      )}
      <nav className="mobilebar">
        <button type="button" className={mtab("deck", tab === "deck" && !moreOpen)} id="mtab-deck" onClick={() => goTab("deck")}>
          <span className="ico">▣</span>Deck
        </button>
        <button type="button" className={mtab("chat", tab === "chat" && !moreOpen)} id="mtab-chat" onClick={() => goTab("chat")}>
          <span className="ico">✦</span>Chat
        </button>
        <button type="button" className="mtab" id="mtab-cards" onClick={openCards}>
          <span className="ico">⌕</span>Cards
        </button>
        <button type="button" className="mtab" id="mtab-analysis" onClick={goAnalysis}>
          <span className="ico">▤</span>Analysis
        </button>
        <button type="button" className={mtab("more", moreOpen)} id="mtab-more" onClick={() => setMoreOpen((v) => !v)}>
          <span className="ico">⋯</span>More
        </button>
      </nav>
    </div>
  );
}
