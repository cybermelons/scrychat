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

B-fmt-7 (added for #47) every `[[Card]]` / `![[Card]]` / `[[group:..|..]]` claim in the reply must trace to a card name a tool call actually fetched (inputs per a card-field allowlist, plus names in search/alternatives/combos/deck results; deck names never count), and the reply must make >=1 claim. Uses `checkGrounding` from `apps/web/dist/grounding-core.js`. Tier B total is now 7 checks.

### Tier B run 2026-10-11 - **5/7 PASSED** (first run of B-fmt-7)

```
FAIL: B-fmt-3 populatedChips=0 sample=null
FAIL: B-fmt-7 claims=5 grounded=3 ungrounded=["Cabal Coffers","Black Market Connections"]
            fetched=14 persistedToolCalls=3 sseToolUses=3 truncatedResults=1
```

**B-fmt-7 is not yet a verdict.** `truncatedResults=1` is the ambiguity the check's own header warns about: the server cuts every tool result at `TOOL_RESULT_MAX_CHARS = 2048` (`apps/web/src/server.ts`), so a card the model legitimately saw can be sliced out of the recorded result and then read as ungrounded. With 14 names fetched and one result truncated, these two cannot be called hallucinations on this evidence.

~~Raising the cap is NOT a one-line change: 2048 appears as a bare literal in nine places...~~ **This paragraph was wrong and is corrected below (#66, 2026-10-11).** A static count found 2048 in **12** places, of which **one** is the declaration, three are test assertions and **eight are comment prose**. No validator read a second literal, so there was no duplicated-constant bug to fix.

The real defect, found while checking that claim: the per-field caps (title 40, text 320, html 1600) are all satisfiable by a payload that still overflows, because the cap applies to the whole serialized result and nothing measured it. Measured with only reachable values, `deck_present` runs 1871 chars in the realistic case (177 spare) and **2223 — over — with all five quotas OFF, a full curve and a long pending line**, while the html slide sits at 1117 of its own 1600 cap in every case. Overflow was silent: truncated JSON, `parseSlideSpec` returns null with only a `console.debug`, slide strip degrades to a plain chip. Fixed in `a8c3aa9` (exported cap, mirrored as `TOOL_RESULT_BUDGET_CHARS` in `packages/mcp/src/present-budget.ts`, `fitPresentSlides` at the return site, 9 new tests).

That fix covers only `deck_present`. `truncateResult` still runs at one chokepoint (`server.ts:661`) across every allowlisted tool, so B-fmt-7's ambiguity is unchanged and is now tracked as **#70**.

~~**B-fmt-3 regressed** (`populatedChips=0`) - it passed in the 6/6 run above.~~ **Not a regression (#67, resolved 2026-10-11).** No code changed between the two runs in a way that affects this; the *data* did. The category-chip populator resolves members from the local SQLite mirror via `categoryTagMembersLocal`, and `getLocalDb()` returns **null for a mirror with zero `cards` rows** — deliberately, since "absent" and "present but empty" both mean "fall back to live Scryfall" for its normal callers. This host's mirror is schema-only: `data/scrychat.db` exists (120 KB, created 2026-10-09) with `cards=0`, `tags=0`, `card_tags=0` and an empty `meta`, i.e. an `openDb()` call wrote the schema and no ingest ever ran. Live `/api/health` confirms `{exists: true, cardCount: 0, usableAsMirror: false}`.

So zero chips was the *correct* output, and the check was reporting FAIL for a missing precondition. B-fmt-3 now asks `/api/health` first and **SKIPs** with that diagnosis when `usableAsMirror` is false, naming the ingest as the remedy. A skip is not counted as passed and still exits nonzero — it changes the diagnosis printed, never the verdict.

### Tier B run 2026-10-11 (second) — **5/7 PASSED, 1 SKIPPED (B-fmt-3), 1 FAILED (B-fmt-7)**, exit 1

```
SKIP: B-fmt-3 no populated local mirror: exists=true cardCount=0 usableAsMirror=false.
      The category-chip populator has no corpus to resolve members from, so zero
      chips is correct. Run the card + tagger ingest to enable this check.
FAIL: B-fmt-7 claims=5 grounded=2 ungrounded=["Black Market Connections","Cabal Coffers","Phyrexian Tower"]
      fetched=16 persistedToolCalls=3 sseToolUses=3 truncatedResults=1
```

B-fmt-7 remains the one real failure, tracked as #70. To restore B-fmt-3 to a running check on this host, run the card + tagger ingest (prior history shows a full ingest produced 217k `card_tags` rows).

### Tier B run 2026-10-11 (third, after #70) — **6/7 PASSED, 1 SKIPPED (B-fmt-3)**, exit 1

```
OK:   B-fmt-7 claims=6 grounded=6 ungrounded=[] fetched=33
      persistedToolCalls=3 sseToolUses=3 truncatedResults=0
SKIP: B-fmt-3 no populated local mirror: exists=true cardCount=0 usableAsMirror=false.
```

**B-fmt-7 passes for the first time, and the earlier ungrounded names were not
hallucinations.** `fetched` went 16 → 33 and `truncatedResults` 1 → 0 with no
change to the model, the prompt or the check's logic — only to what the server
stores.

The diagnosis in the two runs above was right that truncation was the cause and
wrong about what the cap was *for*. `TOOL_RESULT_MAX_CHARS` arrived in `a4420e4`
("Rich chat rendering") alongside the tool chip and its hover popover: it is a
**display** bound, sized to keep a blob out of `data-result` and the `<pre>`
popover. It was never a model-context bound — the loop in `server.ts` is a
read-only observer of the Agent SDK stream, and the model has already received
the full result by the time that code runs — and never a storage bound either
(all of `chats/` is 33 KB across 8 chats and 10 tool results).

Applying a display bound at capture time is what broke two unrelated consumers.
Measured on the real `grothama-fight-draw` deck:

```
deck_get full result      5458 chars → 76 names, valid JSON
sliced at 2048            2049 chars → 29 names, INVALID JSON  (62% of the deck lost)
```

All 7 truncated results on disk are `deck_get`, every one cut mid-name
(`...,{"name":"Ete…`). So `parseSlideSpec`/`parseChartSpec` silently returned
null, and the grounding check could not see the back two thirds of any deck.

**A record-boundary truncator was tried first and rejected on measurement**, not
on argument: dropping whole trailing records keeps the JSON valid but preserved
**28** names where the raw slice preserved **29** — the `__omitted` key and the
closing braces for each emptied tag cost exactly the bytes the slice spent on
names. B-fmt-7 would still have failed. Reshaping `deck_get` does not help
either: `byTag` 5412 chars, a flat list 4421, bare names 1348 — only a shape
that discards tags and counts fits under 2048, and the deck panel needs them.
A 75-card deck and a 2048-char cap are incompatible.

Fix: the cap moved to where it belongs. Results are stored and streamed whole;
the cap applies in `ChatPanel.tsx` when rendering the popover and the
`data-result` attribute, where dropping the tail costs nothing a human needs.
`truncatedResults` stays in `grounding-core.ts` because `chats/` still holds
records cut by the old build.

Exit is still 1, correctly: B-fmt-3 skips for want of a populated mirror. To
turn it back into a running check on this host, run the card + tagger ingest.
