import { useCallback, useEffect, useRef, useState } from "react";
import type { Deck, DeckReport, DeckSummary, QuotaCheck } from "./types";
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

export function DeckPanel() {
  const [decks, setDecks] = useState<DeckSummary[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [deck, setDeck] = useState<Deck | null>(null);
  const [report, setReport] = useState<DeckReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;

  useEffect(() => {
    fetch("/api/decks")
      .then((r) => r.json())
      .then((list: DeckSummary[]) => {
        setDecks(list);
        if (list.length > 0) setSelected((s) => s || list[0].name);
      })
      .catch(() => setDecks([]));
  }, []);

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

  const roleGroups: [string, { name: string; count: number }[]][] = [];
  if (deck) {
    const map = new Map<string, { name: string; count: number }[]>();
    for (const c of deck.cards) {
      const role = c.role ?? "other";
      if (!map.has(role)) map.set(role, []);
      map.get(role)!.push({ name: c.name, count: c.count ?? 1 });
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

  return (
    <aside className="deck-panel">
      <div className="deck-panel-header">
        <h1 className="app-title">scrychat</h1>
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
      </div>

      {loading && !deck && <div className="deck-loading">loading deck…</div>}
      {reportError && !deck && (
        <div className="chip chip-error">deck error: {reportError}</div>
      )}

      {deck && (
        <div className="deck-body">
          <div className="commander">
            <div className="commander-label">Commander</div>
            <div className="commander-name">
              <CardName name={deck.commander} />
            </div>
            <div className="commander-meta">
              {deck.commanderIdentity.join("")} · {totalCards + 1} cards
              {loading && <span className="refreshing"> · refreshing…</span>}
            </div>
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
                    <li key={c.name}>
                      {c.count > 1 && <span className="card-count">{c.count}× </span>}
                      <CardName name={c.name} />
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
