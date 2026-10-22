import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type {
  CommanderChangeResult,
  Deck,
  DeckImportResult,
  DeckReport,
  DeckSummary,
  ExportFormat,
  IllegalCard,
  QuotaCheck,
  RejectedCard,
} from "./types";
import { LEGACY_ROLE_TAGS } from "./types";
import { CardName } from "./CardName";
import { renderManaSymbols } from "./markdown";
import { CollectionSync } from "./CollectionSync";
import { Suggestions } from "./Suggestions";
import { stub } from "./stub";
import "./deck.css";

const CURVE_ORDER = ["0", "1", "2", "3", "4", "5", "6", "7+"];
const LAST_DECK_KEY = "scrychat.lastDeck";

// Type groups (#tb-group = Type). Land wins over every other type; anything
// unmatched falls into "Other".
const TYPE_ORDER = ["Creature", "Planeswalker", "Battle", "Instant", "Sorcery", "Artifact", "Enchantment", "Land"];
const primaryType = (t?: string | null): string => {
  const s = t ?? "";
  if (s.includes("Land")) return "Land";
  return TYPE_ORDER.find((x) => s.includes(x)) ?? "Other";
};
const typeLabel = (t: string) => (t === "Other" ? t : `${t}s`);
const PIP_VAR: Record<string, string> = { W: "w", U: "u", B: "b", R: "r", G: "g" };

// Mana value from a mana-cost string (front face only). {2/W} counts 2, other
// hybrid/phyrexian symbols 1, X 0. Used only for Sort: Cost.
function cmcOf(cost?: string | null): number {
  if (!cost) return 0;
  let n = 0;
  for (const m of cost.split(" // ")[0].matchAll(/\{([^}]+)\}/g)) {
    const sym = m[1];
    const lead = parseInt(sym, 10);
    n += /^[XYZ]$/.test(sym) ? 0 : Number.isNaN(lead) ? 1 : lead;
  }
  return n;
}

// Mean mana value of non-land cards, from report.curve (core already excludes
// lands and floors cmc; the "7+" bucket counts as 7).
function avgManaValue(curve: Record<string, number>): number | null {
  let cards = 0;
  let sum = 0;
  for (const k of CURVE_ORDER) {
    const v = curve[k] ?? 0;
    cards += v;
    sum += v * parseInt(k, 10);
  }
  return cards > 0 ? sum / cards : null;
}

// "34-38" -> meter fill against the upper bound.
function quotaFill(q: QuotaCheck): number {
  const max = parseInt(q.want.split("-").pop() ?? "", 10);
  return max > 0 ? Math.min(100, Math.round((q.have / max) * 100)) : 0;
}

/**
 * Attempts to copy text to the clipboard, layering fallbacks for
 * insecure contexts (plain HTTP on a LAN host) where
 * navigator.clipboard is unavailable.
 *
 * 1. navigator.clipboard.writeText (secure contexts only)
 * 2. document.execCommand("copy") via a hidden textarea
 *
 * Returns false if both approaches fail, so callers can offer a
 * manual-copy fallback instead of a dead-end error.
 */
async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through to legacy fallback
    }
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "0";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

function QuotaRow({ label, q }: { label: string; q: QuotaCheck }) {
  return (
    <li className={q.ok ? "quota ok" : "quota bad"}>
      <span className="quota-mark">{q.ok ? "✓" : "✗"}</span>
      <span className="quota-label">{label}</span>
      <span className="quota-count">
        {q.have} / {q.want}
      </span>
    </li>
  );
}

function ManaCurve({ curve }: { curve: Record<string, number> }) {
  const max = Math.max(1, ...CURVE_ORDER.map((k) => curve[k] ?? 0));
  return (
    <div className="curve">
      {CURVE_ORDER.map((k) => {
        const v = curve[k] ?? 0;
        return (
          <div className="curve-col" key={k}>
            <div className="curve-val">{v}</div>
            <div className="curve-bar-track">
              <div
                className="curve-bar"
                style={{ height: `${Math.round((v / max) * 100)}%` }}
              />
            </div>
            <div className="curve-key">{k}</div>
          </div>
        );
      })}
    </div>
  );
}

function DeckSkeleton() {
  return (
    <div className="deck-body skeleton-wrap" aria-hidden="true">
      <div className="commander skeleton-block skeleton-shimmer" style={{ height: 88 }} />
      <div className="deck-section">
        <div className="skeleton-line skeleton-shimmer" style={{ width: "40%" }} />
        <ul className="quota-list">
          {[0, 1, 2, 3, 4].map((i) => (
            <li className="quota skeleton-row" key={i}>
              <div className="skeleton-block skeleton-shimmer" style={{ height: 14, width: "100%" }} />
            </li>
          ))}
        </ul>
      </div>
      <div className="deck-section">
        <div className="skeleton-line skeleton-shimmer" style={{ width: "30%" }} />
        <div className="skeleton-block skeleton-shimmer" style={{ height: 110 }} />
      </div>
      <div className="deck-section">
        <div className="skeleton-line skeleton-shimmer" style={{ width: "20%" }} />
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div className="skeleton-row" key={i}>
            <div className="skeleton-thumb skeleton-shimmer" />
            <div className="skeleton-block skeleton-shimmer" style={{ height: 12, flex: 1 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DeckPanel({
  selected,
  setSelected,
  onDeckNames,
  defaultExportFormat,
  onOpenSettings,
}: {
  selected: string;
  setSelected: (name: string) => void;
  onDeckNames?: (names: Set<string>) => void;
  defaultExportFormat?: ExportFormat;
  onOpenSettings?: () => void;
}) {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [deck, setDeck] = useState<Deck | null>(null);
  const [report, setReport] = useState<DeckReport | null>(null);
  const [collectionInfo, setCollectionInfo] = useState<
    { importedAt: string; ownedCount: number; missingCount: number } | null
  >(null);
  const [loading, setLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  // new-deck form
  const [showNewDeck, setShowNewDeck] = useState(false);
  const [newDeckName, setNewDeckName] = useState("");
  const [newDeckCommander, setNewDeckCommander] = useState("");
  const [newDeckBusy, setNewDeckBusy] = useState(false);
  const [newDeckError, setNewDeckError] = useState<string | null>(null);

  // add-card form
  const [addCardName, setAddCardName] = useState("");
  const [addCardTags, setAddCardTags] = useState("");
  const [addCardCount, setAddCardCount] = useState("1");
  const [addCardBusy, setAddCardBusy] = useState(false);
  const [rejected, setRejected] = useState<RejectedCard[]>([]);

  const [removeBusy, setRemoveBusy] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [manualCopyText, setManualCopyText] = useState<string | null>(null);

  // per-card tag editor
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [editorTags, setEditorTags] = useState<string[]>([]);
  const [editorInput, setEditorInput] = useState("");
  const [editorBusy, setEditorBusy] = useState(false);
  const editTriggerRef = useRef<HTMLButtonElement | null>(null);

  // group rename
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const groupRenameTriggerRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // sidebar / toolbar / hero UI state
  const [groupBy, setGroupBy] = useState<"type" | "tag">("type");
  const [sortBy, setSortBy] = useState<"name" | "cost">("name");
  const [addOpen, setAddOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [decksOpen, setDecksOpen] = useState(true);
  const [collOpen, setCollOpen] = useState(false);
  const [collState, setCollState] = useState<"none" | "fresh" | "stale">("none");

  // inline delete-deck confirm
  const [confirmingDeleteDeck, setConfirmingDeleteDeck] = useState(false);

  // deck rename (pencil affordance next to selector)
  const [renamingDeck, setRenamingDeck] = useState(false);
  const [deckRenameValue, setDeckRenameValue] = useState("");
  const [deckRenameBusy, setDeckRenameBusy] = useState(false);
  const [deckRenameError, setDeckRenameError] = useState<string | null>(null);
  const deckRenameTriggerRef = useRef<HTMLElement | null>(null);

  // commander change ("change" affordance in commander block)
  const [changingCommander, setChangingCommander] = useState(false);
  const [commanderValue, setCommanderValue] = useState("");
  const [commanderBusy, setCommanderBusy] = useState(false);
  const [commanderError, setCommanderError] = useState<string | null>(null);
  const [nowIllegal, setNowIllegal] = useState<IllegalCard[]>([]);
  const commanderTriggerRef = useRef<HTMLButtonElement | null>(null);

  // paste-import (New Deck flow, second path)
  const [showPasteImport, setShowPasteImport] = useState(false);
  const [importDeckName, setImportDeckName] = useState("");
  const [importText, setImportText] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importResult, setImportResult] = useState<DeckImportResult | null>(null);

  // basic-land count steppers
  const [countBusy, setCountBusy] = useState<string | null>(null);
  const [countError, setCountError] = useState<Record<string, string>>({});

  // tag-group delete confirm
  const [confirmingDeleteTag, setConfirmingDeleteTag] = useState<string | null>(null);
  const [tagDeleteBusy, setTagDeleteBusy] = useState(false);

  // export format picker: initialized from config.defaultExportFormat once
  // App.tsx's GET /api/config resolves (falls back to "mtga" until then, or
  // if config never arrives). Only adopts the config value before the user
  // has touched the picker, so it doesn't clobber a manual in-session choice.
  const [exportFormat, setExportFormat] = useState<ExportFormat>("mtga");
  const exportFormatTouchedRef = useRef(false);
  useEffect(() => {
    if (defaultExportFormat && !exportFormatTouchedRef.current) {
      setExportFormat(defaultExportFormat);
    }
  }, [defaultExportFormat]);

  // undo chip for card removal (× button). Captures `deck` (the selection AT
  // REMOVAL TIME) alongside name/tags/count so a deck switch while the chip
  // is armed can't make undo silently re-add to the WRONG (now-current) deck.
  const [undo, setUndo] = useState<{ deck: string; name: string; tags: string[]; count: number } | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshDecks = useCallback(
    (selectName?: string) => {
      return fetch("/api/decks")
        .then((r) => r.json())
        .then((list: DeckSummary[]) => {
          setDecks(list);
          setRefreshFailed(false);
          if (selectName) {
            setSelected(selectName);
          } else if (list.length > 0) {
            const s = selectedRef.current;
            if (list.some((d) => d.name === s)) {
              setSelected(s);
            } else {
              const stored = localStorage.getItem(LAST_DECK_KEY);
              const fallback = (stored && list.some((d) => d.name === stored)) ? stored : list[0].name;
              setSelected(fallback);
            }
          } else {
            setSelected("");
          }
          return list;
        })
        .catch(() => setRefreshFailed(true));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setSelected]
  );

  useEffect(() => {
    refreshDecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist selected deck for restore on next load.
  useEffect(() => {
    if (selected) localStorage.setItem(LAST_DECK_KEY, selected);
  }, [selected]);

  const createDeck = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!newDeckName.trim() || !newDeckCommander.trim()) return;
      setNewDeckBusy(true);
      setNewDeckError(null);
      fetch("/api/decks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newDeckName.trim(), commander: newDeckCommander.trim() }),
      })
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
          return body.deck as Deck;
        })
        .then((created) => {
          setShowNewDeck(false);
          setNewDeckName("");
          setNewDeckCommander("");
          refreshDecks(created.name);
        })
        .catch((err: Error) => setNewDeckError(err.message))
        .finally(() => setNewDeckBusy(false));
    },
    [newDeckName, newDeckCommander, refreshDecks]
  );

  const addCard = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!selected || !addCardName.trim()) return;
      setAddCardBusy(true);
      setRejected([]);
      const count = Math.max(1, parseInt(addCardCount, 10) || 1);
      const tags = addCardTags
        .split(",")
        .map((t) => t.trim())
        .filter((t) => t.length > 0);
      fetch(`/api/decks/${encodeURIComponent(selected)}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: [{ name: addCardName.trim(), tags, count }],
        }),
      })
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
          return body as { added: unknown[]; rejected: RejectedCard[] };
        })
        .then((result) => {
          setRejected(result.rejected ?? []);
          if ((result.added?.length ?? 0) > 0) {
            setAddCardName("");
            setAddCardTags("");
            setAddCardCount("1");
          }
          loadDeck(selected);
        })
        .catch((err: Error) => setRejected([{ name: addCardName.trim(), reason: err.message }]))
        .finally(() => setAddCardBusy(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, addCardName, addCardTags, addCardCount]
  );

  const armUndo = useCallback((deck: string, name: string, tags: string[], count: number) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndo({ deck, name, tags, count });
    undoTimerRef.current = setTimeout(() => setUndo(null), 4000);
  }, []);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    };
  }, []);

  const removeCard = useCallback(
    (name: string, tags: string[], count: number) => {
      if (!selected) return;
      setActionError(null);
      setRemoveBusy(name);
      fetch(`/api/decks/${encodeURIComponent(selected)}/cards`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: [name] }),
      })
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            throw new Error(body.error ?? `HTTP ${r.status}`);
          }
          armUndo(selected, name, tags, count);
          loadDeck(selected);
        })
        .catch((e: Error) => setActionError(e.message))
        .finally(() => setRemoveBusy(null));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, armUndo]
  );

  const undoRemove = useCallback(() => {
    if (!undo) return;
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    // Re-add to `undo.deck` — the deck captured AT REMOVAL TIME — not the
    // (possibly since-switched) current `selected`.
    const { deck, name, tags, count } = undo;
    setUndo(null);
    fetch(`/api/decks/${encodeURIComponent(deck)}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cards: [{ name, tags, count }] }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        if (selectedRef.current === deck) loadDeck(deck);
      })
      .catch((e: Error) => setActionError(e.message));
  }, [undo]);

  const openTagEditor = useCallback((key: string, tags: string[], trigger: HTMLButtonElement | null) => {
    editTriggerRef.current = trigger;
    setEditingCard(key);
    setEditorTags([...tags]);
    setEditorInput("");
  }, []);

  const closeTagEditor = useCallback(() => {
    setEditingCard(null);
    setEditorTags([]);
    setEditorInput("");
    // Defer the focus() call: editingCard flipping to null causes the
    // card-row (and this trigger button) to re-render, so calling .focus()
    // synchronously here — before React has flushed that re-render — can
    // lose focus rather than land it on the trigger. A headless-browser
    // check confirmed this: editorClosed=true but focus not on the trigger.
    // setTimeout(0) runs after the DOM update, so the trigger is stable by
    // the time we focus it.
    const trigger = editTriggerRef.current;
    editTriggerRef.current = null;
    setTimeout(() => trigger?.focus(), 0);
  }, []);

  const saveCardTags = useCallback(
    (cardName: string, tags: string[]) => {
      if (!selected) return;
      setActionError(null);
      setEditorBusy(true);
      fetch(`/api/decks/${encodeURIComponent(selected)}/cards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: [{ name: cardName, tags }] }),
      })
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            throw new Error(body.error ?? `HTTP ${r.status}`);
          }
          closeTagEditor();
          loadDeck(selected);
        })
        .catch((e: Error) => setActionError(e.message))
        .finally(() => setEditorBusy(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, closeTagEditor]
  );

  const cancelGroupRename = useCallback((tag: string) => {
    setRenamingGroup(null);
    // Same re-render-loses-focus hazard as closeTagEditor above: defer past
    // the state-flush re-render so the trigger button is focusable again.
    const trigger = groupRenameTriggerRefs.current.get(tag);
    setTimeout(() => trigger?.focus(), 0);
  }, []);

  const renameGroup = useCallback(
    (from: string, to: string) => {
      if (!selected || !to.trim() || to.trim() === from) {
        cancelGroupRename(from);
        return;
      }
      setActionError(null);
      setRenameBusy(true);
      fetch(`/api/decks/${encodeURIComponent(selected)}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: to.trim() }),
      })
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            throw new Error(body.error ?? `HTTP ${r.status}`);
          }
          cancelGroupRename(from);
          loadDeck(selected);
        })
        .catch((e: Error) => setActionError(e.message))
        .finally(() => setRenameBusy(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, cancelGroupRename]
  );

  const deleteCurrentDeck = useCallback(() => {
    if (!selected) return;
    setActionError(null);
    setConfirmingDeleteDeck(false);
    setDeleteBusy(true);
    fetch(`/api/decks/${encodeURIComponent(selected)}`, { method: "DELETE" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        setDeck(null);
        setReport(null);
        return refreshDecks();
      })
      .catch((e: Error) => setActionError(e.message))
      .finally(() => setDeleteBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, refreshDecks]);

  const openDeckRename = useCallback(() => {
    setDeckRenameValue(selected);
    setDeckRenameError(null);
    setRenamingDeck(true);
  }, [selected]);

  const cancelDeckRename = useCallback(() => {
    setRenamingDeck(false);
    setDeckRenameError(null);
    setTimeout(() => deckRenameTriggerRef.current?.focus(), 0);
  }, []);

  const submitDeckRename = useCallback(() => {
    const to = deckRenameValue.trim();
    if (!selected || !to || to === selected) {
      cancelDeckRename();
      return;
    }
    setDeckRenameBusy(true);
    setDeckRenameError(null);
    fetch(`/api/decks/${encodeURIComponent(selected)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: to }),
    })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body.deck as Deck;
      })
      .then((renamed) => {
        setRenamingDeck(false);
        refreshDecks(renamed.name);
      })
      .catch((e: Error) => setDeckRenameError(e.message))
      .finally(() => setDeckRenameBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, deckRenameValue, cancelDeckRename, refreshDecks]);

  const openCommanderChange = useCallback(() => {
    if (!deck) return;
    setCommanderValue(deck.commander);
    setCommanderError(null);
    setChangingCommander(true);
  }, [deck]);

  const cancelCommanderChange = useCallback(() => {
    setChangingCommander(false);
    setCommanderError(null);
    setTimeout(() => commanderTriggerRef.current?.focus(), 0);
  }, []);

  const submitCommanderChange = useCallback(() => {
    const commander = commanderValue.trim();
    if (!selected || !commander || (deck && commander === deck.commander)) {
      cancelCommanderChange();
      return;
    }
    setCommanderBusy(true);
    setCommanderError(null);
    fetch(`/api/decks/${encodeURIComponent(selected)}/commander`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commander }),
    })
      .then(async (r) => {
        const body = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
        return body as CommanderChangeResult;
      })
      .then((result) => {
        setChangingCommander(false);
        setNowIllegal(result.nowIllegal ?? []);
        loadDeck(selected);
      })
      .catch((e: Error) => setCommanderError(e.message))
      .finally(() => setCommanderBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, commanderValue, deck, cancelCommanderChange]);

  const submitPasteImport = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!importText.trim()) return;
      setImportBusy(true);
      setImportResult(null);
      fetch("/api/decks/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: importText,
          deckName: importDeckName.trim() || undefined,
        }),
      })
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          // Server may report failure via non-2xx OR via a 200 body carrying
          // `error`/`needsCommander` — handle both shapes defensively.
          return body as DeckImportResult;
        })
        .then((result) => {
          setImportResult(result);
          if (result.deck && !result.needsCommander && !result.error) {
            setShowPasteImport(false);
            setImportText("");
            setImportDeckName("");
            refreshDecks(result.deck.name);
          }
        })
        .catch((err: Error) => setImportResult({ error: err.message }))
        .finally(() => setImportBusy(false));
    },
    [importText, importDeckName, refreshDecks]
  );

  const changeCardCount = useCallback(
    (card: string, count: number) => {
      if (!selected || count < 1) return;
      setCountBusy(card);
      setCountError((prev) => {
        const { [card]: _drop, ...rest } = prev;
        return rest;
      });
      fetch(`/api/decks/${encodeURIComponent(selected)}/cards/count`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ card, count }),
      })
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
          return body as { deck: Deck; updated: boolean; rejected: RejectedCard | null };
        })
        .then((result) => {
          if (result.rejected) {
            setCountError((prev) => ({ ...prev, [card]: result.rejected!.reason }));
          }
          loadDeck(selected);
        })
        .catch((e: Error) => setCountError((prev) => ({ ...prev, [card]: e.message })))
        .finally(() => setCountBusy(null));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected]
  );

  const deleteTagGroup = useCallback(
    (tag: string) => {
      if (!selected) return;
      setActionError(null);
      setTagDeleteBusy(true);
      fetch(`/api/decks/${encodeURIComponent(selected)}/tags/${encodeURIComponent(tag)}`, {
        method: "DELETE",
      })
        .then(async (r) => {
          if (!r.ok) {
            const body = await r.json().catch(() => ({}));
            throw new Error(body.error ?? `HTTP ${r.status}`);
          }
          setConfirmingDeleteTag(null);
          loadDeck(selected);
        })
        .catch((e: Error) => setActionError(e.message))
        .finally(() => setTagDeleteBusy(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected]
  );

  const copyExport = useCallback(() => {
    if (!selected) return;
    fetch(`/api/decks/${encodeURIComponent(selected)}/export?format=${exportFormat}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const text = await r.text();
        const ok = await copyText(text);
        if (ok) {
          setCopyState("copied");
          setTimeout(() => setCopyState("idle"), 1500);
        } else {
          setManualCopyText(text);
        }
      })
      .catch(() => {
        setCopyState("error");
        setTimeout(() => setCopyState("idle"), 1500);
      });
  }, [selected, exportFormat]);

  const loadDeck = useCallback((name: string) => {
    if (!name) return;
    setLoading(true);
    setReportError(null);
    fetch(`/api/decks/${encodeURIComponent(name)}`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data: { deck: Deck; report?: DeckReport; collection?: { importedAt: string; ownedCount: number; missingCount: number } }) => {
        if (selectedRef.current !== name) return;
        setDeck(data.deck);
        setReport(data.report ?? null);
        setCollectionInfo(data.collection ?? null);
        if (!data.report) setReportError("report unavailable");
        const names = new Set<string>([
          data.deck.commander.toLowerCase(),
          ...data.deck.cards.map((c) => c.name.toLowerCase()),
        ]);
        onDeckNames?.(names);
      })
      .catch((err: Error) => {
        if (selectedRef.current !== name) return;
        setDeck(null);
        setReport(null);
        setCollectionInfo(null);
        setReportError(err.message);
        onDeckNames?.(new Set());
      })
      .finally(() => {
        if (selectedRef.current === name) setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setDeck(null);
    setReport(null);
    setCollectionInfo(null);
    if (!selected) {
      onDeckNames?.(new Set());
      return;
    }
    loadDeck(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, loadDeck]);

  const onCollectionImported = useCallback(() => {
    if (selectedRef.current) loadDeck(selectedRef.current);
  }, [loadDeck]);

  // Accepting a suggestion applies the add/cut server-side, so the open deck
  // is stale until it is refetched. Rejections do not touch the deck file.
  const onSuggestionApplied = useCallback(() => {
    if (selectedRef.current) loadDeck(selectedRef.current);
  }, [loadDeck]);

  // Global Escape: close whichever dismissible popover/editor is open.
  // Tag editor and manual-copy popover close via this even when focus is on
  // a chip/button inside them (not just the text input).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (manualCopyText !== null) {
        setManualCopyText(null);
        return;
      }
      if (shareOpen || moreOpen) {
        setShareOpen(false);
        setMoreOpen(false);
        return;
      }
      if (editingCard !== null) {
        closeTagEditor();
        return;
      }
      if (renamingDeck) {
        cancelDeckRename();
        return;
      }
      if (changingCommander) {
        cancelCommanderChange();
        return;
      }
      if (confirmingDeleteTag !== null) {
        setConfirmingDeleteTag(null);
        return;
      }
      if (confirmingDeleteDeck) {
        setConfirmingDeleteDeck(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [
    manualCopyText,
    shareOpen,
    moreOpen,
    editingCard,
    confirmingDeleteDeck,
    closeTagEditor,
    renamingDeck,
    cancelDeckRename,
    changingCommander,
    cancelCommanderChange,
    confirmingDeleteTag,
  ]);

  // Live refresh: refetch the open deck when its file changes on disk.
  useEffect(() => {
    const es = new EventSource("/api/deck-events");
    es.onmessage = (e) => {
      try {
        const { name } = JSON.parse(e.data) as { name: string };
        const current = selectedRef.current;
        // deck files are sanitized names; compare loosely
        const sanitize = (s: string) =>
          s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
        if (current && sanitize(current) === name) loadDeck(current);
      } catch {
        /* ignore malformed events */
      }
    };
    return () => es.close();
  }, [loadDeck]);

  const UNTAGGED = "untagged";
  type CardRow = {
    name: string;
    tags: string[];
    count: number;
    image?: string | null;
    manaCost?: string | null;
    producedMana?: string[] | null;
    typeLine?: string | null;
    owned?: boolean;
    arena?: boolean | null;
  };
  const tagGroups: [string, CardRow[]][] = [];
  const typeMap = new Map<string, CardRow[]>();
  const allDeckTags: string[] = [];
  if (deck) {
    const map = new Map<string, CardRow[]>();
    const seenTags = new Set<string>();
    for (const c of deck.cards) {
      const tags = c.tags ?? [];
      const row: CardRow = {
        name: c.name,
        tags,
        count: c.count ?? 1,
        image: c.image,
        manaCost: c.manaCost,
        producedMana: c.producedMana,
        typeLine: c.typeLine,
        owned: c.owned,
        arena: c.arena,
      };
      const pt = primaryType(c.typeLine);
      if (!typeMap.has(pt)) typeMap.set(pt, []);
      typeMap.get(pt)!.push(row);
      if (tags.length === 0) {
        if (!map.has(UNTAGGED)) map.set(UNTAGGED, []);
        map.get(UNTAGGED)!.push(row);
      } else {
        for (const tag of tags) {
          if (!seenTags.has(tag)) {
            seenTags.add(tag);
            allDeckTags.push(tag);
          }
          if (!map.has(tag)) map.set(tag, []);
          map.get(tag)!.push(row);
        }
      }
    }
    const entries = [...map.entries()].filter(([tag]) => tag !== UNTAGGED);
    entries.sort((a, b) => a[0].localeCompare(b[0]));
    for (const entry of entries) tagGroups.push(entry);
    if (map.has(UNTAGGED)) tagGroups.push([UNTAGGED, map.get(UNTAGGED)!]);
  }

  const typeOrder = [...TYPE_ORDER, "Other"];
  const typeGroups: [string, CardRow[]][] = typeOrder
    .filter((t) => typeMap.has(t))
    .map((t) => [t, typeMap.get(t)!]);
  const sortRows = (rows: CardRow[]) =>
    [...rows].sort((a, b) =>
      sortBy === "cost"
        ? cmcOf(a.manaCost) - cmcOf(b.manaCost) || a.name.localeCompare(b.name)
        : a.name.localeCompare(b.name)
    );
  const groups = groupBy === "tag" ? tagGroups : typeGroups;
  const avgMV = report ? avgManaValue(report.curve) : null;

  const totalCards = deck
    ? deck.cards.reduce((n, c) => n + (c.count ?? 1), 0)
    : 0;

  const newDeckForm = (
    <form className="new-deck-form" onSubmit={createDeck}>
      <input
        className="text-input"
        placeholder="Deck name"
        value={newDeckName}
        onChange={(e) => setNewDeckName(e.target.value)}
        disabled={newDeckBusy}
        aria-label="New deck name"
      />
      <input
        className="text-input"
        placeholder="Commander name"
        value={newDeckCommander}
        onChange={(e) => setNewDeckCommander(e.target.value)}
        disabled={newDeckBusy}
        aria-label="New deck commander"
      />
      <div className="form-row-actions">
        <button type="submit" className="sc-btn sc-btn-primary" disabled={newDeckBusy}>
          {newDeckBusy ? "Creating…" : "Create deck"}
        </button>
        {decks.length > 0 && (
          <button
            type="button"
            className="sc-btn sc-btn-ghost"
            onClick={() => {
              setShowNewDeck(false);
              setNewDeckError(null);
            }}
            disabled={newDeckBusy}
          >
            Cancel
          </button>
        )}
      </div>
      {newDeckError && <div className="sc-chip sc-chip-error">{newDeckError}</div>}
      {!showPasteImport ? (
        <button
          type="button"
          className="sc-btn sc-btn-ghost sc-btn-small paste-import-toggle"
          onClick={() => {
            setShowPasteImport(true);
            setImportResult(null);
          }}
        >
          or paste a decklist
        </button>
      ) : (
        <div className="paste-import">
          <input
            className="text-input"
            placeholder="Deck name (optional)"
            value={importDeckName}
            onChange={(e) => setImportDeckName(e.target.value)}
            disabled={importBusy}
            aria-label="Imported deck name"
          />
          <textarea
            className="text-input paste-import-textarea"
            placeholder={"Paste a decklist… mark the commander line with *CMDR* if needed"}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            disabled={importBusy}
            aria-label="Decklist to import"
            rows={6}
          />
          <div className="form-row-actions">
            <button
              type="button"
              className="sc-btn sc-btn-primary sc-btn-small"
              disabled={importBusy || !importText.trim()}
              onClick={submitPasteImport}
            >
              {importBusy ? "Importing…" : "Import"}
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-ghost sc-btn-small"
              disabled={importBusy}
              onClick={() => {
                setShowPasteImport(false);
                setImportResult(null);
                setImportText("");
                setImportDeckName("");
              }}
            >
              Cancel
            </button>
          </div>
          {importResult && (
            <div className="import-result">
              {importResult.error && <div className="sc-chip sc-chip-error">{importResult.error}</div>}
              {importResult.needsCommander && (
                <div className="sc-chip sc-chip-muted">
                  needs a commander — mark the commander line with <code>*CMDR*</code> and resubmit
                  {importResult.candidates && importResult.candidates.length > 0 && (
                    <>: {importResult.candidates.map((c) => c.name).join(", ")}</>
                  )}
                </div>
              )}
              {importResult.summary && <div className="quota-note">{importResult.summary}</div>}
              {(importResult.added?.length ?? 0) > 0 && (
                <div className="quota-note">{importResult.added!.length} added</div>
              )}
              {importResult.rejected && importResult.rejected.length > 0 && (
                <div className="rejected-list">
                  {importResult.rejected.map((r, i) => (
                    <div className="sc-chip sc-chip-error" key={`${r.name}-${i}`}>
                      {r.name}: {r.reason}
                    </div>
                  ))}
                </div>
              )}
              {importResult.unparsed && importResult.unparsed.length > 0 && (
                <div className="sc-chip sc-chip-muted">unparsed: {importResult.unparsed.join(" · ")}</div>
              )}
            </div>
          )}
        </div>
      )}
    </form>
  );


  const renderRow = (groupKey: string, c: CardRow) => {
    const editKey = `${groupKey}::${c.name}`;
    const isBasic = (c.typeLine ?? "").includes("Basic Land");
    const isLand = (c.typeLine ?? "").includes("Land");
    const producedMana = c.producedMana ?? [];
    const symbols = isLand
      ? producedMana.length > 0
        ? `{T}: ${producedMana.map((m) => `{${m}}`).join("")}`
        : "{T}"
      : c.manaCost;
    const toggleEditor = (trigger: HTMLButtonElement | null) =>
      editingCard === editKey ? closeTagEditor() : openTagEditor(editKey, c.tags, trigger);
    return (
      <Fragment key={c.name}>
        <div
          className={c.arena === false ? "row card-row card-row-no-arena" : "row card-row"}
          onClick={(e) =>
            toggleEditor(e.currentTarget.querySelector<HTMLButtonElement>(".edit-tags-btn"))
          }
        >
          <div className={isBasic ? "qty has-stepper" : "qty"} onClick={(e) => e.stopPropagation()}>
            {isBasic ? (
              <span className="count-stepper">
                <button
                  type="button"
                  className="count-stepper-btn"
                  onClick={() => changeCardCount(c.name, c.count - 1)}
                  disabled={c.count <= 1 || countBusy === c.name}
                  aria-label={`Decrease ${c.name} count`}
                >
                  −
                </button>
                <span className="count-stepper-val">{c.count}</span>
                <button
                  type="button"
                  className="count-stepper-btn"
                  onClick={() => changeCardCount(c.name, c.count + 1)}
                  disabled={countBusy === c.name}
                  aria-label={`Increase ${c.name} count`}
                >
                  +
                </button>
              </span>
            ) : (
              c.count
            )}
          </div>
          <div className="cname">
            <CardName name={c.name} image={c.image} />
            {c.owned === false && <span className="owned-chip owned-missing">missing</span>}
            {c.owned === true && <span className="owned-chip owned-yes">✓</span>}
            {c.arena === false && (
              <span className="owned-chip arena-missing" title="Not available on Arena">
                not on Arena
              </span>
            )}
          </div>
          <div className="cost">
            {symbols && (
              <span
                className="card-mana-cost"
                dangerouslySetInnerHTML={{ __html: renderManaSymbols(symbols) }}
              />
            )}
          </div>
          <button
            type="button"
            className="price"
            onClick={(e) => {
              e.stopPropagation();
              stub("Card prices")(e);
            }}
            title="Card price"
          >
            —
          </button>
          <button
            type="button"
            className="edit-tags-btn"
            onClick={(e) => {
              e.stopPropagation();
              toggleEditor(e.currentTarget);
            }}
            aria-label={`Edit tags for ${c.name}`}
            title="Edit tags"
          >
            ✎
          </button>
          <button
            type="button"
            className="remove-card-btn"
            onClick={(e) => {
              e.stopPropagation();
              removeCard(c.name, c.tags, c.count);
            }}
            disabled={removeBusy === c.name}
            aria-label={`Remove ${c.name}`}
            title={`Remove ${c.name}`}
          >
            ×
          </button>
        </div>
        {countError[c.name] && (
          <div className="row-error">
            <div className="sc-chip sc-chip-error sc-chip-dismissible">
              {c.name}: {countError[c.name]}
              <button
                type="button"
                className="sc-chip-dismiss"
                onClick={() =>
                  setCountError((prev) => {
                    const { [c.name]: _drop, ...rest } = prev;
                    return rest;
                  })
                }
                aria-label={`Dismiss error for ${c.name}`}
              >
                ×
              </button>
            </div>
          </div>
        )}
        {editingCard === editKey && (
          <div className="tag-editor-row">
            <div
              className="tag-editor"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.stopPropagation();
                  closeTagEditor();
                }
              }}
            >
              <div className="tag-editor-current">
                {editorTags.map((t) => (
                  <span
                    className="tag-chip tag-chip-removable"
                    key={t}
                    onClick={() => setEditorTags((prev) => prev.filter((x) => x !== t))}
                    title="Click to remove"
                  >
                    {t} ×
                  </span>
                ))}
              </div>
              <div className="tag-editor-input-row">
                <input
                  className="text-input"
                  placeholder="Add tag, press Enter"
                  value={editorInput}
                  onChange={(e) => setEditorInput(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const v = editorInput.trim();
                      if (v && !editorTags.includes(v)) {
                        setEditorTags((prev) => [...prev, v]);
                      }
                      setEditorInput("");
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      closeTagEditor();
                    }
                  }}
                  disabled={editorBusy}
                />
                <button
                  type="button"
                  className="sc-btn sc-btn-primary sc-btn-small"
                  disabled={editorBusy}
                  onClick={() => saveCardTags(c.name, editorTags)}
                >
                  {editorBusy ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  className="sc-btn sc-btn-ghost sc-btn-small"
                  disabled={editorBusy}
                  onClick={closeTagEditor}
                >
                  Cancel
                </button>
              </div>
              <div className="tag-editor-suggestions">
                {[...LEGACY_ROLE_TAGS, ...allDeckTags]
                  .filter((t, i, arr) => arr.indexOf(t) === i && !editorTags.includes(t))
                  .map((t) => (
                    <span
                      className="tag-chip tag-chip-suggestion"
                      key={t}
                      onClick={() => setEditorTags((prev) => [...prev, t])}
                    >
                      + {t}
                    </span>
                  ))}
              </div>
            </div>
          </div>
        )}
      </Fragment>
    );
  };

  const renderGroupHead = (key: string, cards: CardRow[]) => {
    const count = cards.reduce((n, c) => n + c.count, 0);
    if (groupBy === "type") {
      return (
        <div className="grouphead" key={key}>
          <b>{typeLabel(key)}</b> · {count}
        </div>
      );
    }
    const tag = key;
    if (renamingGroup === tag) {
      return (
        <div className="grouphead" key={key}>
          <span className="group-rename-row">
            <input
              className="text-input group-rename-input"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              disabled={renameBusy}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") renameGroup(tag, renameValue);
                if (e.key === "Escape") cancelGroupRename(tag);
              }}
              aria-label={`Rename tag ${tag}`}
            />
            <button
              type="button"
              className="sc-btn sc-btn-ghost sc-btn-small"
              onClick={() => renameGroup(tag, renameValue)}
              disabled={renameBusy}
            >
              Save
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-ghost sc-btn-small"
              onClick={() => cancelGroupRename(tag)}
              disabled={renameBusy}
            >
              Cancel
            </button>
          </span>
        </div>
      );
    }
    if (confirmingDeleteTag === tag) {
      return (
        <div className="grouphead" key={key}>
          <span className="inline-confirm group-delete-row">
            <span className="inline-confirm-text">
              remove tag "{tag}" from {cards.length} card{cards.length === 1 ? "" : "s"}?
            </span>
            <button
              type="button"
              className="sc-btn sc-btn-danger sc-btn-small"
              onClick={() => deleteTagGroup(tag)}
              disabled={tagDeleteBusy}
              autoFocus
            >
              {tagDeleteBusy ? "Removing…" : "Yes"}
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-ghost sc-btn-small"
              onClick={() => setConfirmingDeleteTag(null)}
              disabled={tagDeleteBusy}
            >
              No
            </button>
          </span>
        </div>
      );
    }
    return (
      <div className="grouphead" key={key}>
        <b>{tag}</b> · {count}
        {tag !== UNTAGGED && (
          <span className="gctl">
            <button
              type="button"
              className="group-rename-btn"
              ref={(el) => {
                if (el) groupRenameTriggerRefs.current.set(tag, el);
                else groupRenameTriggerRefs.current.delete(tag);
              }}
              onClick={() => {
                setRenamingGroup(tag);
                setRenameValue(tag);
              }}
              aria-label={`Rename tag ${tag}`}
              title="Rename tag"
            >
              ✎
            </button>
            <button
              type="button"
              className="group-delete-btn"
              onClick={() => setConfirmingDeleteTag(tag)}
              aria-label={`Remove tag ${tag}`}
              title="Remove tag"
            >
              ×
            </button>
          </span>
        )}
      </div>
    );
  };

  return (
    <>
      <nav className="sidebar" id="sidebar">
        <div className="logo">
          <span className="mark">◆</span>
          <span>scrychat</span>
        </div>
        <button
          type="button"
          className="newdeck"
          id="nav-newdeck"
          onClick={() => setShowNewDeck((s) => !s)}
        >
          <span className="ico">＋</span>
          <span>New deck</span>
        </button>
        {showNewDeck && decks.length > 0 && <div className="navpanel">{newDeckForm}</div>}

        <div className="navsec">
          <div className="navlabel">Browse</div>
          <button type="button" className="navitem" id="nav-explore" onClick={stub("Explore decks")}>
            <span className="ico">⌸</span>
            <span>Explore decks</span>
          </button>
          <button type="button" className="navitem" id="nav-commanders" onClick={stub("Commanders")}>
            <span className="ico">✦</span>
            <span>Commanders</span>
          </button>
          <button type="button" className="navitem" id="nav-precons" onClick={stub("Precons")}>
            <span className="ico">▤</span>
            <span>Precons</span>
          </button>
          <button type="button" className="navitem" id="nav-search" onClick={stub("Search cards")}>
            <span className="ico">⌕</span>
            <span>Search cards</span>
          </button>
        </div>
        <div className="navsec">
          <div className="navlabel">Library</div>
          <button
            type="button"
            className="navitem"
            id="nav-collection"
            onClick={() => setCollOpen((o) => !o)}
            aria-expanded={collOpen}
          >
            <span className="ico">◈</span>
            <span>My collection</span>
            <span className={`status-dot status-${collState}`} title={`collection: ${collState}`} />
          </button>
          {/* always mounted: CollectionSync auto-syncs the linked Arena folder on mount */}
          <div className="navpanel" hidden={!collOpen}>
            <CollectionSync onImported={onCollectionImported} onState={setCollState} />
          </div>
          <button
            type="button"
            className="navitem"
            id="nav-mydecks"
            onClick={() => setDecksOpen((o) => !o)}
            aria-expanded={decksOpen}
          >
            <span className="ico">▣</span>
            <span>My decks</span>
          </button>
          {decksOpen && (
            <div className="navpanel decklist">
              {decks.length === 0 && <div className="text-dim">no decks</div>}
              {decks.map((d) => (
                <button
                  type="button"
                  key={d.name}
                  className={d.name === selected ? "navitem active" : "navitem"}
                  onClick={() => setSelected(d.name)}
                >
                  <span className="ico">▣</span>
                  <span>{d.name}</span>
                </button>
              ))}
            </div>
          )}
          {refreshFailed && <div className="sc-chip sc-chip-muted">couldn't refresh decks</div>}
        </div>
        <div className="navsec">
          <div className="navlabel">Session</div>
          <button
            type="button"
            className="navitem active"
            onClick={() => setDecksOpen(true)}
            title="Active deck"
          >
            <span className="ico">●</span>
            <span>{selected || "no deck"}</span>
          </button>
        </div>

        <div className="spacer" />
        <div className="manacard">
          <div className="manatop">
            <span>mana</span>
            <b>— / —</b>
          </div>
          <div className="track">
            <div className="fill" style={{ width: 0 }} />
          </div>
        </div>
        <button type="button" className="user" onClick={onOpenSettings} title="Settings">
          <span className="avatar">⚙</span>
          <span>
            <span className="uname">—</span>
            <br />
            <span className="urank">Settings</span>
          </span>
        </button>
      </nav>

      <main className="deck-panel deck" id="pane-deck">
        {decks.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">🂠</div>
            <p>No decks yet — create one to get started.</p>
            {newDeckForm}
          </div>
        )}

        {loading && !deck && decks.length > 0 && <DeckSkeleton />}
        {reportError && !deck && decks.length > 0 && !loading && (
          <div className="sc-chip sc-chip-error">deck error: {reportError}</div>
        )}

        {deck && (
          <>
            <header className="hero">
              {deck.commanderImage && (
                <img className="commander-thumb" src={deck.commanderImage} alt="" loading="lazy" />
              )}
              <div className="heroactions">
                <button type="button" className="chip bracket" onClick={stub("Commander bracket")}>
                  <span className="dot" />
                  Bracket {deck.bracket ?? "—"}
                </button>
                <button type="button" className="chip" onClick={stub("Deckbuilding rules")}>
                  Deckbuilding rules
                </button>
                <span className="popwrap">
                  <button
                    type="button"
                    className="chip"
                    onClick={() => {
                      setShareOpen((o) => !o);
                      setMoreOpen(false);
                    }}
                    aria-expanded={shareOpen}
                  >
                    Share
                  </button>
                  {shareOpen && (
                    <div className="pop">
                      <div className="export-row">
                        <select
                          className="role-select export-format-select"
                          value={exportFormat}
                          onChange={(e) => {
                            exportFormatTouchedRef.current = true;
                            setExportFormat(e.target.value as ExportFormat);
                          }}
                          aria-label="Export format"
                        >
                          <option value="mtga">MTGA</option>
                          <option value="moxfield">Moxfield</option>
                          <option value="plain">Plain</option>
                        </select>
                        <button
                          type="button"
                          className="sc-btn sc-btn-ghost sc-btn-small export-deck-btn"
                          onClick={copyExport}
                        >
                          {copyState === "copied" ? "Copied ✓" : copyState === "error" ? "Copy failed" : "Export"}
                        </button>
                      </div>
                      {manualCopyText !== null && (
                        <div className="manual-copy-popover" role="dialog" aria-label="Copy deck export">
                          <div className="manual-copy-hint">Press Ctrl/Cmd+C to copy</div>
                          <textarea
                            className="manual-copy-textarea"
                            readOnly
                            value={manualCopyText}
                            autoFocus
                            onFocus={(e) => e.currentTarget.select()}
                          />
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost sc-btn-small manual-copy-close-btn"
                            onClick={() => setManualCopyText(null)}
                          >
                            Close
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </span>
                <span className="popwrap">
                  <button
                    type="button"
                    className="chip"
                    onClick={() => {
                      setMoreOpen((o) => !o);
                      setShareOpen(false);
                    }}
                    aria-expanded={moreOpen}
                    aria-label="More deck actions"
                  >
                    ⋯
                  </button>
                  {moreOpen && (
                    <div className="pop">
                      {confirmingDeleteDeck ? (
                        <span
                          className="inline-confirm"
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setConfirmingDeleteDeck(false);
                          }}
                        >
                          <span className="inline-confirm-text">Delete deck?</span>
                          <button
                            type="button"
                            className="sc-btn sc-btn-danger sc-btn-small"
                            onClick={deleteCurrentDeck}
                            disabled={deleteBusy}
                            autoFocus
                          >
                            {deleteBusy ? "Deleting…" : "Yes"}
                          </button>
                          <button
                            type="button"
                            className="sc-btn sc-btn-ghost sc-btn-small"
                            onClick={() => setConfirmingDeleteDeck(false)}
                            disabled={deleteBusy}
                          >
                            No
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="sc-btn sc-btn-danger sc-btn-small delete-deck-btn"
                          onClick={() => setConfirmingDeleteDeck(true)}
                          disabled={deleteBusy}
                        >
                          Delete deck
                        </button>
                      )}
                    </div>
                  )}
                </span>
                {report && report.identityViolations.length > 0 && (
                  <span className="chip chip-bad" title={report.identityViolations.join(", ")}>
                    identity violations: {report.identityViolations.join(", ")}
                  </span>
                )}
                {nowIllegal.length > 0 && (
                  <span className="chip chip-bad">
                    {nowIllegal.length} card{nowIllegal.length === 1 ? "" : "s"} now illegal
                  </span>
                )}
              </div>

              {renamingDeck ? (
                <input
                  className="text-input deckname-input"
                  value={deckRenameValue}
                  onChange={(e) => setDeckRenameValue(e.target.value)}
                  disabled={deckRenameBusy}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") submitDeckRename();
                    if (e.key === "Escape") cancelDeckRename();
                  }}
                  onBlur={submitDeckRename}
                  aria-label="Rename deck"
                />
              ) : (
                <h1
                  className="deckname"
                  ref={deckRenameTriggerRef as React.RefObject<HTMLHeadingElement>}
                  role="button"
                  tabIndex={0}
                  onClick={openDeckRename}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") openDeckRename();
                  }}
                  title="Click to rename"
                  aria-label="Rename deck"
                >
                  {deck.name}
                </h1>
              )}
              {deckRenameError && <div className="sc-chip sc-chip-error">{deckRenameError}</div>}

              {changingCommander ? (
                <span
                  className="inline-confirm commander-change-row"
                  onKeyDown={(e) => {
                    if (e.key === "Escape") cancelCommanderChange();
                  }}
                >
                  <input
                    className="text-input"
                    value={commanderValue}
                    onChange={(e) => setCommanderValue(e.target.value)}
                    disabled={commanderBusy}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") submitCommanderChange();
                    }}
                    aria-label="Change commander"
                  />
                  <button
                    type="button"
                    className="sc-btn sc-btn-primary sc-btn-small"
                    onClick={submitCommanderChange}
                    disabled={commanderBusy}
                  >
                    {commanderBusy ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="sc-btn sc-btn-ghost sc-btn-small"
                    onClick={cancelCommanderChange}
                    disabled={commanderBusy}
                  >
                    Cancel
                  </button>
                </span>
              ) : (
                <div className="commander-line">
                  <span className="commander-label">Commander</span>{" "}
                  <CardName name={deck.commander} image={deck.commanderImage} />
                  <button
                    type="button"
                    className="link change-commander-btn"
                    ref={commanderTriggerRef}
                    onClick={openCommanderChange}
                    aria-label="Change commander"
                    title="Change commander"
                  >
                    change
                  </button>
                </div>
              )}
              {commanderError && <div className="sc-chip sc-chip-error">{commanderError}</div>}

              <div className="subtitle">
                <span className="pips">
                  {deck.commanderIdentity.length === 0 ? (
                    <span className="pip" style={{ background: "var(--mtg-c)" }}>C</span>
                  ) : (
                    deck.commanderIdentity.map((c) => (
                      <span
                        className="pip"
                        key={c}
                        style={{ background: `var(--mtg-${PIP_VAR[c] ?? "c"})` }}
                      >
                        {c}
                      </span>
                    ))
                  )}
                </span>
                <span>
                  {totalCards + 1} cards
                  {collectionInfo && (
                    <>
                      {" · "}
                      {collectionInfo.missingCount === 0
                        ? "all owned ✓"
                        : `${collectionInfo.missingCount} missing on Arena`}
                    </>
                  )}
                  {" · "}
                </span>
                <button type="button" className="link" onClick={stub("Deck price")}>
                  {report ? `$${report.priceUsd.total.toFixed(2)}${report.priceUsd.unpriced > 0 ? ` (${report.priceUsd.unpriced} unpriced)` : ""}` : "$—"}
                </button>
                {loading && <span className="refreshing"> · refreshing…</span>}
              </div>
            </header>

            {nowIllegal.length > 0 && (
              <div className="section now-illegal-section">
                <div className="sc-chip sc-chip-error sc-chip-dismissible now-illegal-warning">
                  <div>
                    <strong>{nowIllegal.length} card{nowIllegal.length === 1 ? "" : "s"} now illegal:</strong>
                    <ul className="now-illegal-list">
                      {nowIllegal.map((c, i) => (
                        <li key={`${c.name}-${i}`}>
                          {c.name} — {c.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <button
                    type="button"
                    className="sc-chip-dismiss"
                    onClick={() => setNowIllegal([])}
                    aria-label="Dismiss illegal-cards warning"
                  >
                    ×
                  </button>
                </div>
              </div>
            )}

            <section className="section" id="strategy">
              <div className="sechead">
                <div className="sectitle">Strategy</div>
                <button type="button" className="link" onClick={stub("Deck strategy")}>
                  Read strategy →
                </button>
              </div>
              <div className="strategy">—</div>
              <div className="tags">
                <span className="tag">
                  — <button type="button" className="x" onClick={stub("Deck themes")}>✕</button>
                </span>
                <button type="button" className="tag add" onClick={stub("Deck themes")}>
                  ＋ Add a theme
                </button>
              </div>
            </section>

            <div className="toolbar">
              <button
                type="button"
                className="btn primary"
                onClick={() => setAddOpen((o) => !o)}
                aria-expanded={addOpen}
              >
                ＋ Add card
              </button>
              <button type="button" className="btn" id="tb-bulk" onClick={stub("Bulk actions")}>
                Bulk actions
              </button>
              <button type="button" className="btn" id="tb-playtest" onClick={stub("Playtest")}>
                Playtest
              </button>
              <div className="tbspacer" />
              <button
                type="button"
                className="btn"
                id="tb-group"
                onClick={() => setGroupBy((g) => (g === "type" ? "tag" : "type"))}
              >
                Group: {groupBy === "type" ? "Type" : "Tag"} ▾
              </button>
              <button
                type="button"
                className="btn"
                id="tb-sort"
                onClick={() => setSortBy((s) => (s === "name" ? "cost" : "name"))}
              >
                Sort: {sortBy === "name" ? "Name" : "Cost"} ▾
              </button>
              <button type="button" className="btn" onClick={stub("List view options")}>
                View: List ▾
              </button>
              {actionError && (
                <div className="sc-chip sc-chip-error sc-chip-dismissible">
                  {actionError}
                  <button
                    type="button"
                    className="sc-chip-dismiss"
                    onClick={() => setActionError(null)}
                    aria-label="Dismiss error"
                  >
                    ×
                  </button>
                </div>
              )}
              {undo && (
                <div className="sc-chip sc-chip-hint-inline">
                  Removed {undo.name}
                  <button type="button" className="sc-chip-retry" onClick={undoRemove}>
                    Undo
                  </button>
                </div>
              )}
            </div>

            {(addOpen || rejected.length > 0) && (
              <div className="section addsec">
                {addOpen && (
                  <form className="add-card-form" onSubmit={addCard}>
                    <input
                      className="text-input"
                      placeholder="Add card by name"
                      value={addCardName}
                      onChange={(e) => setAddCardName(e.target.value)}
                      disabled={addCardBusy}
                      aria-label="Card name to add"
                      autoFocus
                    />
                    <input
                      className="text-input tags-input"
                      placeholder="tags (comma-separated)"
                      value={addCardTags}
                      onChange={(e) => setAddCardTags(e.target.value)}
                      disabled={addCardBusy}
                      aria-label="Card tags"
                      list="legacy-role-tags"
                    />
                    <datalist id="legacy-role-tags">
                      {LEGACY_ROLE_TAGS.map((r) => (
                        <option key={r} value={r} />
                      ))}
                    </datalist>
                    <input
                      className="text-input count-input"
                      type="number"
                      min={1}
                      value={addCardCount}
                      onChange={(e) => setAddCardCount(e.target.value)}
                      disabled={addCardBusy}
                      aria-label="Card count"
                    />
                    <button type="submit" className="sc-btn sc-btn-primary sc-btn-small" disabled={addCardBusy}>
                      {addCardBusy ? "Adding…" : "Add"}
                    </button>
                  </form>
                )}
                {rejected.length > 0 && (
                  <div className="rejected-list">
                    {rejected.map((r, i) => (
                      <div className="sc-chip sc-chip-error" key={`${r.name}-${i}`}>
                        {r.name}: {r.reason}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {groups.map(([key, cards]) => (
              <Fragment key={`${groupBy}:${key}`}>
                {renderGroupHead(key, cards)}
                {sortRows(cards).map((c) => renderRow(key, c))}
              </Fragment>
            ))}
            {groups.length === 0 && (
              <div className="empty-state empty-state-inline">
                <div className="empty-state-icon" aria-hidden="true">🃏</div>
                <p>No cards yet — add one above or ask the chat.</p>
              </div>
            )}

            <Suggestions deckName={deck.name} onApplied={onSuggestionApplied} />

            <section className="section" id="samplehand">
              <div className="sechead">
                <div className="sectitle">Sample hand</div>
                <div style={{ display: "flex", gap: "var(--space-2)" }}>
                  <button type="button" className="btn" onClick={stub("Sample hand")}>
                    New hand
                  </button>
                  <button type="button" className="btn" onClick={stub("Sample hand")}>
                    Draw
                  </button>
                </div>
              </div>
              <div className="hand" id="hand">
                {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                  <div className="hcard" key={i}>—</div>
                ))}
              </div>
            </section>

            <section className="section" id="benchmarks">
              <div className="sechead">
                <div className="sectitle">Benchmarks</div>
                <button type="button" className="link" onClick={stub("Benchmark help")}>
                  What are these?
                </button>
              </div>
              {report ? (
                <>
                  <div className="bars">
                    {(
                      [
                        ["Lands", report.quotaCheck.lands],
                        ["Ramp", report.quotaCheck.ramp],
                        ["Card draw", report.quotaCheck.draw],
                        ["Removal", report.quotaCheck.interaction],
                        ["Win cons", report.quotaCheck.wincon],
                      ] as [string, QuotaCheck][]
                    ).map(([label, q]) => (
                      <div className="bar" key={label}>
                        <div className="lbl">{label}</div>
                        <div className="meter">
                          <i className={q.ok ? "ok" : "bad"} style={{ width: `${quotaFill(q)}%` }} />
                        </div>
                        <div className="val">
                          {q.have} / {q.want}
                        </div>
                      </div>
                    ))}
                    <div className="bar">
                      <div className="lbl">Avg. mana value</div>
                      <div className="meter">
                        <i className="ok" style={{ width: `${Math.min(100, Math.round(((avgMV ?? 0) / 6) * 100))}%` }} />
                      </div>
                      <div className="val">{avgMV === null ? "—" : avgMV.toFixed(2)}</div>
                    </div>
                    <div className="bar">
                      <div className="lbl">Wipes</div>
                      <div className="meter">
                        <i
                          className={report.quotaCheck.wipes.ok ? "ok" : "bad"}
                          style={{ width: `${quotaFill(report.quotaCheck.wipes)}%` }}
                        />
                      </div>
                      <div className="val">
                        {report.quotaCheck.wipes.have} / {report.quotaCheck.wipes.want}
                      </div>
                    </div>
                  </div>
                  <ManaCurve curve={report.curve} />
                  {report.violations.length > 0 && (
                    <div className="link benchnote" style={{ color: "var(--bad, #f7768e)" }}>
                      {report.violations.length} contract {report.violations.length === 1 ? "miss" : "misses"}:{" "}
                      {report.violations.join("; ")}
                    </div>
                  )}
                  {report.untaggedForQuota > 0 && (
                    <div className="link benchnote">{report.untaggedForQuota} cards untagged for quota</div>
                  )}
                  {report.arenaCheck && (
                    <div className="link benchnote">
                      {report.arenaCheck.onArena} / {report.arenaCheck.total} on Arena
                      {report.arenaCheck.missing.length > 0 && ` · ${report.arenaCheck.missing.length} missing`}
                    </div>
                  )}
                </>
              ) : reportError ? (
                <div className="sc-chip sc-chip-error">report failed: {reportError}</div>
              ) : (
                <div className="deck-loading">loading report…</div>
              )}
            </section>

            <section className="section" style={{ borderBottom: 0 }} id="colourbreak">
              <div className="sechead">
                <div className="sectitle">Colour breakdown</div>
              </div>
              <div className="colors">
                {(
                  [
                    ["w", "White"],
                    ["u", "Blue"],
                    ["b", "Black"],
                    ["c", "Colourless"],
                  ] as const
                ).map(([k, name]) => (
                  <div className="colorcard" key={k}>
                    <div className="n" style={{ color: `var(--mtg-${k})` }}>—</div>
                    <div className="c">{name}</div>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </main>
    </>
  );
}
