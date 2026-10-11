import { useEffect, useState } from "react";
import { healthPills, type HealthResponse, type Pill } from "../../src/health-pills.js";

type State = { kind: "loading" } | { kind: "error"; message: string } | { kind: "ready"; pills: Pill[] };

/** Three status pills from one GET /api/health. Never shows ok before it knows. */
export function HealthRow() {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/health")
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<HealthResponse>;
      })
      .then((data) => {
        if (!cancelled) setState({ kind: "ready", pills: healthPills(data) });
      })
      .catch((e: unknown) => {
        if (!cancelled) setState({ kind: "error", message: e instanceof Error ? e.message : String(e) });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.kind === "loading") {
    return (
      <div id="health-row">
        <span className="hpill dim">health: checking…</span>
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div id="health-row">
        <span className="hpill dim" title={`GET /api/health failed: ${state.message}`}>
          health: unavailable
        </span>
      </div>
    );
  }
  return (
    <div id="health-row">
      {state.pills.map((p) => (
        <span key={p.id} id={p.id} className={"hpill " + p.tone} title={p.title}>
          {p.label}
        </span>
      ))}
    </div>
  );
}
