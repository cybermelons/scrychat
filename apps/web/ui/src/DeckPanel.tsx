import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { Deck, DeckReport, DeckSummary, QuotaCheck, RejectedCard } from "./types";
import { LEGACY_ROLE_TAGS } from "./types";
import { CardName } from "./CardName";
import { renderManaSymbols } from "./markdown";

const CURVE_ORDER = ["0", "1", "2", "3", "4", "5", "6", "7+"];

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
  const [loading, setLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
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

  // per-card tag editor
  const [editingCard, setEditingCard] = useState<string | null>(null);
  const [editorTags, setEditorTags] = useState<string[]>([]);
  const [editorInput, setEditorInput] = useState("");
  const [editorBusy, setEditorBusy] = useState(false);

  // group rename
  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);

  const refreshDecks = useCallback(
    (selectName?: string) => {
      return fetch("/api/decks")
        .then((r) => r.json())
        .then((list: DeckSummary[]) => {
          setDecks(list);
          if (selectName) {
            setSelected(selectName);
          } else if (list.length > 0) {
            const s = selectedRef.current;
            setSelected(list.some((d) => d.name === s) ? s : list[0].name);
          } else {
            setSelected("");
          }
          return list;
        })
        .catch(() => setDecks([]));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setSelected]
  );

  useEffect(() => {
    refreshDecks();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const removeCard = useCallback(
    (name: string) => {
      if (!selected) return;
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
          loadDeck(selected);
        })
        .catch(() => void 0)
        .finally(() => setRemoveBusy(null));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected]
  );

  const openTagEditor = useCallback((key: string, tags: string[]) => {
    setEditingCard(key);
    setEditorTags([...tags]);
    setEditorInput("");
  }, []);

  const closeTagEditor = useCallback(() => {
    setEditingCard(null);
    setEditorTags([]);
    setEditorInput("");
  }, []);

  const saveCardTags = useCallback(
    (cardName: string, tags: string[]) => {
      if (!selected) return;
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
        .catch(() => void 0)
        .finally(() => setEditorBusy(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, closeTagEditor]
  );

  const renameGroup = useCallback(
    (from: string, to: string) => {
      if (!selected || !to.trim() || to.trim() === from) {
        setRenamingGroup(null);
        return;
      }
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
          setRenamingGroup(null);
          loadDeck(selected);
        })
        .catch(() => void 0)
        .finally(() => setRenameBusy(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected]
  );

  const deleteCurrentDeck = useCallback(() => {
    if (!selected) return;
    if (!window.confirm(`Delete deck "${selected}"? This cannot be undone.`)) return;
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
      .catch(() => void 0)
      .finally(() => setDeleteBusy(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, refreshDecks]);

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
      .then((data: { deck: Deck; report?: DeckReport }) => {
        if (selectedRef.current !== name) return;
        setDeck(data.deck);
        setReport(data.report ?? null);
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
    if (!selected) {
      onDeckNames?.(new Set());
      return;
    }
    loadDeck(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, loadDeck]);

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
  type CardRow = { name: string; tags: string[]; count: number; image?: string | null; manaCost?: string | null };
  const tagGroups: [string, CardRow[]][] = [];
  const allDeckTags: string[] = [];
  if (deck) {
    const map = new Map<string, CardRow[]>();
    const seenTags = new Set<string>();
    for (const c of deck.cards) {
      const tags = c.tags ?? [];
      const row: CardRow = { name: c.name, tags, count: c.count ?? 1, image: c.image, manaCost: c.manaCost };
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
                  {loading && <span className="refreshing"> · refreshing…</span>}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-danger btn-small delete-deck-btn"
              onClick={deleteCurrentDeck}
              disabled={deleteBusy}
            >
              {deleteBusy ? "Deleting…" : "Delete deck"}
            </button>
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
                                if (e.key === "Escape") setRenamingGroup(null);
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
                              onClick={() => setRenamingGroup(null)}
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
                          </td>
                          <td className="card-mana-cell">
                            {c.manaCost && (
                              <span
                                className="card-mana-cost"
                                dangerouslySetInnerHTML={{ __html: renderManaSymbols(c.manaCost) }}
                              />
                            )}
                          </td>
                          <td className="card-edit-cell">
                            <button
                              type="button"
                              className="edit-tags-btn"
                              onClick={() =>
                                editingCard === editKey ? closeTagEditor() : openTagEditor(editKey, c.tags)
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
                              onClick={() => removeCard(c.name)}
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
                              <div className="tag-editor">
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
                                    onKeyDown={(e) => {
                                      if (e.key === "Enter") {
                                        e.preventDefault();
                                        const v = editorInput.trim();
                                        if (v && !editorTags.includes(v)) {
                                          setEditorTags((prev) => [...prev, v]);
                                        }
                                        setEditorInput("");
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
          </section>
        </div>
      )}
      </aside>
    </>
  );
}
