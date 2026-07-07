# scrychat — modular Commander deck-building assistant

## Context

The user wants an MTG deck-building assistant that understands what cards *do* — unlike EDHREC, which only ranks deck co-occurrence. Core behavior: reason in **functional roles** ("token doubler", "sac outlet"), enumerate categories exhaustively from the real card pool, find synergies/combo lines, and offer functional alternatives (Doubling Season → Parallel Lives, Anointed Procession, Mondrak). No collection tracking.

**Decisions made with the user:**
- Format: **Commander/EDH only.**
- **Two frontends, one modular core**: available in Claude Code (terminal) AND as a browser experience — chatbot running alongside a deck-builder UI. Separable but combinable.
- **No per-token API billing**: everything runs on the Max subscription.

**Key research findings (verified live 2026-07-05):**
- Scryfall search API natively supports functional tags: `otag:token-doubler` → exactly the 15 real doublers; `otag:sacrifice-outlet id<=bg usd<3` → 656 cards with constraints composed. The functional-tag layer largely exists already.
- Scryfall publishes Tagger data as an official bulk export (`api.scryfall.com/bulk-data` type `oracle_tags`, 18 MB gz, daily: hierarchy, aliases, descriptions, per-card weights). No scraping/ToS risk.
- **Scryfall 403s clients without a real `User-Agent` + `Accept` header** — set on every request.
- Budget queries need `prefer:usd-low` (default prices are one printing, not the cheapest).
- Commander Spellbook: public REST API (`backend.commanderspellbook.com`, swagger at `/schema/swagger/`); 551 MB bulk export exists for a later local mirror.
- Scryfall rate limit ~10 req/s — fine for chat + UI usage.

## Architecture

```
┌────────────────────┐        ┌─────────────────────────────┐
│ Claude Code (term) │        │ apps/web (browser)          │
│ skill + .mcp.json  │        │ deck-builder UI ⟷ chat panel│
└─────────┬──────────┘        │ backend: Claude Agent SDK   │
          │                   │ (headless CC on Max OAuth,  │
          │                   │  loads same skill)          │
          │                   └──────────┬──────────────────┘
          └──────────┬───────────────────┘
                     ▼
        packages/mcp  — MCP server (stdio): the contract
        packages/core — card intelligence + deck state
                     ▼
        v1: live Scryfall + Spellbook APIs (+ committed tag index)
        v2: local SQLite mirror (same tool contracts, swap-in)
```

**Why this shape:** the MCP tool surface is the modular boundary. Claude Code mounts it natively; the web app's agent loop is the Agent SDK (which is headless Claude Code, billed to the Max subscription via `claude setup-token` OAuth — no API costs) mounting the identical server + skill. Tools proxy live APIs in v1; a local SQLite mirror can replace the backing store later without touching either frontend.

**Shared deck state:** decks are JSON files under `decks/` (name, commander, cards with role annotations). The MCP server exposes `deck_*` tools; the web backend watches/serves the same files. Chat mutations re-render the UI; UI edits are visible to the chat agent. Decks work identically from terminal sessions.

## Project layout (pnpm workspace — pnpm only, never npm)

```
scrychat/
├── pnpm-workspace.yaml
├── .mcp.json                          # scrychat MCP server, project scope
├── .claude/skills/edh-deck-builder/
│   ├── SKILL.md                       # EDH workflows + tool-chaining recipes
│   └── references/functional-tags.md  # greppable tag index (generated, committed)
├── packages/core/                     # TypeScript, zero UI deps
│   ├── src/scryfall.ts                # fetch wrapper (User-Agent!), search, named-card, pagination
│   ├── src/spellbook.ts               # combo search client
│   ├── src/tags.ts                    # tag index load/search (from oracle_tags-derived JSON)
│   ├── src/alternatives.ts            # roles-of-card → per-role otag searches → grouped results
│   ├── src/decks.ts                   # deck file CRUD, quota/curve/identity validation
│   └── scripts/build-tag-index.ts     # oracle_tags bulk → references/functional-tags.md + tags.json
├── packages/mcp/
│   └── src/index.ts                   # @modelcontextprotocol/sdk stdio server → core
└── apps/web/
    ├── (Next.js or Vite+Express)      # implementer's choice, keep local-only
    ├── chat backend: @anthropic-ai/claude-agent-sdk, CLAUDE_CODE_OAUTH_TOKEN,
    │   mcpServers: scrychat, streams SSE to browser
    └── UI: left deck panel (list by role, quotas, curve, Scryfall card images),
        right chat panel; deck updates pushed on deck-file change
```

## MCP tool surface (the contract)

Card intelligence (v1 = live API proxies; compact JSON, `limit` default 20):
1. `search_cards({ query, max_price?, sort?, limit? })` — full Scryfall syntax passthrough (skill teaches `otag:`, `id<=`, `legal:commander`, `prefer:usd-low`)
2. `get_card({ name })` — fuzzy named lookup; oracle text, identity, prices, image URI
3. `search_tags({ query })` — search the local tag index; returns slugs, descriptions, member counts, hierarchy (how the model discovers vocabulary — never guess slugs)
4. `find_alternatives({ card, color_identity_within?, max_price? })` — grouped-by-role members via per-role otag searches
5. `find_combos({ cards })` — Spellbook variants: pieces, produces, identity, status=OK only

Deck state:
6. `deck_list / deck_create({ name, commander })`
7. `deck_get({ name })` — cards by role + quota report (lands/ramp/draw/interaction/wipes) + curve + identity violations
8. `deck_add / deck_remove({ name, cards: [{name, role?}] })` — validates identity/singleton/legality on add

## Skill (SKILL.md)

- API etiquette: proper headers, URL-encoding, pagination (matters when the model curls directly too).
- Query recipes: functional search via `otag:`; grep/`search_tags` before using any slug; `prefer:usd-low` for budget.
- Functional-alternatives recipe: identify card's roles → enumerate each role within identity/budget → present grouped by role.
- EDH skeleton quotas (Command-Zone-style): ~36–38 lands, 10–12 ramp, 10–12 card advantage, 8–10 interaction, 2–4 wipes, rest = game plan/wincons; singleton; color identity includes rules-text symbols.
- "Build around commander X" workflow: get_card → derive themes → search_tags → quota-driven searches → find_combos for win lines → deck_add with roles → deck_get quota check → budget pass.

## Phases

**Phase 1 — core + MCP + skill (usable in Claude Code immediately)**
1. Scaffold: `git init` + branch, workspace, packages/core + packages/mcp, `.mcp.json`.
2. `build-tag-index.ts` → committed `functional-tags.md` + `tags.json` (filter out `cycle-*`/art/meta slugs).
3. Core clients (scryfall/spellbook/tags/alternatives) + deck module; MCP server with all 8 tools.
4. SKILL.md.
Verify: `claude mcp list` shows scrychat connected; real-chat acceptance: "find all token doublers legal in Commander under $5"; "alternatives to Doubling Season in Selesnya under $20" (expect Anointed Procession/Mondrak-class, grouped by role); "combo lines with Hullbreaker Horror"; "build a $150 deck around Isshin" (quotas followed, `extra-combat-phase` used, legal 100 saved via deck tools).

**Phase 2 — web experience**
1. Agent SDK chat backend (Max OAuth via `claude setup-token`; verify subscription auth works headless before building UI around it), mounting packages/mcp + the skill; SSE streaming.
2. UI: chat panel + deck panel (role groups, quota bars, mana curve, card image hover via Scryfall image URIs); live deck refresh on file change.
Verify: build a deck entirely from the browser chat; edit deck in UI and confirm the agent sees changes; confirm zero API billing.

**Phase 3 — local mirror (only when live APIs pinch)**
Triggers: Tagger gaps on new sets, wanting custom/personal tags, cross-source joins, offline. Swap core's backing store to SQLite (better-sqlite3 + FTS5; pnpm 10 needs `onlyBuiltDependencies` for its postinstall; stream-parse the 551 MB Spellbook bulk; IDF shared-tag scoring for alternatives; no sqlite-vec — brute-force cosine if embeddings ever needed). Tool contracts unchanged.

## Phase 3 shipped (2026-07-07)

Local SQLite mirror is live: `get_card`/`search_tags`/`find_alternatives`/`find_combos` read `data/scrychat.db` (populated by `pnpm --filter @scrychat/core ingest`), `search_cards` stays a live Scryfall proxy for full query-syntax fidelity. Local-first-with-live-fallback: tools work unchanged (same contracts) with or without the mirror present, just slower without it.

## Risks / notes
- **Agent SDK on subscription auth** is the linchpin for a billing-free web chat — Phase 2 step 1 verifies it first; fallback is a Happy-style bridge or running the web chat through a Claude Code headless process directly.
- WotC Fan Content Policy: free personal tool, fine; attribute Scryfall/Tagger/Commander Spellbook in README; don't redistribute derived data publicly.
- Per user's global config: pnpm only; new branch before code; Opus orchestrates, Sonnet implements; one-time scripts as `tmp_*.ts` (build-tag-index is permanent tooling, so it lives in scripts/).
