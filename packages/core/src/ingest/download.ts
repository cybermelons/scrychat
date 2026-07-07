import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { REPO_ROOT } from "../db/connection.js";

const USER_AGENT = "scrychat/0.1";
const BULK_DATA_URL = "https://api.scryfall.com/bulk-data";
const DOWNLOADS_DIR = path.join(REPO_ROOT, "data", "downloads");

export type BulkType = "oracle_cards" | "default_cards";

interface BulkDataEntry {
  type: string;
  updated_at: string;
  download_uri: string;
  size: number;
}

interface BulkDataResponse {
  data: BulkDataEntry[];
}

async function fetchBulkDataIndex(): Promise<BulkDataEntry[]> {
  const res = await fetch(BULK_DATA_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`bulk-data index fetch failed: ${res.status} ${res.statusText}`);
  }
  const body = (await res.json()) as BulkDataResponse;
  return body.data;
}

function stampPath(type: BulkType): string {
  return path.join(DOWNLOADS_DIR, `${type}.updated_at`);
}

function filePath(type: BulkType): string {
  return path.join(DOWNLOADS_DIR, `${type}.json`);
}

export interface DownloadResult {
  path: string;
  updatedAt: string;
  skipped: boolean;
}

/**
 * Downloads the given bulk data type to data/downloads/<type>.json, skipping
 * the download when the previously recorded updated_at stamp matches
 * Scryfall's current one for that type.
 */
export async function downloadBulk(type: BulkType): Promise<DownloadResult> {
  const entries = await fetchBulkDataIndex();
  const entry = entries.find((e) => e.type === type);
  if (!entry) {
    throw new Error(`bulk-data type not found: ${type}`);
  }

  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

  const stamp = stampPath(type);
  const dest = filePath(type);
  const previousStamp = fs.existsSync(stamp) ? fs.readFileSync(stamp, "utf8").trim() : null;

  if (previousStamp === entry.updated_at && fs.existsSync(dest)) {
    return { path: dest, updatedAt: entry.updated_at, skipped: true };
  }

  const res = await fetch(entry.download_uri, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!res.ok || !res.body) {
    throw new Error(`bulk file download failed: ${res.status} ${res.statusText}`);
  }

  const tmpDest = `${dest}.part`;
  await pipeline(Readable.fromWeb(res.body as never), fs.createWriteStream(tmpDest));
  fs.renameSync(tmpDest, dest);
  fs.writeFileSync(stamp, entry.updated_at);

  return { path: dest, updatedAt: entry.updated_at, skipped: false };
}
