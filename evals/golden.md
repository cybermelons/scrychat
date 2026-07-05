# scrychat golden eval set

Phase-gate acceptance. Tier A is asserted by script (`evals/run-tier-a.ts`, written in WU6)
calling MCP tools directly. Tier B is judged from a fresh Claude Code chat transcript in this repo.

## Tier A — mechanical (must be 100% green)

| # | Tool call | Assert |
|---|-----------|--------|
| A1 | `search_cards({query:"otag:token-doubler legal:commander"})` | total ≈ 15; includes Doubling Season, Parallel Lives, Mondrak, Anointed Procession, Adrix and Nev, Twincasters |
| A2 | `search_cards({query:"otag:sacrifice-outlet id<=bg usd<3 legal:commander"})` | total > 400; every result identity ⊆ {B,G} |
| A3 | `search_tags({query:"removal"})` | returns ≥ 5 slugs with descriptions + member counts; includes a spot-removal and a mass-removal slug |
| A4 | `get_card({name:"kodama east tree"})` | fuzzy-resolves to Kodama of the East Tree; identity = G |
| A5 | `find_alternatives({card:"Doubling Season", color_identity_within:"gw", max_price:20})` | includes Anointed Procession and Parallel Lives; excludes Doubling Season itself; results grouped with role labels |
| A6 | `find_combos({cards:["Hullbreaker Horror"]})` | non-empty; each combo lists pieces and a produces feature; status OK only |
| A7 | `deck_create` → `deck_add({cards:[{name:"Lightning Bolt"}]})` on a Selesnya commander | add REJECTED (off-identity) with a clear reason |
| A8 | `deck_add` same card name twice (non-basic) | second add rejected (singleton) |
| A9 | `deck_get` on a seeded 100-card deck | quota report present: lands/ramp/draw/interaction/wipes counts + curve |

## Tier B — behavioral (judged transcript per rubric)

**B1 — "What are the payoffs and synergies for Kodama of the East Tree?"**
Rubric: uses get_card then tag/otag searches (not memory-only); names functional categories (e.g. landfall, token generation, free permanents) with multiple member cards each.

**B2 — "Find all token doublers legal in Commander under $5."**
Rubric: single correct search with price filter; presents the complete qualifying list, not 3 examples; mentions cheapest-printing caveat or uses prefer:usd-low.

**B3 — "Suggest alternatives to Doubling Season for a Selesnya deck under $20."**
Rubric: identifies Doubling Season's distinct roles (token doubling vs counter doubling); groups alternatives by role; everything Selesnya-legal and under budget.

**B4 — "What combo lines use Hullbreaker Horror?"**
Rubric: uses find_combos; presents pieces → produced effect; filters to deck-relevant identity if a deck is in context.

**B5 — "Build me a $150 budget deck around Isshin, Two Heavens as One."**
Rubric: follows skeleton quotas (~36–38 lands, 10–12 ramp, 10–12 draw, 8–10 interaction, 2–4 wipes); uses search_tags before slugs (expect extra-combat-phase); saves via deck tools; final deck_get shows legal 100, no identity violations, quota checkmarks; total price ≤ $150.

**Universal rubric items (every B eval):**
- Never invents a tag slug (every slug used appears in functional-tags.md or a search_tags result).
- Reasons in functional roles, then enumerates from the database — no memory-only card lists.
- Every search constrained by `legal:commander` and, when a deck is in context, its color identity.

## Failure routing
Tool data wrong → code (reopen WU). Model behavior wrong → SKILL.md edit, re-run. Impossible with current tools → escalate.
