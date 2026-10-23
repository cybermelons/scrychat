import fs from "node:fs";
import path from "node:path";

/**
 * Lowercased email limited to [a-z0-9@._-]; null if it is not usable as a
 * directory name. Used as the directory name under users/, so it must never
 * be "." / ".." / hidden or contain a separator.
 */
export function userIdFromEmail(email: unknown): string | null {
  if (typeof email !== "string") return null;
  const id = email.trim().toLowerCase();
  if (id.length === 0 || id.length > 254) return null;
  if (!/^[a-z0-9@._-]+$/.test(id)) return null;
  if (id.startsWith(".")) return null;
  return id;
}

export interface UserPaths {
  root: string;
  decks: string;
  chats: string;
  suggestions: string;
  collection: string;
  config: string;
}

/** Per-user storage paths. Throws on an id that is not a safe single path segment. */
export function userPaths(usersDir: string, userId: string): UserPaths {
  if (userIdFromEmail(userId) !== userId) throw new Error("invalid user id");
  const root = path.join(usersDir, userId);
  return {
    root,
    decks: path.join(root, "decks"),
    chats: path.join(root, "chats"),
    suggestions: path.join(root, "suggestions"),
    collection: path.join(root, "collection.json"),
    config: path.join(root, "scrychat.config.json"),
  };
}

/**
 * A chat id resolves only under the caller's chats dir. Ids of other users
 * simply do not exist there (404), no ownership table needed.
 */
export function chatFileFor(chatsDir: string, id: string): string {
  if (!/^[a-z0-9][a-z0-9-]*$/.test(id) || id.length > 128) throw new Error("invalid chat id");
  return path.join(chatsDir, `${id}.json`);
}

/**
 * /api/deck-events watches users/ once, recursively. `relPath` is the watcher's
 * filename relative to users/. Returns the deck name only when the file is a
 * deck file in THIS user's decks dir; anything else (other users, chats,
 * temp files) is null.
 */
export function deckEventFor(userId: string, relPath: string | null | undefined): string | null {
  if (!relPath) return null;
  const parts = relPath.split(path.sep);
  if (parts.length !== 3 || parts[0] !== userId || parts[1] !== "decks") return null;
  const file = parts[2];
  if (!file.endsWith(".json") || file.startsWith(".tmp-")) return null;
  return file.replace(/\.json$/, "");
}

const LEGACY_ITEMS = ["decks", "chats", "suggestions", "collection.json", "scrychat.config.json"] as const;

/**
 * One-time move of the pre-multi-user data into users/<owner>. Runs only when
 * the owner dir is absent and legacy decks/ exists. It COPIES (bind mounts are
 * different filesystems, so rename would fail with EXDEV, and nothing is
 * deleted before the copy is verified by the owner), into a temp dir that is
 * renamed into place last so a crash never leaves a half-migrated owner dir.
 * Returns the copied item names, or null when it did not run.
 */
export function migrateLegacy(legacyRoot: string, usersDir: string, ownerId: string): string[] | null {
  const dest = userPaths(usersDir, ownerId).root;
  if (fs.existsSync(dest)) return null;
  if (!fs.existsSync(path.join(legacyRoot, "decks"))) return null;
  fs.mkdirSync(usersDir, { recursive: true });
  const tmp = path.join(usersDir, `.migrating-${ownerId}-${process.pid}`);
  fs.rmSync(tmp, { recursive: true, force: true });
  fs.mkdirSync(tmp);
  const copied: string[] = [];
  for (const item of LEGACY_ITEMS) {
    const src = path.join(legacyRoot, item);
    if (!fs.existsSync(src)) continue;
    fs.cpSync(src, path.join(tmp, item), { recursive: true });
    copied.push(item);
  }
  fs.renameSync(tmp, dest);
  return copied;
}
