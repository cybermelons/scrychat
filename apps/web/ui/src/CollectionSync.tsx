import { useCallback, useEffect, useRef, useState } from "react";
import {
  fsApiSupported,
  linkArenaFolder,
  loadStoredHandle,
  postLogText,
  requestFolderPermission,
  syncFromHandle,
} from "./arenaSync";

type CollectionInfo =
  | { exists: false }
  | { exists: true; importedAt: string; source: string; uniqueOwned: number; totalCards: number; unmatchedCount: number };

function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return "just now";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function CollectionSync({ onImported }: { onImported?: () => void }) {
  const [info, setInfo] = useState<CollectionInfo | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [handle, setHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshInfo = useCallback(() => {
    return fetch("/api/collection")
      .then((r) => r.json())
      .then((data: CollectionInfo) => setInfo(data))
      .catch(() => setInfo({ exists: false }));
  }, []);

  useEffect(() => {
    void refreshInfo();
  }, [refreshInfo]);

  // On mount, if the file-system API is supported and a handle was
  // previously stored, try an automatic sync against it.
  useEffect(() => {
    if (!fsApiSupported()) return;
    let cancelled = false;
    void loadStoredHandle().then(async (h) => {
      if (!h || cancelled) return;
      setHandle(h);
      const infoNow = await fetch("/api/collection")
        .then((r) => r.json())
        .catch(() => ({ exists: false }) as CollectionInfo);
      const lastImportedAt = infoNow.exists ? infoNow.importedAt : null;
      const result = await syncFromHandle(h, lastImportedAt);
      if (cancelled) return;
      if (result.status === "imported") {
        setStatus("imported");
        void refreshInfo();
        onImported?.();
      } else if (result.status === "up-to-date") {
        setStatus("up-to-date");
      } else if (result.status === "denied") {
        setNeedsReauth(true);
        setStatus("permission needed");
      } else if (result.status === "no-log") {
        setStatus("no Player.log found in linked folder");
      } else {
        setStatus(`sync error: ${result.message}`);
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doLink = useCallback(() => {
    setBusy(true);
    setStatus(null);
    linkArenaFolder()
      .then(async (h) => {
        if (!h) {
          setStatus("folder link cancelled or unsupported");
          return;
        }
        setHandle(h);
        setNeedsReauth(false);
        const result = await syncFromHandle(h, null);
        if (result.status === "imported") {
          setStatus("imported");
          void refreshInfo();
          onImported?.();
        } else if (result.status === "no-log") {
          setStatus("no Player.log found in linked folder");
        } else if (result.status === "denied") {
          setNeedsReauth(true);
          setStatus("permission needed");
        } else if (result.status === "error") {
          setStatus(`sync error: ${result.message}`);
        }
      })
      .finally(() => setBusy(false));
  }, [refreshInfo, onImported]);

  const doReauth = useCallback(() => {
    if (!handle) return;
    setBusy(true);
    requestFolderPermission(handle)
      .then(async (granted) => {
        if (!granted) {
          setStatus("permission denied");
          return;
        }
        setNeedsReauth(false);
        const result = await syncFromHandle(handle, null);
        if (result.status === "imported") {
          setStatus("imported");
          void refreshInfo();
          onImported?.();
        } else {
          setStatus(result.status);
        }
      })
      .finally(() => setBusy(false));
  }, [handle, refreshInfo, onImported]);

  const importFile = useCallback(
    (file: File) => {
      setBusy(true);
      setStatus(null);
      file
        .text()
        .then((text) => postLogText(text))
        .then(() => {
          setStatus("imported");
          void refreshInfo();
          onImported?.();
        })
        .catch((err: Error) => setStatus(`error: ${err.message}`))
        .finally(() => setBusy(false));
    },
    [refreshInfo, onImported]
  );

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) importFile(file);
    },
    [importFile]
  );

  const onFilePick = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) importFile(file);
      e.target.value = "";
    },
    [importFile]
  );

  return (
    <div className="collection-sync">
      <div className="collection-status">
        {info?.exists ? (
          <span>
            Arena: {info.uniqueOwned} cards · imported {relativeTime(info.importedAt)}
          </span>
        ) : (
          <span className="text-dim">No collection imported</span>
        )}
      </div>
      <div className="collection-actions">
        {fsApiSupported() && (
          <button type="button" className="btn btn-ghost btn-small" onClick={doLink} disabled={busy}>
            Link Arena log folder
          </button>
        )}
        {needsReauth && (
          <button type="button" className="btn btn-ghost btn-small" onClick={doReauth} disabled={busy}>
            Re-authorize
          </button>
        )}
      </div>
      <div
        className={`collection-drop-zone${dragOver ? " drag-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        or drop Player.log here
        <input
          ref={fileInputRef}
          type="file"
          className="collection-file-input"
          onChange={onFilePick}
          aria-label="Pick Player.log file"
          style={{ display: "none" }}
        />
      </div>
      {status && <div className="collection-sync-status">{status}</div>}
    </div>
  );
}
