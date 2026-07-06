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
