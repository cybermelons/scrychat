/**
 * Arena collection sync: File System Access API helpers to link an Arena
 * Player.log folder, persist the directory handle across sessions (via
 * IndexedDB — handles aren't structured-cloneable into localStorage), and
 * POST the log text to /api/collection. Self-contained, no deps.
 */

const DB_NAME = "scrychat-arena";
const STORE_NAME = "handles";
const HANDLE_KEY = "logDir";

export function fsApiSupported(): boolean {
  return "showDirectoryPicker" in window;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("indexedDB open failed"));
  });
}

async function idbGet<T>(key: string): Promise<T | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error ?? new Error("indexedDB get failed"));
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("indexedDB put failed"));
  });
}

export async function loadStoredHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY);
  } catch {
    return null;
  }
}

export async function linkArenaFolder(): Promise<FileSystemDirectoryHandle | null> {
  if (!fsApiSupported()) return null;
  try {
    // showDirectoryPicker is not in the default lib.dom types in all TS
    // configs; cast via unknown to avoid depending on extra lib entries.
    const picker = (window as unknown as {
      showDirectoryPicker: (opts?: { mode?: "read" | "readwrite" }) => Promise<FileSystemDirectoryHandle>;
    }).showDirectoryPicker;
    const handle = await picker({ mode: "read" });
    await idbSet(HANDLE_KEY, handle);
    return handle;
  } catch {
    return null;
  }
}

type Permissioned = FileSystemDirectoryHandle & {
  queryPermission?: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
  requestPermission?: (opts: { mode: "read" | "readwrite" }) => Promise<PermissionState>;
};

export async function requestFolderPermission(handle: FileSystemDirectoryHandle): Promise<boolean> {
  const h = handle as Permissioned;
  try {
    const state = await h.requestPermission?.({ mode: "read" });
    return state === "granted";
  } catch {
    return false;
  }
}

export type SyncResult =
  | { status: "imported"; stats: unknown }
  | { status: "up-to-date" }
  | { status: "no-log" }
  | { status: "denied" }
  | { status: "error"; message: string };

export async function syncFromHandle(
  handle: FileSystemDirectoryHandle,
  lastImportedAt: string | null
): Promise<SyncResult> {
  try {
    const h = handle as Permissioned;
    let perm = (await h.queryPermission?.({ mode: "read" })) ?? "granted";
    if (perm !== "granted") {
      perm = (await h.requestPermission?.({ mode: "read" })) ?? "denied";
    }
    if (perm !== "granted") return { status: "denied" };

    let fileHandle: FileSystemFileHandle;
    try {
      fileHandle = await handle.getFileHandle("Player.log");
    } catch (err) {
      if (err instanceof DOMException && err.name === "NotFoundError") {
        return { status: "no-log" };
      }
      throw err;
    }

    const file = await fileHandle.getFile();
    if (lastImportedAt && file.lastModified <= Date.parse(lastImportedAt)) {
      return { status: "up-to-date" };
    }

    const text = await file.text();
    const stats = await postLogText(text);
    return { status: "imported", stats };
  } catch (err) {
    return { status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}

export async function postLogText(text: string): Promise<unknown> {
  const res = await fetch("/api/collection", {
    method: "POST",
    headers: { "Content-Type": "text/plain" },
    body: text,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return body.stats ?? body;
}
