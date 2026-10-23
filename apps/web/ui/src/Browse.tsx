import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

export type BrowseTab = "commanders" | "precons" | "explore";
export type BrowseTarget = { tab: BrowseTab; precon?: string };

type Cmdr = { name: string; colorIdentity: string[]; typeLine: string | null; image: string | null; edhrecRank: number | null };
type PreconSum = { fileName: string; name: string; code: string; releaseDate: string; cardCount: number; commanders: { name: string; colorIdentity: string[]; image: string | null }[] };
type PreconFull = PreconSum & { cards: { name: string; count: number }[] };
type MyDeck = { name: string; commander: string; colorIdentity: string[]; cardCount: number; image: string | null };
type Detail = { kind: "commander"; c: Cmdr } | { kind: "precon"; fileName: string };

const COLORS = ["W", "U", "B", "R", "G", "C"];
const PIP_VAR: Record<string, string> = { W: "w", U: "u", B: "b", R: "r", G: "g", C: "c" };
const PAGE = 60;

async function getJson<T>(url: string): Promise<T> {
  const r = await fetch(url);
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error ?? `HTTP ${r.status}`);
  return body as T;
}

function Pips({ ids }: { ids: string[] }) {
  return (
    <span className="pips">
      {(ids.length ? ids : ["C"]).map((c) => (
        <span className="pip" key={c} style={{ background: `var(--mtg-${PIP_VAR[c] ?? "c"})` }}>{c}</span>
      ))}
    </span>
  );
}

function Tile({ image, title, sub, ids, onClick }: { image: string | null; title: string; sub?: string; ids?: string[]; onClick: () => void }) {
  return (
    <button type="button" className="btile" onClick={onClick}>
      <div className="btile-img">{image ? <img src={image} alt="" loading="lazy" /> : <span>{title}</span>}</div>
      <div className="btile-name">{title}</div>
      <div className="btile-sub">{ids && <Pips ids={ids} />}{sub && <span>{sub}</span>}</div>
    </button>
  );
}

export function Browse({ target, onClose, onOpenDeck }: { target: BrowseTarget; onClose: () => void; onOpenDeck: (name: string) => void }) {
  const [tab, setTab] = useState<BrowseTab>(target.tab);
  const [detail, setDetail] = useState<Detail | null>(target.precon ? { kind: "precon", fileName: target.precon } : null);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [colors, setColors] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cmdrs, setCmdrs] = useState<Cmdr[]>([]);
  const [total, setTotal] = useState(0);
  const [precons, setPrecons] = useState<PreconSum[]>([]);
  const [mine, setMine] = useState<MyDeck[]>([]);
  const [full, setFull] = useState<PreconFull | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(text), 250);
    return () => clearTimeout(t);
  }, [text]);

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  const qs = `q=${encodeURIComponent(q)}&colors=${colors}`;

  useEffect(() => {
    if (detail) return;
    let live = true;
    setError(null);
    setLoading(true);
    const done = () => live && setLoading(false);
    const fail = (e: Error) => live && setError(e.message);
    if (tab === "commanders") {
      getJson<{ commanders: Cmdr[]; total: number }>(`/api/browse/commanders?${qs}&limit=${PAGE}`)
        .then((r) => live && (setCmdrs(r.commanders), setTotal(r.total)), fail).finally(done);
    } else if (tab === "precons") {
      getJson<{ precons: PreconSum[] }>(`/api/browse/precons?${qs}`).then((r) => live && setPrecons(r.precons), fail).finally(done);
    } else {
      getJson<{ decks: MyDeck[]; precons: PreconSum[]; preconError?: string }>(`/api/browse/explore?${qs}`)
        .then((r) => live && (setMine(r.decks), setPrecons(r.precons), r.preconError && setError(r.preconError)), fail).finally(done);
    }
    return () => { live = false; };
  }, [tab, qs, detail]);

  useEffect(() => {
    if (detail?.kind !== "precon") return;
    let live = true;
    setFull(null);
    setError(null);
    getJson<PreconFull>(`/api/browse/precons/${encodeURIComponent(detail.fileName)}`).then((p) => live && setFull(p), (e: Error) => live && setError(e.message));
    return () => { live = false; };
  }, [detail]);

  const more = useCallback(() => {
    setLoading(true);
    getJson<{ commanders: Cmdr[]; total: number }>(`/api/browse/commanders?${qs}&limit=${PAGE}&offset=${cmdrs.length}`)
      .then((r) => setCmdrs((c) => [...c, ...r.commanders]), (e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [qs, cmdrs.length]);

  const post = (url: string, body: unknown) => {
    setBusy(true);
    setError(null);
    fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error ?? `HTTP ${r.status}`);
        onOpenDeck(b.deck.name);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setBusy(false));
  };

  const toggle = (c: string) => setColors((cur) => (c === "C" ? (cur === "C" ? "" : "C") : cur.replace("C", "").includes(c) ? cur.replace(c, "") : cur.replace("C", "") + c));

  const preconTile = (p: PreconSum) => (
    <Tile key={p.fileName} image={p.commanders[0]?.image ?? null} title={p.name}
      sub={`${p.code} ${p.releaseDate.slice(0, 4)}`} ids={[...new Set(p.commanders.flatMap((c) => c.colorIdentity))]}
      onClick={() => setDetail({ kind: "precon", fileName: p.fileName })} />
  );

  let body;
  if (detail?.kind === "commander") {
    const c = detail.c;
    body = (
      <div className="bdetail">
        {c.image && <img className="bdetail-img" src={c.image} alt={c.name} />}
        <div className="bdetail-info">
          <h2>{c.name}</h2>
          <div className="btile-sub"><Pips ids={c.colorIdentity} /><span>{c.typeLine}</span></div>
          {c.edhrecRank != null && <div className="btile-sub">EDHREC rank {c.edhrecRank}</div>}
          <div><button type="button" className="sc-btn sc-btn-primary" disabled={busy} onClick={() => post("/api/browse/start", { commander: c.name })}>{busy ? "Creating…" : "Start deck"}</button></div>
        </div>
      </div>
    );
  } else if (detail) {
    body = !full ? (
      error ? null : <div className="bempty">Loading precon…</div>
    ) : (
      <div className="bdetail">
        <div className="bdetail-info">
          <h2>{full.name}</h2>
          <div className="btile-sub"><span>{full.code} · {full.releaseDate}</span><span>{full.cardCount} cards</span></div>
          <div className="btile-sub">Commander: {full.commanders.map((c) => c.name).join(" + ")}</div>
          <div><button type="button" className="sc-btn sc-btn-primary" disabled={busy} onClick={() => post(`/api/browse/precons/${encodeURIComponent(full.fileName)}/import`, {})}>{busy ? "Importing…" : "Import as deck"}</button></div>
          <ul className="bcards">{full.cards.map((c) => <li key={c.name}>{c.count > 1 ? `${c.count}× ` : ""}{c.name}</li>)}</ul>
        </div>
      </div>
    );
  } else if (tab === "commanders") {
    body = (
      <>
        <div className="bgrid">{cmdrs.map((c) => <Tile key={c.name} image={c.image} title={c.name} ids={c.colorIdentity} onClick={() => setDetail({ kind: "commander", c })} />)}</div>
        {!loading && cmdrs.length === 0 && !error && <div className="bempty">No commanders match.</div>}
        {cmdrs.length < total && <button type="button" className="sc-btn" disabled={loading} onClick={more}>Load more ({cmdrs.length} of {total})</button>}
      </>
    );
  } else if (tab === "precons") {
    body = <div className="bgrid">{precons.map(preconTile)}{!loading && precons.length === 0 && !error && <div className="bempty">No precons match.</div>}</div>;
  } else {
    body = (
      <>
        <div className="sectitle">Your decks</div>
        <div className="bgrid">
          {mine.map((d) => <Tile key={d.name} image={d.image} title={d.name} sub={`${d.commander} · ${d.cardCount}`} ids={d.colorIdentity} onClick={() => onOpenDeck(d.name)} />)}
          {!loading && mine.length === 0 && <div className="bempty">No decks match.</div>}
        </div>
        <div className="sectitle">Precons</div>
        <div className="bgrid">{precons.map(preconTile)}{!loading && precons.length === 0 && <div className="bempty">No precons match.</div>}</div>
      </>
    );
  }

  return createPortal(
    <div className="browse-overlay" role="dialog" aria-label="Browse" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="browse">
        <div className="browse-head">
          {(["explore", "commanders", "precons"] as BrowseTab[]).map((t) => (
            <button key={t} type="button" className={`btab${tab === t ? " active" : ""}`} id={`browse-tab-${t}`}
              onClick={() => { setTab(t); setDetail(null); setError(null); }}>
              {t === "explore" ? "Explore" : t === "commanders" ? "Commanders" : "Precons"}
            </button>
          ))}
          <span className="tbspacer" />
          <button type="button" className="btn" onClick={onClose} aria-label="Close">✕</button>
        </div>
        {detail ? (
          <div className="browse-ctrls"><button type="button" className="btn" onClick={() => { setDetail(null); setError(null); }}>← Back</button></div>
        ) : (
          <div className="browse-ctrls">
            <input className="browse-search" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search by name…" aria-label="Search" />
            <span className="pips">
              {COLORS.map((c) => (
                <button key={c} type="button" className={`pip pip-btn${colors.includes(c) ? " on" : ""}`} aria-pressed={colors.includes(c)}
                  style={{ background: `var(--mtg-${PIP_VAR[c]})` }} onClick={() => toggle(c)}>{c}</button>
              ))}
            </span>
          </div>
        )}
        <div className="browse-body">
          {error && <div className="sc-chip sc-chip-error">{error}</div>}
          {loading && <div className="bempty">Loading…</div>}
          {body}
        </div>
      </div>
    </div>,
    document.body
  );
}

/** "Other <commander> decks" form for the Cards pane. */
export function OtherDecks({ deck, refreshKey, onSelectDeck, onOpenPrecon }: { deck: string; refreshKey?: unknown; onSelectDeck: (n: string) => void; onOpenPrecon: (fileName: string) => void }) {
  const [d, setD] = useState<{ commander: string; decks: { name: string; cardCount: number }[]; precons: PreconSum[]; preconError?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    if (!deck) { setD(null); return; }
    let live = true;
    setErr(null);
    getJson<NonNullable<typeof d>>(`/api/browse/other-decks?deck=${encodeURIComponent(deck)}`).then((r) => live && setD(r), (e: Error) => live && setErr(e.message));
    return () => { live = false; };
  }, [deck, refreshKey]);
  if (!deck) return null;
  if (err) return <div className="sc-chip sc-chip-error">{err}</div>;
  if (!d) return null;
  return (
    <div className="otherdecks" id="other-decks">
      <h3>Other {d.commander} decks</h3>
      {d.preconError && <div className="sc-chip sc-chip-error">{d.preconError}</div>}
      {d.decks.map((x) => (
        <button key={x.name} type="button" className="deckcard" onClick={() => onSelectDeck(x.name)}>
          <span className="dt">{x.name}</span><span className="dm">Your deck · {x.cardCount} cards</span>
        </button>
      ))}
      {d.precons.map((p) => (
        <button key={p.fileName} type="button" className="deckcard" onClick={() => onOpenPrecon(p.fileName)}>
          <span className="dt">{p.name}</span><span className="dm">Precon · {p.code} {p.releaseDate.slice(0, 4)}</span>
        </button>
      ))}
      {d.decks.length + d.precons.length === 0 && !d.preconError && <div className="bempty">No other decks with this commander.</div>}
    </div>
  );
}
