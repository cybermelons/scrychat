# Phase 1 gate results — 2026-07-06

## Tier A (mechanical): 9/9 PASSED
`node evals/run-tier-a.mjs` — all assertions green after two fixes:
- A3: search_tags now ranks matches by member count within tiers (spot-removal/multi-removal surface in top 10)
- A9: harness-side fix (missing .error checks + Scryfall 429 retry/backoff in the harness)

## Tier B (behavioral, judged headless `claude -p` transcripts): 5/5 PASSED
Transcripts in `evals/transcripts/` (gitignored; regenerate with the commands in git history).

- **B1 Kodama payoffs** — PASS. get_card → 8× search_tags → otag:/oracle-text searches (id<=g), 4 named functional pillars with members; oracle-text fallback used where tag coverage thin.
- **B2 token doublers <$5** — PASS. Canonical `otag:token-doubler usd<5 prefer:usd-low` + oracle-text sweeps; truthfully reported no persistent doubler under $5, complete one-shot/conditional list instead.
- **B3 Doubling Season alternatives (Selesnya, <$60)** — PASS. find_alternatives; split into token-doubling vs counter-doubling roles; all results identity/budget-legal; counter-doubler slug verified present in tag index.
- **B4 Hullbreaker Horror lines** — PASS. find_combos; pieces → produced effect, grouped by identity; matches Spellbook data.
- **B5 $150 Isshin build** — PASS. Two sessions (10-min cap split). Quotas all green (37 lands / 12 ramp / 10 draw / 11 interaction / 3 wipes), legal 100 (`decks/isshin-budget.json`), ~$100 total, budget swaps via find_alternatives.

## Known nits (non-blocking, queued)
1. deckReport quotaCheck counts only the literal role `interaction` — should aggregate synonyms (removal, counterspell) into the interaction bucket. Sessions work around it; fix in Phase 2/3.
2. Tag-index filter leaks `supercycle-*` meta slugs (one known: supercycle-legendary-land).
3. Headless eval sessions require `env -u ANTHROPIC_API_KEY` (stale key in env shadows Max-subscription auth).

## Phase 3 gate — 2026-07-07

Re-ran the full gate on the local-first stack (`data/scrychat.db`, ingested via
`pnpm --filter @scrychat/core ingest`: 34,213 cards / 4,492 tags / 216,706
card_tags / 97,520 combos).

**Build + unit tests:** `pnpm -r build` clean; `pnpm --filter @scrychat/core test` — 55/55 passed across 12 files (added `test/ingest-cards.test.ts`, 2 tests, for the price-wipe fix below).

**Tier A: 9/9 PASSED** — `get_card` / `search_tags` / `find_alternatives` / `find_combos` now served from the local DB; `search_cards` still live, per design.

**Timing (JSON-RPC over stdio to the built MCP server, repo cwd, warm-cache):**
- `find_alternatives` (Doubling Season): median 2.2ms over 5 runs (2.0-2.6ms range).
- `deck_get` (Isshin Budget, 100 cards incl. commander): median 2.2ms over 5 runs after a one-time ~16ms first-call warm-up.
- `pnpm --filter @scrychat/core ingest` (full `--all`, cold cache): downloads + parses oracle-cards, default-cards, oracle-tags, and Spellbook variants in well under the ~2 min budget noted in README.

**Phase-1 nits status:**
1. Interaction quota bucket — FIXED. `packages/core/src/decks.ts` `INTERACTION_ROLES = new Set(["interaction", "removal", "counterspell"])` aggregates synonyms into the interaction bucket.
2. Supercycle leak — FIXED. `packages/core/src/ingest/tagger.ts` explicitly filters `supercycle-*` (in addition to `cycle-*`) to `is_functional = 0` at ingest time, so it's excluded from the DB-backed tag index.
3. `ANTHROPIC_API_KEY` gotcha — documented in README.md ("Requirements" section): unset it before running the web app, since a stale key overrides Max-subscription auth.

**Cards-ingest price-wipe fix:** `packages/core/src/ingest/cards.ts` re-inserting cards (via `--cards` or `--all`) was nulling `price_usd` on every existing row (the `ON CONFLICT` clause unconditionally set `price_usd=excluded.price_usd`, and the insert payload hard-codes `price_usd: null` since prices come from a separate `--prices` pass). Fixed by dropping `price_usd` from the `ON CONFLICT ... DO UPDATE SET` clause entirely, so a re-run of cards ingest leaves any existing price untouched; new rows still insert with `price_usd = NULL` until `--prices` runs. One-transaction-per-row semantics unchanged.

## Tier C gate — 2026-07-05

New `evals/run-tier-c.mjs` (issue #7): mechanical curl-style checks against the built web
server (`apps/web/dist/server.js`), which the script starts itself on a random free port
with `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` stripped from its env. No LLM calls in the
default run.

**One-line server fix required first:** `apps/web/src/server.ts` hardcoded `const PORT = 8787`
with no env override, which blocks a self-contained eval from picking a free port. Changed to
`const PORT = Number(process.env.PORT) || 8787;` — the only change made in `apps/`.

**Default run (`node evals/run-tier-c.mjs`): 9/9 PASSED**
```
OK: C1 status=200 commander="Trostani, Selesnya's Voice" commanderIdentity=["G","W"]
OK: C2 status=200 added=["Sol Ring"] rejected=[{"name":"Lightning Bolt","reason":"Color identity [R] is not within commander identity [GW]"}]
OK: C3 status=200 image=https://cards.scryfall.io/normal/front/9/1/91fdb56b-54d5-4272-8319-505ff987fe9b.jpg?1782682494 manaCost={1} tags=["ramp","combo piece"] byTag={"ramp":1,"combo piece":1} untaggedForQuota=0
OK: C4 patchStatus=200 tags=["ramp","artifact synergy"]
OK: C5 patchStatus=200 tags=["ramp","artifacts"]
OK: C6 delStatus=200 stillHasSolRing=false
OK: C7 delStatus=200 delBody={"ok":true} getStatus=404
OK: C8 traversalStatus=400 badIdStatus=400 (want both 400, never 500/200)
OK: C9 sawDeckNameInSseData=true lines=["data: {\"name\":\"tmp-tier-c-sse-...\"}"]
SKIP: C10/C11/C12 (LLM-dependent; run with --with-chat)

TIER C: 9/9 PASSED
```

**`--with-chat` run (LLM-dependent, may be flaky; judged by substring match): 12/12 PASSED**
in a smoke-test — activeDeck context relay, action-log awareness, and chat resume all
correctly reflected deck state and prior turns.

No leftover `tmp-tier-c-*` artifacts in `decks/` after either run (script deletes via API in
each check plus a filesystem sweep in `finally`).

## Tier B (formatting contracts) — 2026-07-11

`env -u ANTHROPIC_API_KEY -u ANTHROPIC_AUTH_TOKEN node evals/run-tier-b.mjs` — **6/6 PASSED** (live subscription chat, self-started server, API-cleaned artifacts):
B-fmt-1 fenced decklist verbatim (no card-refs in fences) · B-fmt-2 table name cells all linked · B-fmt-3 category chips populated server-side · B-fmt-4 embed rubric (1 focal embed / 0 list embeds) · B-fmt-5 mtga export front-face-only DFC names · B-fmt-6 Arena claims tool-grounded (get_card before answer).
