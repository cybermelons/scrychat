import { useCallback, useEffect, useRef, useState } from "react";
import type { Suggestion } from "./types";
import { CardName } from "./CardName";
import { decideBody } from "./suggestion-decide-core";

const KIND_LABEL: Record<Suggestion["kind"], string> = {
  add: "Add",
  cut: "Cut",
  swap: "Swap",
};

/**
 * Suggestion review UI inside the deck manager: the AI queues proposals via
 * the deck_suggest MCP tool, and a human accepts or rejects each one here.
 *
 * Accepting is what mutates the deck (the server applies the add/cut), so
 * onApplied re-runs the deck load to pick up the change. A rejection only
 * records the verdict, so it refreshes this list alone.
 */
export function Suggestions({
  deckName,
  onApplied,
}: {
  deckName: string;
  onApplied: () => void;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showDecided, setShowDecided] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  // Guards against a response for a previous deck landing after a switch.
  const deckRef = useRef(deckName);
  deckRef.current = deckName;

  const load = useCallback((name: string) => {
    if (!name) return;
    setLoading(true);
    fetch(`/api/decks/${encodeURIComponent(name)}/suggestions`)
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data: { suggestions: Suggestion[] }) => {
        if (deckRef.current !== name) return;
        setItems(data.suggestions ?? []);
        setError(null);
      })
      .catch((err: Error) => {
        if (deckRef.current !== name) return;
        setItems([]);
        setError(err.message);
      })
      .finally(() => {
        if (deckRef.current === name) setLoading(false);
      });
  }, []);

  useEffect(() => {
    setItems([]);
    setError(null);
    load(deckName);
  }, [deckName, load]);

  const decide = useCallback(
    async (id: string, verdict: "accept" | "reject", note?: string) => {
      setBusyId(id);
      setError(null);
      try {
        const res = await fetch(
          `/api/decks/${encodeURIComponent(deckName)}/suggestions/${encodeURIComponent(id)}/${verdict}`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            // The note rides along with the verdict rather than going to a
            // route of its own: core's decideSuggestion is the only writer
            // that may set it, and it refuses a second decision on the same
            // suggestion, so there is no later moment at which a note could
            // still be attached. Body shape lives in suggestion-decide-core
            // so a test can pin it without a DOM.
            body: decideBody(note),
          }
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        load(deckName);
        // Only an accept changes the deck file.
        if (verdict === "accept") onApplied();
      } catch (err) {
        setError((err as Error).message);
        // A stale suggestion stays pending, so re-read to show live state.
        load(deckName);
      } finally {
        setBusyId(null);
      }
    },
    [deckName, load, onApplied]
  );

  const clearDecided = useCallback(async () => {
    setClearBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/decks/${encodeURIComponent(deckName)}/suggestions`,
        { method: "DELETE" }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      load(deckName);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setClearBusy(false);
    }
  }, [deckName, load]);

  const pending = items.filter((s) => s.status === "pending");
  const decided = items.filter((s) => s.status !== "pending");

  // Nothing queued and nothing decided: stay out of the way entirely.
  if (!loading && !error && items.length === 0) return null;

  return (
    <section className="deck-section suggestions">
      <h2>
        Suggestions
        {pending.length > 0 && (
          <span className="suggestion-count">{pending.length}</span>
        )}
      </h2>

      {error && <div className="sc-chip sc-chip-error">{error}</div>}

      {loading && items.length === 0 ? (
        <div className="deck-loading">loading suggestions…</div>
      ) : (
        <>
          {pending.length === 0 && decided.length > 0 && (
            <div className="sc-chip sc-chip-muted">no pending suggestions</div>
          )}

          {pending.map((s) => (
            <SuggestionCard
              key={s.id}
              s={s}
              busy={busyId === s.id}
              onDecide={decide}
            />
          ))}

          {decided.length > 0 && (
            <div className="suggestions-decided">
              <button
                type="button"
                className="sc-btn sc-btn-ghost sc-btn-small"
                onClick={() => setShowDecided((v) => !v)}
                aria-expanded={showDecided}
              >
                {showDecided ? "▾" : "▸"} Decided ({decided.length})
              </button>
              {showDecided && (
                <>
                  {decided.map((s) => (
                    <SuggestionCard key={s.id} s={s} busy={false} />
                  ))}
                  <button
                    type="button"
                    className="sc-btn sc-btn-ghost sc-btn-small"
                    onClick={clearDecided}
                    disabled={clearBusy}
                  >
                    {clearBusy ? "clearing…" : "Clear decided"}
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SuggestionCard({
  s,
  busy,
  onDecide,
}: {
  s: Suggestion;
  busy: boolean;
  onDecide?: (id: string, verdict: "accept" | "reject", note?: string) => void;
}) {
  // A note is written BEFORE the verdict, not after: decideSuggestion refuses
  // a second decision on the same suggestion, so once Accept or Reject lands
  // there is no way to add the reason. Hence a disclosure here rather than an
  // edit control on the decided card.
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState("");
  const trimmed = note.trim();

  return (
    <article className={`suggestion suggestion-${s.status}`}>
      <div className="suggestion-head">
        <span className={`suggestion-kind kind-${s.kind}`}>
          {KIND_LABEL[s.kind]}
        </span>
        {s.role && <span className="sc-chip suggestion-role">{s.role}</span>}
        {s.status !== "pending" && (
          <span className={`suggestion-verdict verdict-${s.status}`}>
            {s.status}
          </span>
        )}
      </div>

      <div className="suggestion-change">
        {s.out && (
          <span className="suggestion-out">
            <CardName name={s.out} />
          </span>
        )}
        {s.out && s.in && <span className="suggestion-arrow">→</span>}
        {s.in && (
          <span className="suggestion-in">
            <CardName name={s.in} />
          </span>
        )}
      </div>

      <p className="suggestion-why">{s.why}</p>
      {s.note && <p className="suggestion-note">note: {s.note}</p>}

      {onDecide && s.status === "pending" && (
        <>
          {noteOpen && (
            <textarea
              className="suggestion-note-input"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="why — recorded with the verdict"
              rows={2}
              disabled={busy}
              aria-label="Note to record with this verdict"
            />
          )}
          <div className="suggestion-actions">
            <button
              type="button"
              className="sc-btn sc-btn-primary sc-btn-small"
              onClick={() => onDecide(s.id, "accept", trimmed || undefined)}
              disabled={busy}
            >
              {busy ? "…" : "Accept"}
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-ghost sc-btn-small"
              onClick={() => onDecide(s.id, "reject", trimmed || undefined)}
              disabled={busy}
            >
              Reject
            </button>
            <button
              type="button"
              className="sc-btn sc-btn-ghost sc-btn-small suggestion-note-btn"
              onClick={() => setNoteOpen((v) => !v)}
              disabled={busy}
              aria-expanded={noteOpen}
            >
              {trimmed ? "Note ✓" : "Note…"}
            </button>
          </div>
        </>
      )}
    </article>
  );
}
