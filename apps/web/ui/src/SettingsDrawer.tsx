import { useCallback, useEffect, useState } from "react";
import type { AppConfig, ExportFormat, QuotaTargetKey, QuotaTargets } from "./types";

const SHOW_IN_DECK_KEY = "scrychat.showInDeck";

const QUOTA_ROWS: { key: QuotaTargetKey; label: string }[] = [
  { key: "lands", label: "Lands" },
  { key: "ramp", label: "Ramp" },
  { key: "draw", label: "Draw" },
  { key: "interaction", label: "Interaction" },
  { key: "wipes", label: "Wipes" },
];

type QuotaDraft = Record<QuotaTargetKey, [string, string]>;

function draftFromEffective(config: AppConfig): QuotaDraft {
  const draft = {} as QuotaDraft;
  for (const { key } of QUOTA_ROWS) {
    const [min, max] = config.effectiveQuotaTargets[key];
    draft[key] = [String(min), String(max)];
  }
  return draft;
}

export function SettingsDrawer({
  open,
  onClose,
  config,
  onConfigChange,
  triggerRef,
  showInDeck,
  onShowInDeckChange,
}: {
  open: boolean;
  onClose: () => void;
  config: AppConfig | null;
  onConfigChange: (config: AppConfig) => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  showInDeck: boolean;
  onShowInDeckChange: (value: boolean) => void;
}) {
  const [quotaDraft, setQuotaDraft] = useState<QuotaDraft | null>(null);
  const [quotaBusy, setQuotaBusy] = useState(false);
  const [quotaErrors, setQuotaErrors] = useState<string[]>([]);

  // Reset the quota draft from the latest effective targets whenever the
  // drawer (re)opens or the config's effective targets change underneath it
  // (e.g. after a save or a reset-to-defaults).
  useEffect(() => {
    if (open && config) setQuotaDraft(draftFromEffective(config));
  }, [open, config]);

  // Escape closes the drawer, focus returns to the gear button that opened
  // it — matches ChatPanel/DeckPanel's existing Escape + focus-return
  // convention for inline dialogs.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        setTimeout(() => triggerRef.current?.focus(), 0);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose, triggerRef]);

  const patchConfig = useCallback(
    (body: Partial<{ linkifyPass: boolean; defaultExportFormat: ExportFormat; quotaTargets: QuotaTargets | null }>) => {
      return fetch("/api/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }).then(async (r) => {
        const responseBody = await r.json().catch(() => ({}));
        if (!r.ok) {
          throw new Error(
            Array.isArray(responseBody.errors) ? responseBody.errors.join("; ") : `HTTP ${r.status}`
          );
        }
        onConfigChange(responseBody as AppConfig);
        return responseBody as AppConfig;
      });
    },
    [onConfigChange]
  );

  const toggleLinkify = useCallback(
    (checked: boolean) => {
      void patchConfig({ linkifyPass: checked }).catch(() => void 0);
    },
    [patchConfig]
  );

  const changeExportFormat = useCallback(
    (format: ExportFormat) => {
      void patchConfig({ defaultExportFormat: format }).catch(() => void 0);
    },
    [patchConfig]
  );

  const saveQuotaTargets = useCallback(() => {
    if (!quotaDraft) return;
    setQuotaBusy(true);
    setQuotaErrors([]);
    const parsed: QuotaTargets = {};
    for (const { key } of QUOTA_ROWS) {
      const [minStr, maxStr] = quotaDraft[key];
      const min = Number(minStr);
      const max = Number(maxStr);
      parsed[key] = [min, max];
    }
    patchConfig({ quotaTargets: parsed })
      .catch((e: Error) => setQuotaErrors([e.message]))
      .finally(() => setQuotaBusy(false));
  }, [quotaDraft, patchConfig]);

  const resetQuotaTargets = useCallback(() => {
    setQuotaBusy(true);
    setQuotaErrors([]);
    patchConfig({ quotaTargets: null })
      .catch((e: Error) => setQuotaErrors([e.message]))
      .finally(() => setQuotaBusy(false));
  }, [patchConfig]);

  const setDraftValue = useCallback((key: QuotaTargetKey, idx: 0 | 1, value: string) => {
    setQuotaDraft((prev) => {
      if (!prev) return prev;
      const pair: [string, string] = [...prev[key]];
      pair[idx] = value;
      return { ...prev, [key]: pair };
    });
  }, []);

  if (!open) return null;

  return (
    <>
      <div className="drawer-overlay settings-drawer-overlay" onClick={onClose} />
      <aside className="settings-drawer" role="dialog" aria-label="Settings">
        <div className="settings-drawer-header">
          <h2>Settings</h2>
          <button
            type="button"
            className="btn btn-ghost btn-small"
            onClick={onClose}
            aria-label="Close settings"
          >
            ×
          </button>
        </div>

        {!config ? (
          <div className="chip chip-muted">loading settings…</div>
        ) : (
          <div className="settings-drawer-body">
            <section className="settings-section">
              <label className="settings-checkbox-row">
                <input
                  type="checkbox"
                  checked={config.linkifyPass}
                  onChange={(e) => toggleLinkify(e.target.checked)}
                  aria-label="Card-name linkify pass"
                />
                Card-name linkify pass
              </label>
              <p className="settings-hint">
                Extra cheap-model pass that wraps missed card names after each reply.
              </p>
            </section>

            <section className="settings-section">
              <label className="settings-label" htmlFor="settings-export-format">
                Default export format
              </label>
              <select
                id="settings-export-format"
                className="role-select"
                value={config.defaultExportFormat}
                onChange={(e) => changeExportFormat(e.target.value as ExportFormat)}
                aria-label="Default export format"
              >
                <option value="mtga">MTGA</option>
                <option value="moxfield">Moxfield</option>
                <option value="plain">Plain</option>
              </select>
            </section>

            <section className="settings-section">
              <label className="settings-checkbox-row">
                <input
                  type="checkbox"
                  checked={showInDeck}
                  onChange={(e) => onShowInDeckChange(e.target.checked)}
                  aria-label="Show in-deck checkmarks on card references"
                />
                Show in-deck checkmarks
              </label>
              <p className="settings-hint">Marks card references already in the active deck.</p>
            </section>

            <section className="settings-section">
              <div className="settings-label">Quota targets</div>
              {quotaDraft && (
                <div className="quota-editor">
                  {QUOTA_ROWS.map(({ key, label }) => (
                    <div className="quota-editor-row" key={key}>
                      <span className="quota-editor-label">{label}</span>
                      <input
                        className="text-input count-input"
                        type="number"
                        min={0}
                        value={quotaDraft[key][0]}
                        onChange={(e) => setDraftValue(key, 0, e.target.value)}
                        aria-label={`${label} minimum`}
                        disabled={quotaBusy}
                      />
                      <span className="quota-editor-sep">–</span>
                      <input
                        className="text-input count-input"
                        type="number"
                        min={0}
                        value={quotaDraft[key][1]}
                        onChange={(e) => setDraftValue(key, 1, e.target.value)}
                        aria-label={`${label} maximum`}
                        disabled={quotaBusy}
                      />
                    </div>
                  ))}
                </div>
              )}
              <div className="form-row-actions">
                <button
                  type="button"
                  className="btn btn-primary btn-small"
                  onClick={saveQuotaTargets}
                  disabled={quotaBusy}
                >
                  {quotaBusy ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={resetQuotaTargets}
                  disabled={quotaBusy}
                >
                  Reset to defaults
                </button>
              </div>
              {quotaErrors.length > 0 && (
                <div className="chip chip-error chip-dismissible">
                  {quotaErrors.join("; ")}
                  <button
                    type="button"
                    className="chip-dismiss"
                    onClick={() => setQuotaErrors([])}
                    aria-label="Dismiss error"
                  >
                    ×
                  </button>
                </div>
              )}
            </section>

            <section className="settings-section">
              <div className="settings-label">Recognized quota tags</div>
              <div className="settings-tag-list">
                {config.recognizedQuotaTags.map((t) => (
                  <span className="chip chip-muted" key={t}>
                    {t}
                  </span>
                ))}
              </div>
              <p className="settings-hint">tags counted by quota checks</p>
            </section>

            <p className="settings-footnote">
              Model names, the linkify wordlist, and internal caps are intentionally not configurable.
            </p>
          </div>
        )}
      </aside>
    </>
  );
}
