import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Database = require("better-sqlite3") as typeof import("better-sqlite3");
type DbInstance = InstanceType<typeof Database>;

/**
 * Resolve the monorepo root by walking up from this file's location until a
 * pnpm-workspace.yaml is found. Deliberately does NOT depend on process.cwd()
 * so callers (tests, scripts run from any directory) get a stable path.
 */
function findRepoRoot(startDir: string): string {
  let dir = startDir;
  for (;;) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) {
      throw new Error(`Could not locate repo root (pnpm-workspace.yaml) above ${startDir}`);
    }
    dir = parent;
  }
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = findRepoRoot(HERE);
const DATA_DIR = path.join(REPO_ROOT, "data");
const DB_PATH = path.join(DATA_DIR, "scrychat.db");
const SCHEMA_PATH = path.join(HERE, "schema.sql");

export interface OpenDbOptions {
  /** Override the db file path (used by tests to point at a temp file). */
  path?: string;
}

export function openDb(options: OpenDbOptions = {}): DbInstance {
  const dbPath = options.path ?? DB_PATH;
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");

  const schema = fs.readFileSync(SCHEMA_PATH, "utf8");
  db.exec(schema);

  return db;
}

export function getMeta(db: DbInstance, key: string): string | undefined {
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setMeta(db: DbInstance, key: string, value: string): void {
  db.prepare(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
  ).run(key, value);
}

export { REPO_ROOT, DATA_DIR, DB_PATH };
