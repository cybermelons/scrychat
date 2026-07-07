---
name: edh-deck-builder
description: Use when building, editing, or advising on Commander/EDH decks, answering MTG card questions, finding synergies or payoffs for a card or theme, suggesting alternatives to a card, or looking for combos/win lines. Turns scrychat's Scryfall + Commander Spellbook tools into expert deckbuilding workflows.
---

# EDH Deck Builder

## Core principle

Reason in FUNCTIONAL ROLES first (token-doubler, sacrifice-outlet, ramp, tutor, sweeper, ...),
then ENUMERATE candidates from the database with `search_cards`/`search_tags`. Never answer a
card-list question from memory alone — memory suggests candidates and vocabulary, tools verify
they exist, are legal, and fit the constraints (color identity, budget, curve).

Never guess a tag slug. Before using `otag:<slug>`, either grep
`references/functional-tags.md` for the concept, or call `search_tags` to discover it. Slugs
are kebab-case and often don't match the obvious English word (e.g. board wipes are tagged
`sweeper`, not `board-wipe`; there is no `voltron` or `aristocrats` tag — those are playstyles,
not oracle-text tags, so decompose them into their component mechanics instead).

## Scryfall query recipes (`search_cards`)

`search_cards` accepts full Scryfall syntax and auto-appends `legal:commander` — don't add it
yourself.

- Function: `otag:sacrifice-outlet`
- Color identity: `id<=bg` (fits within Golgari), `id=bg` (exactly Golgari)
- Budget, cheapest printing: `usd<3 prefer:usd-low`
- Exclude a specific card: `-!"Grave Pact"`
- Type/cmc filters: `type:creature cmc<=2`, `type:land`
- Combine constraints (this is the normal shape of a real query):
  - `otag:sacrifice-outlet id<=bg usd<3`
  - `otag:sweeper id<=wbg cmc<=4`
  - `otag:land-ramp id<=g type:creature cmc<=2`
  - `otag:token-doubler id<=rw -!"Anointed Procession"`

## Workflows

**Before asking the user to disambiguate** a commander/deck reference (e.g. "which X do you
mean?"), call `deck_list` first. If a saved deck's name or commander matches the reference, call
`deck_get` on it and proceed with that deck as the subject — mention which deck you're using —
instead of asking.

**A. "What are the payoffs/synergies for card X?"**
1. `get_card` X, read oracle text, identify the mechanical themes (tokens? counters? sacrifice?
   graveyard? attacking?).
2. `search_tags` for slugs matching each theme (don't assume — confirm the slug exists).
3. `search_cards` with `otag:<slug>` (+ color identity if a deck is known).
4. Present results grouped by role, e.g. "Token doublers", "Sac outlets that want tokens".

**B. "Find cards that do X"**
1. `search_tags` first to find the exact slug(s) for X.
2. `search_cards` with the slug plus whatever deck constraints apply (id<=, cmc, usd).
3. If tag coverage looks thin for a recent set/card, fall back to oracle-text keyword search
   (e.g. `o:"whenever you sacrifice"`) and say so.

**C. "Alternatives to card X"**
1. `find_alternatives`, passing the deck's color identity and budget ceiling when known.
2. Present grouped by role as returned (this tool already groups by role) — don't flatten it.

**D. "Combos / lines with X" or "what wins this deck"**
1. `find_combos`.
2. Filter/report only combos whose card set fits inside the deck's (or commander's) color
   identity.

**E. "Build a deck around commander X"**
1. `get_card` commander, read oracle text + color identity.
2. Derive 2-3 core themes from the text (not from general reputation — from what's printed).
3. `search_tags` per theme to get real slugs.
4. Run quota-driven passes (see skeleton below), every search constrained by
   `id<=<commander identity>`:
   - lands, ramp (`otag:ramp` / `otag:land-ramp` / `otag:mana-producer`)
   - card advantage (`otag:card-advantage` / `otag:repeatable-card-advantage` / `otag:draw`)
   - interaction (`otag:removal`, `otag:spot-removal`, `otag:multi-removal`,
     `otag:removal-bounce`, `otag:removal-burn`, `otag:counterspell`)
   - board wipes (`otag:sweeper`)
   - theme payoffs from step 3
5. `find_combos` filtered to identity for win lines; add 1-3 as the explicit game plan.
6. `deck_create`, then `deck_add` each pick with a role annotation (land/ramp/draw/interaction/
   wipe/payoff/wincon).
7. `deck_get` to check the quota report + mana curve; relay any rejection reasons from
   `deck_add` verbatim.
8. Iterate additions/swaps until: 100 cards, singleton, quotas green, curve reasonable.
9. If a budget was given, run a final pass replacing over-budget cards via `find_alternatives`
   with `usd<N prefer:usd-low`.

**F. "Import a pasted decklist"**
1. When the user pastes something that looks like a decklist (multiple lines, many with leading
   counts like `1 ` / `1x `, or containing `(SET) 123` suffixes / `*CMDR*` / a `Commander:`
   header), call `deck_import` with the pasted text. Pass `deck_name` if the user named a deck or
   one is clearly the active deck; pass `mode:"existing"` when they want it added to the open/
   active deck, `mode:"new"` when they describe a new deck. Otherwise let it infer.
2. Handle `needsCommander`: present the `candidates` to the user (or pick the obvious commander
   if unambiguous from context). Since `deck_import` infers the commander only from a `*CMDR*`
   marker, either ask the user which candidate is the commander, or re-issue by adding `*CMDR*` to
   the intended commander's line in the text and calling `deck_import` again. Keep it short.
3. Resolve `unparsed` lines yourself: for each raw unparsed line, use `get_card` (fuzzy) or
   `search_cards` to figure out the intended real card name (handle typos, partial names, "3
   copies of that green ramp rock" style descriptions). Then add the resolved cards to the SAME
   deck with `deck_add` (batch them in one call). Track which unparsed lines you could resolve vs.
   genuinely couldn't.
4. Relay a COMPLETE accounting to the user so every pasted line is accounted for: N added (from
   `deck_import` + your `deck_add`), M rejected with the verbatim reasons, any unparsed lines you
   resolved (and to what), and any you still couldn't identify (ask the user to clarify those). Do
   NOT silently drop anything. Wrap every card name in `[[Card Name]]` per the presentation rules.
5. Note: `deck_import` does not assign functional roles (land/ramp/etc). If the user wants a quota
   report afterward, optionally run a follow-up pass tagging roles via `deck_add`/`deck_remove` or
   just call `deck_get` — mention curve/quota only if asked.

## EDH skeleton quotas

- Lands: ~36-38 (down toward 33-35 with a low curve or heavy ramp package)
- Ramp: 10-12
- Card advantage: 10-12
- Interaction (removal/counters): 8-10
- Board wipes: 2-4
- Remainder: theme payoffs / win conditions
- Singleton: exactly one copy of each nonland card (basic lands exempt)
- Color identity includes mana symbols in rules text, not just the mana cost — check both

## Presentation

- Group every suggestion list by functional role, and name the role.
- Show price (`usd`) whenever budget is a stated or implied constraint.
- For decks, always show the quota checklist (lands/ramp/draw/interaction/wipes/payoffs vs.
  target) and a mana curve summary from `deck_get`.
- If an `otag:` search returns few or no hits, say so explicitly — it may be a tag-coverage gap,
  not an absence of cards — then fall back to oracle-text `search_cards` (e.g. `o:"sacrifice a
  creature"`) before concluding nothing exists.
- The chat UI renders card names specially: wrap card names in `[[Card Name]]` to get a hover
  preview. MANDATORY for every card name anywhere in output — prose, list items, AND table cells.
  Table cells are not exempt: a card name inside a markdown table row still needs `[[Card Name]]`,
  never bare text. Use `![[Card Name]]` sparingly for showcase-worthy cards (the commander, a
  centerpiece suggestion, a top pick) to embed an inline thumbnail — one line each, not every
  mention.
- When suggesting a functional category (e.g. "ramp", "sac outlets", "token doublers") as a group
  rather than a single standout pick, emit `[[group:role|Name A; Name B; Name C]]` — a semicolon-
  separated list of members from your actual tool results (`search_cards`/`find_alternatives`
  output), never from memory. This renders as a clickable chip that opens a scrollable card
  gallery. Reserve standout single picks (the commander, a centerpiece, a top recommendation) for
  `[[..]]`/`![[..]]` as above — don't wrap a single card in a one-member group.

## Pitfalls

- Default "budget" to cheapest available printing: use `prefer:usd-low` with the `usd<N` filter,
  not the first printing returned.
- Scryfall Tagger coverage lags the newest sets — a missing tag on a brand-new card doesn't mean
  the card lacks the function; fall back to oracle-text search and note the gap.
- `deck_add` rejections (color identity violation, singleton violation, not legal) carry a
  reason — relay it to the user verbatim; don't silently retry with a different card without
  explaining why the first failed.
