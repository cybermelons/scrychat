/**
 * Pure, testable helper for the group-chip population post-pass (issues
 * #20/#21). The model emits `[[group:LABEL|Name A; Name B]]` chips for
 * category suggestions but shouldn't be trusted to hand-list every member —
 * this deterministically completes/repairs those chips from a resolver
 * (backed by the local SQLite mirror in server.ts), respecting active-deck
 * color identity and a member cap. No fs/network here — the resolver is
 * injected, so this stays a plain string transform.
 */

export type CategoryResolver = (
  phrase: string,
) => { slug: string; label: string; members: string[] } | null;

const CHIP_RE = /\[\[group:([^|\]]+)\|([^\]]+)\]\]/g;
const MEMBERLESS_CHIP_RE = /\[\[group:([^|\]]+)\]\]/g;

function dedupeCaseInsensitive(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const name of names) {
    const trimmed = name.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
}

/**
 * Populates/completes `[[group:LABEL|members]]` chips in `text` using
 * `resolve`. For each well-formed chip: resolve(LABEL). Null resolution
 * leaves the chip unchanged (fail-open). Otherwise, model-listed members are
 * kept verbatim (in order, trimmed, case-insensitively deduped) and resolver
 * members not already present are appended (case-insensitive dedup) up to
 * `cap` total members. A chip already at/above `cap` members is left as-is.
 *
 * Also repairs malformed member-less chips `[[group:LABEL]]` (no pipe — the
 * renderer shows these as literal text): if the resolver returns >=1 member,
 * rewrite into a populated chip (capped); otherwise leave unchanged.
 *
 * Never touches text outside chips, never produces a 0-member chip. Running
 * this twice on its own output is stable (won't grow past cap or reorder),
 * since already-complete chips (member-derived from a prior pass) fail
 * `count < cap` and are left alone.
 */
export function populateGroupChipsInText(text: string, resolve: CategoryResolver, cap = 10): string {
  let out = text.replace(CHIP_RE, (whole, label: string, membersRaw: string) => {
    const lbl = label.trim();
    const modelMembers = dedupeCaseInsensitive(membersRaw.split(";"));
    if (modelMembers.length >= cap) return whole;

    const resolved = resolve(lbl);
    if (!resolved) return whole;

    const seen = new Set(modelMembers.map((m) => m.toLowerCase()));
    const merged = [...modelMembers];
    for (const m of resolved.members) {
      if (merged.length >= cap) break;
      const trimmed = m.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(trimmed);
    }

    if (merged.length === 0) return whole;
    return `[[group:${lbl}|${merged.join("; ")}]]`;
  });

  out = out.replace(MEMBERLESS_CHIP_RE, (whole, label: string) => {
    const lbl = label.trim();
    const resolved = resolve(lbl);
    if (!resolved || resolved.members.length === 0) return whole;
    const capped = resolved.members.slice(0, cap);
    return `[[group:${lbl}|${capped.join("; ")}]]`;
  });

  return out;
}

// ---- deterministic category-phrase detection (issue #20) ----
// The model often answers from memory without loading the skill, so
// prompt-driven chip emission alone is unreliable. This pass detects a
// curated set of category phrases in plain prose and replaces them with
// populated chips. Conservative by construction: multi-word phrases only
// (never bare "ramp"/"removal" — too false-positive-prone), first occurrence
// per rule, capped chips per call, and existing chips/refs/code/tables are
// never touched.

export interface CategoryPhraseRule {
  /** Case-insensitive whole-word phrase matcher (optional plural). */
  pattern: RegExp;
  /** Phrase passed to the resolver — a verified tag slug/label/alias. */
  resolveAs: string;
}

/**
 * Curated multi-word category phrases -> resolver phrases. Every resolveAs
 * value is verified to resolve against data/scrychat.db (rank<=1 tag match):
 * "board wipe" and "card draw" do NOT resolve as raw tags, hence their
 * remaps to "sweeper" / "draw engine".
 */
export const CATEGORY_PHRASE_RULES: CategoryPhraseRule[] = [
  { pattern: /\btoken doublers?\b/i, resolveAs: "token doubler" },
  { pattern: /\bsac(?:rifice)? outlets?\b/i, resolveAs: "sacrifice outlet" },
  { pattern: /\bboard wipes?\b/i, resolveAs: "sweeper" },
  { pattern: /\bmass removal\b/i, resolveAs: "sweeper" },
  { pattern: /\bspot removal\b/i, resolveAs: "spot removal" },
  { pattern: /\bgraveyard hate\b/i, resolveAs: "graveyard hate" },
  { pattern: /\bcard draw\b/i, resolveAs: "draw engine" },
  { pattern: /\bmana ramp\b/i, resolveAs: "ramp" },
];

/**
 * Character spans of `text` a detection replacement must never overlap:
 * existing `[[...]]` / `![[...]]` spans (chips and card refs), code-fence
 * lines (fence markers included), and markdown table rows (lines starting
 * with `|`).
 */
function detectionProtectedSpans(text: string): { start: number; end: number }[] {
  const spans: { start: number; end: number }[] = [];
  for (const m of text.matchAll(/!?\[\[[^\]]*\]\]/g)) {
    spans.push({ start: m.index!, end: m.index! + m[0].length });
  }
  let offset = 0;
  let inFence = false;
  for (const line of text.split("\n")) {
    const end = offset + line.length;
    const trimmed = line.trimStart();
    if (trimmed.startsWith("```")) {
      spans.push({ start: offset, end });
      inFence = !inFence;
    } else if (inFence) {
      spans.push({ start: offset, end });
    } else if (trimmed.startsWith("|")) {
      spans.push({ start: offset, end });
    }
    offset = end + 1; // +1 for the "\n"
  }
  return spans;
}

/**
 * Detects curated category phrases in prose and replaces the FIRST eligible
 * occurrence per rule with a populated `[[group:<phrase lowercased>|...]]`
 * chip (members from resolve(rule.resolveAs), capped at opts.cap ?? 10). A
 * rule is skipped when: an existing `[[group:...]]` chip's label matches the
 * rule's pattern or equals its resolveAs phrase (case-insensitive — this is
 * what makes the pass idempotent: a first-run chip's label matches its own
 * rule on the second run); no match lands outside protected spans (existing
 * chips/refs, code fences, table rows); or the resolver returns null / fewer
 * than 2 members. At most opts.maxChips ?? 5 replacements per call; each
 * rule recomputes protected spans so later rules respect earlier insertions.
 */
export function detectCategoryChipsInText(
  text: string,
  resolve: CategoryResolver,
  opts: { cap?: number; maxChips?: number } = {},
): string {
  const cap = opts.cap ?? 10;
  const maxChips = opts.maxChips ?? 5;
  let out = text;
  let inserted = 0;

  for (const rule of CATEGORY_PHRASE_RULES) {
    if (inserted >= maxChips) break;

    // Skip when an existing chip already covers this category: label matches
    // the rule's pattern (covers "equals the matched phrase", singular or
    // plural) or equals the resolveAs phrase.
    const existingLabels = [...out.matchAll(/\[\[group:([^|\]]+)/g)].map((m) => m[1].trim());
    const labelRe = new RegExp(rule.pattern.source, "i");
    if (
      existingLabels.some(
        (lbl) => labelRe.test(lbl) || lbl.toLowerCase() === rule.resolveAs.toLowerCase(),
      )
    ) {
      continue;
    }

    const spans = detectionProtectedSpans(out);
    const matchRe = new RegExp(rule.pattern.source, "gi");
    let target: { start: number; end: number; phrase: string } | null = null;
    for (const m of out.matchAll(matchRe)) {
      const start = m.index!;
      const end = start + m[0].length;
      if (spans.some((s) => start < s.end && end > s.start)) continue;
      target = { start, end, phrase: m[0] };
      break;
    }
    if (!target) continue;

    const resolved = resolve(rule.resolveAs);
    if (!resolved || resolved.members.length < 2) continue;

    const label = target.phrase.toLowerCase();
    const members = resolved.members.slice(0, cap);
    out = `${out.slice(0, target.start)}[[group:${label}|${members.join("; ")}]]${out.slice(target.end)}`;
    inserted++;
  }

  return out;
}
