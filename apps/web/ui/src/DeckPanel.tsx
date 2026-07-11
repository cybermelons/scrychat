import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { Deck, DeckReport, DeckSummary, QuotaCheck, RejectedCard } from "./types";
import { LEGACY_ROLE_TAGS } from "./types";
import { CardName } from "./CardName";
import { renderManaSymbols } from "./markdown";
import { CollectionSync } from "./CollectionSync";

const CURVE_ORDER = ["0", "1", "2", "3", "4", "5", "6", "7+"];
const LAST_DECK_KEY = "scrychat.lastDeck";

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
  open,
  onClose,
}: {
  selected: string;
  setSelected: (name: string) => void;
  onDeckNames?: (names: Set<string>) => void;
  open?: boolean;
  onClose?: () => void;
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

  // inline delete-deck confirm
  const [confirmingDeleteDeck, setConfirmingDeleteDeck] = useState(false);

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

  const copyExport = useCallback(() => {
    if (!selected) return;
    fetch(`/api/decks/${encodeURIComponent(selected)}/export?format=mtga`)
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
  }, [selected]);

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
      if (editingCard !== null) {
        closeTagEditor();
        return;
      }
      if (confirmingDeleteDeck) {
        setConfirmingDeleteDeck(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [manualCopyText, editingCard, confirmingDeleteDeck, closeTagEditor]);

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
  };
  const tagGroups: [string, CardRow[]][] = [];
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
      };
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
        <button type="submit" className="btn btn-primary" disabled={newDeckBusy}>
          {newDeckBusy ? "Creating…" : "Create deck"}
        </button>
        {decks.length > 0 && (
          <button
            type="button"
            className="btn btn-ghost"
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
      {newDeckError && <div className="chip chip-error">{newDeckError}</div>}
    </form>
  );

  return (
    <>
      {open && <div className="drawer-overlay" onClick={onClose} />}
      <aside className={`deck-panel${open ? " drawer-open" : ""}`}>
        <div className="deck-panel-header">
          <h1 className="app-title">scrychat</h1>
        <div className="deck-select-row">
          <select
            className="deck-select"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            aria-label="Select deck"
          >
            {decks.length === 0 && <option value="">no decks</option>}
            {decks.map((d) => (
              <option key={d.name} value={d.name}>
                {d.name}
              </option>
            ))}
          </select>
          {decks.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => setShowNewDeck((s) => !s)}
            >
              + New Deck
            </button>
          )}
        </div>
        {decks.length > 0 && showNewDeck && newDeckForm}
        {refreshFailed && <div className="chip chip-muted">couldn't refresh decks</div>}
        <CollectionSync onImported={onCollectionImported} />
      </div>

      {decks.length === 0 && (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">🂠</div>
          <p>No decks yet — create one to get started.</p>
          {newDeckForm}
        </div>
      )}

      {loading && !deck && decks.length > 0 && <DeckSkeleton />}
      {reportError && !deck && decks.length > 0 && !loading && (
        <div className="chip chip-error">deck error: {reportError}</div>
      )}

      {deck && (
        <div className="deck-body">
          <div className="commander">
            <div className="commander-label">Commander</div>
            <div className="commander-row">
              {deck.commanderImage && (
                <img
                  className="commander-thumb"
                  src={deck.commanderImage}
                  alt=""
                  loading="lazy"
                />
              )}
              <div>
                <div className="commander-name">
                  <CardName name={deck.commander} image={deck.commanderImage} />
                </div>
                <div className="commander-meta">
                  {deck.commanderIdentity.join("")} · {totalCards + 1} cards
                  {collectionInfo && (
                    <>
                      {" · "}
                      {collectionInfo.missingCount === 0
                        ? "all owned ✓"
                        : `${collectionInfo.missingCount} missing on Arena`}
                    </>
                  )}
                  {loading && <span className="refreshing"> · refreshing…</span>}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost btn-small export-deck-btn"
              onClick={copyExport}
            >
              {copyState === "copied" ? "Copied ✓" : copyState === "error" ? "Copy failed" : "Export"}
            </button>
            {confirmingDeleteDeck ? (
              <span className="inline-confirm" onKeyDown={(e) => {
                if (e.key === "Escape") setConfirmingDeleteDeck(false);
              }}>
                <span className="inline-confirm-text">Delete deck?</span>
                <button
                  type="button"
                  className="btn btn-danger btn-small"
                  onClick={deleteCurrentDeck}
                  disabled={deleteBusy}
                  autoFocus
                >
                  {deleteBusy ? "Deleting…" : "Yes"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => setConfirmingDeleteDeck(false)}
                  disabled={deleteBusy}
                >
                  No
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="btn btn-danger btn-small delete-deck-btn"
                onClick={() => setConfirmingDeleteDeck(true)}
                disabled={deleteBusy}
              >
                Delete deck
              </button>
            )}
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
                  className="btn btn-ghost btn-small manual-copy-close-btn"
                  onClick={() => setManualCopyText(null)}
                >
                  Close
                </button>
              </div>
            )}
          </div>

          {report ? (
            <>
              <section className="deck-section">
                <h2>Quotas</h2>
                <ul className="quota-list">
                  <QuotaRow label="Lands" q={report.quotaCheck.lands} />
                  <QuotaRow label="Ramp" q={report.quotaCheck.ramp} />
                  <QuotaRow label="Draw" q={report.quotaCheck.draw} />
                  <QuotaRow label="Interaction" q={report.quotaCheck.interaction} />
                  <QuotaRow label="Wipes" q={report.quotaCheck.wipes} />
                </ul>
                {report.identityViolations.length > 0 && (
                  <div className="chip chip-error">
                    identity violations: {report.identityViolations.join(", ")}
                  </div>
                )}
                {report.untaggedForQuota > 0 && (
                  <div className="quota-note">{report.untaggedForQuota} cards untagged for quota</div>
                )}
              </section>

              <section className="deck-section">
                <h2>Mana curve</h2>
                <ManaCurve curve={report.curve} />
              </section>
            </>
          ) : reportError ? (
            <div className="chip chip-error">report failed: {reportError}</div>
          ) : (
            <div className="deck-loading">loading report…</div>
          )}

          <section className="deck-section">
            <h2>Cards</h2>
            {actionError && (
              <div className="chip chip-error chip-dismissible">
                {actionError}
                <button
                  type="button"
                  className="chip-dismiss"
                  onClick={() => setActionError(null)}
                  aria-label="Dismiss error"
                >
                  ×
                </button>
              </div>
            )}
            {undo && (
              <div className="chip chip-hint-inline">
                Removed {undo.name}
                <button type="button" className="chip-retry" onClick={undoRemove}>
                  Undo
                </button>
              </div>
            )}
            <form className="add-card-form" onSubmit={addCard}>
              <input
                className="text-input"
                placeholder="Add card by name"
                value={addCardName}
                onChange={(e) => setAddCardName(e.target.value)}
                disabled={addCardBusy}
                aria-label="Card name to add"
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
              <button type="submit" className="btn btn-primary btn-small" disabled={addCardBusy}>
                {addCardBusy ? "Adding…" : "Add"}
              </button>
            </form>
            {rejected.length > 0 && (
              <div className="rejected-list">
                {rejected.map((r, i) => (
                  <div className="chip chip-error" key={`${r.name}-${i}`}>
                    {r.name}: {r.reason}
                  </div>
                ))}
              </div>
            )}
            {tagGroups.length > 0 && (
              <table className="card-table">
                {tagGroups.map(([tag, cards]) => (
                  <tbody className="role-group" key={tag}>
                    <tr className="role-header-row">
                      <th className="role-header-cell" colSpan={5}>
                        {renamingGroup === tag ? (
                          <span className="group-rename-row" onClick={(e) => e.stopPropagation()}>
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
                              className="btn btn-ghost btn-small"
                              onClick={() => renameGroup(tag, renameValue)}
                              disabled={renameBusy}
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              className="btn btn-ghost btn-small"
                              onClick={() => cancelGroupRename(tag)}
                              disabled={renameBusy}
                            >
                              Cancel
                            </button>
                          </span>
                        ) : (
                          <>
                            <span className="role-name">{tag}</span>
                            {tag !== UNTAGGED && (
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
                            )}
                            <span className="role-count">
                              {cards.reduce((n, c) => n + c.count, 0)}
                            </span>
                          </>
                        )}
                      </th>
                    </tr>
                    {cards.map((c) => {
                      const editKey = `${tag}::${c.name}`;
                      return (
                      <Fragment key={c.name}>
                        <tr className="card-row">
                          <td className="card-count-cell">
                            {c.count > 1 ? `${c.count}×` : ""}
                          </td>
                          <td className="card-name-cell">
                            <CardName name={c.name} image={c.image} />
                            {c.owned === false && (
                              <span className="owned-chip owned-missing">missing</span>
                            )}
                            {c.owned === true && (
                              <span className="owned-chip owned-yes">✓</span>
                            )}
                          </td>
                          <td className="card-mana-cell">
                            {(() => {
                              const isLand = (c.typeLine ?? "").includes("Land");
                              const producedMana = c.producedMana ?? [];
                              const symbols = isLand
                                ? producedMana.length > 0
                                  ? `{T}: ${producedMana.map((m) => `{${m}}`).join("")}`
                                  : "{T}"
                                : c.manaCost;
                              return (
                                symbols && (
                                  <span
                                    className="card-mana-cost"
                                    dangerouslySetInnerHTML={{ __html: renderManaSymbols(symbols) }}
                                  />
                                )
                              );
                            })()}
                          </td>
                          <td className="card-edit-cell">
                            <button
                              type="button"
                              className="edit-tags-btn"
                              onClick={(e) =>
                                editingCard === editKey
                                  ? closeTagEditor()
                                  : openTagEditor(editKey, c.tags, e.currentTarget)
                              }
                              aria-label={`Edit tags for ${c.name}`}
                              title="Edit tags"
                            >
                              ✎
                            </button>
                          </td>
                          <td className="card-remove-cell">
                            <button
                              type="button"
                              className="remove-card-btn"
                              onClick={() => removeCard(c.name, c.tags, c.count)}
                              disabled={removeBusy === c.name}
                              aria-label={`Remove ${c.name}`}
                              title={`Remove ${c.name}`}
                            >
                              ×
                            </button>
                          </td>
                        </tr>
                        {editingCard === editKey && (
                          <tr className="tag-editor-row">
                            <td colSpan={5}>
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
                                    className="btn btn-primary btn-small"
                                    disabled={editorBusy}
                                    onClick={() => saveCardTags(c.name, editorTags)}
                                  >
                                    {editorBusy ? "Saving…" : "Save"}
                                  </button>
                                  <button
                                    type="button"
                                    className="btn btn-ghost btn-small"
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
                            </td>
                          </tr>
                        )}
                      </Fragment>
                      );
                    })}
                  </tbody>
                ))}
              </table>
            )}
            {tagGroups.length === 0 && (
              <div className="empty-state empty-state-inline">
                <div className="empty-state-icon" aria-hidden="true">🃏</div>
                <p>No cards yet — add one above or ask the chat.</p>
              </div>
            )}
          </section>
        </div>
      )}
      </aside>
    </>
  );
}
