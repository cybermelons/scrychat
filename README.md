# scrychat

A Commander/EDH deck-building assistant that reasons in **functional card roles**
("token doubler", "sac outlet", "extra combat phase") and enumerates candidates
from the real card pool — Scryfall's community oracle tags plus Commander
Spellbook's combo database — instead of leaning on EDHREC-style popularity
lists.

One MCP server, two frontends:
- **Claude Code chat** — mount the server in a terminal session.
- **Local browser app** — chat panel + deck panel, same server underneath.

No collection tracking. No per-token API billing — everything runs on your
Claude subscription.

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
deck panel showing cards by role, quota bars, mana curve, and card images.

## How it works

- **packages/core** — Scryfall and Commander Spellbook clients, the local tag
  index, functional-alternatives scoring, and deck file CRUD. Decks are JSON
  files under `decks/`.
- **packages/mcp** — MCP stdio server exposing 10 tools over core: card
  search/lookup, tag search, alternatives, combo search, and deck
  list/create/get/add/remove.
- **apps/web** — Express + Claude Agent SDK backend, React frontend, SSE
  streaming between chat and deck panel.

Regenerate the tag index (from Scryfall's `oracle_tags` bulk export):

```
pnpm --filter @scrychat/core build-tag-index
```

### Evals

`evals/run-tier-a.mjs` runs the golden set (`evals/golden.md`) against the
live tool surface; results land in `evals/RESULTS.md` and transcripts in
`evals/transcripts/`.

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
