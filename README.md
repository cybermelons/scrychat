# scrychat

A Commander/EDH deck-building assistant that reasons in **functional card roles**
("token doubler", "sac outlet", "extra combat phase") and enumerates candidates
from the real card pool — Scryfall's community oracle tags plus Commander
Spellbook's combo database — instead of leaning on EDHREC-style popularity
lists.

One MCP server, two frontends:
- **Claude Code chat** — mount the server in a terminal session.
- **Local browser app** — chat panel + deck panel, same server underneath.

Arena-only collection tracking via a local snapshot import — in the web UI,
link your Arena log folder (via Chrome's File System Access API, so
scrychat can re-read `Player.log` on demand) or drop the file directly as a
drag-and-drop fallback (Detailed Logs must be enabled in Arena, or the log
won't contain collection data). This gives owned/missing on deck cards
(a deck report's `arenaCheck`) and `owned` flags in tool results; paper
collections are out of scope, and the snapshot stays local in
`collection.json`. No per-token API billing — everything runs on your Claude
subscription.

## Demo

![scrychat demo](assets/demo.gif)

One prompt builds a Teysa Karlov aristocrats deck: the chat streams tool chips
as it searches sac outlets, returns a reply with hoverable `[[card]]` links
(card image on hover), and clicking a card toggles it into the deck panel —
tag groups, quota bars, and mana curve updating live.

## Requirements

- Node 24+
- pnpm 10+ (pnpm only, never npm)
- Claude Code, signed in with a subscription (Pro/Max)

The browser app authenticates via the Claude Agent SDK using your Claude Code
subscription session — no `ANTHROPIC_API_KEY` needed. If you have a stale
`ANTHROPIC_API_KEY` set in your environment, **unset it** — its presence
overrides subscription auth and will break the web chat.

```
unset ANTHROPIC_API_KEY
```

## Setup

```
pnpm install
pnpm -r build
```

### Claude Code

Open a Claude Code session at the repo root. `.mcp.json` registers the
`scrychat` MCP server (stdio, `packages/mcp/dist/index.js`), and the
`edh-deck-builder` skill under `.claude/skills/` auto-loads with query recipes
and quota rules.

Example prompts:
- "What are the payoffs for Parallel Lives?"
- "Find all token doublers legal in Commander under $5"
- "Alternatives to Doubling Season in Selesnya under $20"
- "Build a $150 deck around Isshin"

### Browser app

```
pnpm --filter @scrychat/web dev
```

Open `http://localhost:8787`. Same MCP server and skill, chat panel plus a
deck panel showing cards by tag, quota bars, mana curve, and card images.

Chat sessions auto-title from the first message and can be renamed anytime;
an in-flight reply can be interrupted with the stop button. Cards carry a
`tags[]` array (not a single role) — the deck panel groups by tag, and the
tag editor lets you add/remove/rename tags per card, renaming a tag across
every card that has it.

The deck panel exports to MTGA, Moxfield, or plain-text format (a copy
button puts the list straight on the clipboard); MTGA export trims
transform/DFC card names down to the front face only, since Arena's
decklist importer rejects the full `Front // Back` name that other formats
round-trip fine. The settings drawer (gear icon) sets the default export
format and quota targets — globally, or as a per-deck override that wins
field-by-field over the global value — plus the `linkifyPass` toggle
described below.

## How it works

- **packages/core** — Scryfall and Commander Spellbook clients, the local tag
  index, functional-alternatives scoring, and deck file CRUD. Decks are JSON
  files under `decks/`.
- **packages/mcp** — MCP stdio server exposing 18 tools over core: card
  search (`search_cards`, `get_card`), tag search (`search_tags`), functional
  alternatives (`find_alternatives`), combo search (`find_combos`), deck CRUD
  (`deck_list`, `deck_create`, `deck_get`, `deck_add`, `deck_remove`,
  `deck_import`, `deck_rename`, `deck_set_commander`, `deck_export`), tag
  management (`deck_set_card_tags`, `deck_rename_tag`), card count edits
  (`deck_set_card_count`), and collection stats (`collection_stats`).
- **apps/web** — Express + Claude Agent SDK backend, React frontend, SSE
  streaming between chat and deck panel.

Regenerate the tag index (from Scryfall's `oracle_tags` bulk export):

```
pnpm --filter @scrychat/core build-tag-index
```

### Evals

Three eval tiers, all in `evals/`:
- **Tier A** (`run-tier-a.mjs`) — the golden set (`evals/golden.md`) against
  the live tool surface; results land in `evals/RESULTS.md` and transcripts
  in `evals/transcripts/`.
- **Tier B** (`run-tier-b.mjs`) — behavioral formatting-contract checks
  (card-ref linkify, chips, export shape) asserted mechanically against
  persisted chat files, not judged.
- **Tier C** (`run-tier-c.mjs`) — mechanical HTTP-level checks against the
  built web server: deck CRUD, `/api/health`, and an Arena-collection
  import end-to-end using a fixture `Player.log`. `--with-chat` adds a few
  LLM-dependent checks (skipped by default).

`GET /api/health` reports whether the skill file is readable and whether
the local SQLite mirror exists with cards/Arena data populated — useful for
diagnosing "why isn't scrychat finding cards" on a fresh or stale checkout.

## Local mirror (optional but recommended)

```
pnpm --filter @scrychat/core ingest
```

Downloads Scryfall's `oracle_cards`/`default_cards`/`oracle_tags` bulk exports
and Commander Spellbook's variants dump into `data/downloads/` (cached, ~1GB)
and populates a local SQLite mirror at `data/scrychat.db`. Takes ~2 minutes on
a normal connection.

What moves local vs. stays live:
- **Local (instant, no network round-trip):** `get_card`, `search_tags`,
  `find_alternatives`, `find_combos` — card lookup, tag search, functional
  alternatives, and combo search all hit `data/scrychat.db`.
- **Still live:** `search_cards` — full Scryfall search syntax (`otag:`,
  `id<=`, `usd<`, `prefer:usd-low`, etc.) proxies the live API so query syntax
  stays exactly what the skill teaches.

Refresh with the same command — Scryfall's bulk data updates daily, so
re-running `pnpm --filter @scrychat/core ingest` picks up new prices, cards,
and tags. Use `--cards` / `--prices` / `--tags` / `--combos` to refresh one
dataset at a time.

Without the local mirror, every tool falls back to live API calls — nothing
breaks, it's just slower. One caveat: a running MCP server or web app decides
local-vs-live once at first use, so restart it after running the ingest for
the first time (or after a refresh) to pick up the mirror.

`scrychat.config.json` at repo root: `linkifyPass` (default `true`) runs a
second cheap-model pass over each reply to wrap any bare card names the model
missed in `[[...]]`, before persisting. This is gated so it's cheap in the
common case: a deterministic pass against the local card-name index
auto-wraps unambiguous names for free, and only escalates to a Haiku call
for the residue — single words that are both a real card name and ordinary
English (e.g. "Opt", "Fog") — deciding per-occurrence whether the text means
the card. Prose with only unambiguous names never touches the model at all.
Toggle it from the settings drawer (gear icon) or `PATCH /api/config`.

## Attribution & data

Card data and images are © Wizards of the Coast, used under WotC's
[Fan Content Policy](https://company.wizards.com/en/legal/fancontentpolicy).
scrychat is unofficial Fan Content, not approved or endorsed by Wizards of
the Coast.

Functional tag and card data from [Scryfall](https://scryfall.com), including
community Tagger oracle tags — thank you to Scryfall and the Tagger
contributors. Combo data from
[Commander Spellbook](https://commanderspellbook.com) — thank you to that
project and its contributors.

This is a personal tool. Don't redistribute derived datasets (tag index,
deck exports, etc.) publicly.
