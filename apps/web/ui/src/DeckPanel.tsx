import { useCallback, useEffect, useRef, useState } from "react";
import type { Deck, DeckReport, DeckSummary, QuotaCheck, RejectedCard } from "./types";
import { CARD_ROLES } from "./types";
import { CardName } from "./CardName";

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

export function DeckPanel({
  selected,
  setSelected,
}: {
  selected: string;
  setSelected: (name: string) => void;
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
  const [addCardRole, setAddCardRole] = useState<string>("other");
  const [addCardCount, setAddCardCount] = useState("1");
  const [addCardBusy, setAddCardBusy] = useState(false);
  const [rejected, setRejected] = useState<RejectedCard[]>([]);

  const [removeBusy, setRemoveBusy] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

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
      fetch(`/api/decks/${encodeURIComponent(selected)}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: [{ name: addCardName.trim(), role: addCardRole, count }],
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
            setAddCardCount("1");
          }
          loadDeck(selected);
        })
        .catch((err: Error) => setRejected([{ name: addCardName.trim(), reason: err.message }]))
        .finally(() => setAddCardBusy(false));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, addCardName, addCardRole, addCardCount]
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
      })
      .catch((err: Error) => {
        if (selectedRef.current !== name) return;
        setDeck(null);
        setReport(null);
        setReportError(err.message);
      })
      .finally(() => {
        if (selectedRef.current === name) setLoading(false);
      });
  }, []);

  useEffect(() => {
    setDeck(null);
    setReport(null);
    loadDeck(selected);
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

  const roleGroups: [string, { name: string; count: number; image?: string | null }[]][] = [];
  if (deck) {
    const map = new Map<string, { name: string; count: number; image?: string | null }[]>();
    for (const c of deck.cards) {
      const role = c.role ?? "other";
      if (!map.has(role)) map.set(role, []);
      map.get(role)!.push({ name: c.name, count: c.count ?? 1, image: c.image });
    }
    for (const [role, cards] of [...map.entries()].sort((a, b) =>
      a[0].localeCompare(b[0])
    )) {
      roleGroups.push([role, cards]);
    }
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
    <aside className="deck-panel">
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
          <p>No decks yet.</p>
          {newDeckForm}
        </div>
      )}

      {loading && !deck && <div className="deck-loading">loading deck…</div>}
      {reportError && !deck && decks.length > 0 && (
        <div className="chip chip-error">deck error: {reportError}</div>
      )}

      {deck && (
        <div className="deck-body">
          <div className="commander">
            <div className="commander-label">Commander</div>
            <div className="commander-name">
              <CardName name={deck.commander} image={deck.commanderImage} />
            </div>
            <div className="commander-meta">
              {deck.commanderIdentity.join("")} · {totalCards + 1} cards
              {loading && <span className="refreshing"> · refreshing…</span>}
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
              <select
                className="role-select"
                value={addCardRole}
                onChange={(e) => setAddCardRole(e.target.value)}
                disabled={addCardBusy}
                aria-label="Card role"
              >
                {CARD_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
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
            {roleGroups.map(([role, cards]) => (
              <div className="role-group" key={role}>
                <div className="role-header">
                  <span className="role-name">{role}</span>
                  <span className="role-count">
                    {cards.reduce((n, c) => n + c.count, 0)}
                  </span>
                </div>
                <ul className="card-list">
                  {cards.map((c) => (
                    <li key={c.name} className="card-row">
                      {c.count > 1 && <span className="card-count">{c.count}× </span>}
                      <CardName name={c.name} image={c.image} />
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
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </section>
        </div>
      )}
    </aside>
  );
}
