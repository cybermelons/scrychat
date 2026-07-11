/**
 * Parser for MTGA's Player.log (detailed logs enabled). Extracts the
 * player's owned-card collection ("PlayerCardsV3" / "InventoryInfo" blob)
 * as a map of arena card id (string) -> owned count.
 *
 * The log is a stream of Unity log lines; the collection payload appears
 * as one or more JSON blobs following a recognizable marker line, e.g.:
 *
 *   [UnityCrossThreadLogger]<== PlayerInventory.GetPlayerCardsV3(123)
 *   {"id":123,"payload":{"66091":4,"66093":2}}
 *
 * or on a single line, or under newer "InventoryInfo" event names. The
 * file can contain many such blobs across a play session (re-syncs,
 * partial updates); only the LAST valid one represents the current
 * collection state, so we scan the whole file and keep the newest match.
 */

const MARKERS = ["GetPlayerCardsV3", "InventoryInfo"];

/**
 * From `text`, starting at index `braceStart` (which must point at a `{`),
 * find the matching closing `}` accounting for nested braces and JSON
 * string/escape syntax. Returns the substring (inclusive) or null if no
 * balanced match is found before the text ends.
 */
function extractBalancedJson(text: string, braceStart: number): string | null {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = braceStart; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "{") {
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) {
        return text.slice(braceStart, i + 1);
      }
    }
  }

  return null;
}

/**
 * Recursively search `obj` (depth <= maxDepth) for the largest sub-object
 * where every key matches /^\d+$/ and every value is a non-negative
 * integer, with >= 5 entries. Checks the object itself, its `payload` /
 * `Cards` fields, and nested objects.
 */
function findCollectionBlob(obj: unknown, maxDepth = 3): Record<string, number> | null {
  let best: Record<string, number> | null = null;

  function isCollectionMap(candidate: unknown): candidate is Record<string, number> {
    if (candidate == null || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    const entries = Object.entries(candidate as Record<string, unknown>);
    if (entries.length < 5) return false;
    for (const [key, value] of entries) {
      if (!/^\d+$/.test(key)) return false;
      if (typeof value !== "number" || !Number.isInteger(value) || value < 0) return false;
    }
    return true;
  }

  function consider(candidate: unknown): void {
    if (isCollectionMap(candidate)) {
      const size = Object.keys(candidate).length;
      if (best === null || size > Object.keys(best).length) {
        best = candidate;
      }
    }
  }

  function walk(node: unknown, depth: number): void {
    if (node == null || typeof node !== "object" || depth > maxDepth) return;

    consider(node);

    const rec = node as Record<string, unknown>;
    if ("payload" in rec) consider(rec.payload);
    if ("Cards" in rec) consider(rec.Cards);

    if (depth < maxDepth) {
      for (const value of Object.values(rec)) {
        if (value != null && typeof value === "object" && !Array.isArray(value)) {
          walk(value, depth + 1);
        }
      }
    }
  }

  walk(obj, 0);
  return best;
}

// Bound on how many `{` starts we'll retry after a marker occurrence before
// giving up on it (handles a first balanced JSON blob that parses but isn't
// a collection blob, e.g. an unrelated event sharing the marker text).
const MAX_BRACE_ATTEMPTS_PER_MARKER = 5;

/**
 * Scan `text` for every occurrence of `marker`, and for each occurrence find
 * the first JSON blob (within a bounded lookahead) that parses and yields a
 * collection blob. Returns one candidate per successful marker occurrence,
 * each tagged with its `fileIndex` (the marker's position in the file) so
 * callers can compare candidates from different markers by file position.
 */
function findCandidates(text: string, marker: string): { fileIndex: number; blob: Record<string, number> }[] {
  const candidates: { fileIndex: number; blob: Record<string, number> }[] = [];

  let searchFrom = 0;
  for (;;) {
    const markerIdx = text.indexOf(marker, searchFrom);
    if (markerIdx === -1) break;
    searchFrom = markerIdx + marker.length;

    // Find the first `{` at or after the marker, but don't scan
    // unboundedly far (cap the lookahead so unrelated later JSON in the
    // file isn't misattributed to this marker).
    const lookaheadLimit = Math.min(text.length, markerIdx + 20000);

    let braceSearchFrom = markerIdx;
    let found: Record<string, number> | null = null;
    for (let attempt = 0; attempt < MAX_BRACE_ATTEMPTS_PER_MARKER; attempt++) {
      const braceIdx = text.indexOf("{", braceSearchFrom);
      if (braceIdx === -1 || braceIdx > lookaheadLimit) break;

      const jsonText = extractBalancedJson(text, braceIdx);
      if (!jsonText) break;

      let parsed: unknown;
      try {
        parsed = JSON.parse(jsonText);
      } catch {
        // Malformed JSON at this brace; try the next `{` after it.
        braceSearchFrom = braceIdx + 1;
        continue;
      }

      const blob = findCollectionBlob(parsed);
      if (blob) {
        found = blob;
        break;
      }

      // Parsed fine but no collection blob inside; retry the next `{`.
      braceSearchFrom = braceIdx + 1;
    }

    if (found) {
      candidates.push({ fileIndex: markerIdx, blob: found });
    }
  }

  return candidates;
}

export function parseArenaLog(text: string): { cards: Record<string, number> } | null {
  const allCandidates = MARKERS.flatMap((marker) => findCandidates(text, marker));

  if (allCandidates.length === 0) return null;

  // "Newest blob wins" regardless of which marker produced it: pick the
  // candidate with the greatest file position.
  let newest = allCandidates[0]!;
  for (const candidate of allCandidates) {
    if (candidate.fileIndex > newest.fileIndex) {
      newest = candidate;
    }
  }

  return { cards: newest.blob };
}
