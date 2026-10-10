# Architecture Map

Dense orientation for anyone (human or agent) starting work here. Read this
first, then open only the files you need. Surveyed against
`feat/suggestions-and-card-cache` @ `4506e94`. Not prose — a map.

## 1. Ring / layer map

Dependencies flow one direction: **web → mcp → core**. Core imports nothing
from mcp or web. The web app may import core directly (it does, for HTTP
routes) and also reaches core a second way, through the MCP server, for chat
turns — see §3 for why both paths exist.

| Layer | Module | Path | Owns | Public interface |
|---|---|---|---|---|
| R0 data | db/connection | `packages/core/src/db/connection.ts` | SQLite handle, `data/scrychat.db` | `openDb`, `getMeta`, `setMeta`, `REPO_ROOT`, `DATA_DIR`, `DB_PATH` |
| R0 data | local | `packages/core/src/local.ts` | local-mirror reads, mirror-vs-live verdict | `getLocalDb`, `parseCiMask`, `maskToColors` |
| R1 remote | scryfall | `packages/core/src/scryfall.ts` | live Scryfall client, retry | search/card fetch |
| R1 remote | spellbook | `packages/core/src/spellbook.ts` | live Commander Spellbook client | combo fetch |
| R1 ingest | ingest/* | `packages/core/src/ingest/` | bulk download → SQLite populate | `ingest` entry, `cards`, `prices`, `tagger`, `spellbook`, `download` |
| R2 domain | decks | `packages/core/src/decks.ts` | deck CRUD, quotas, report, export | `Deck`, `CardEntry`, `DeckReport`, `addCards`, `deckReport`, `exportDeck`, … |
| R2 domain | suggestions | `packages/core/src/suggestions.ts` | proposed deck changes | `Suggestion`, `listSuggestions`, `addSuggestions`, `decideSuggestion`, `clearDecided` |
| R2 domain | collection | `packages/core/src/collection.ts` | Arena owned/missing index | `CollectionFile`, `OwnedIndex`, `getOwnedIndex`, `collectionStats`, `COLLECTION_PATH` |
| R2 domain | arena-log | `packages/core/src/arena-log.ts` | `Player.log` parse | log → arena id list |
| R2 domain | tags, alternatives, import | `packages/core/src/` | tag index, functional scoring, decklist parse | re-exported via `index.ts` |
| R3 tools | mcp | `packages/mcp/src/tools.ts` (+`index.ts`) | 21 MCP tools over core | stdio server, `dist/index.js` |
| R4 server | web server | `apps/web/src/server.ts` (1867 L) | HTTP + SSE + Agent SDK host | `/api/*` routes |
| R4 server | *-core helpers | `apps/web/src/{linkify,group-chips,config,collection,deck-name}-core.ts` | pure, unit-tested server logic | per-file exports |
| R5 ui | React app | `apps/web/ui/src/` | chat panel, deck panel, suggestions, settings | `App.tsx` root |

`packages/core/src/index.ts` is the single barrel: it re-exports scryfall,
tags, spellbook, alternatives, decks, import, local, arena-log, collection,
suggestions. Import from `@scrychat/core`, not a deep path.

The `*-core.ts` convention in `apps/web/src` exists so logic is testable
without booting Express — each has a matching file in `apps/web/test/`. Put
new pure server logic there, not inline in `server.ts`.

## 2. Event / message catalog

Two separate channels. Neither is a general event bus.

**Chat SSE** — `POST /api/chat` streams Agent SDK output. Emitted in
`server.ts`, consumed by `ChatPanel.tsx`.

| Event | Emitted at | Payload | Consumed for |
|---|---|---|---|
| `chat` | `server.ts:462` | `{chatId}` | new-chat id handoff |
| `text-delta` | `server.ts:592` | `{text}` | streaming reply text |
| `tool-use` | `server.ts:597` | `{name, input}` | tool chip appears |
| `tool-result` | `server.ts:616` | `{toolIndex, result}` | chip fills in |
| `segments-update` | `server.ts:793` | `{segments}` | post-pass rewrite (linkify) |
| `done` | `server.ts:626`, `:634`, `:812` | `{sessionId, error?, interrupted?}` | three exits: normal, error, interrupt |

`done` is emitted from three sites. A change to its shape must touch all three.

**Deck SSE** — `GET /api/deck-events` (`server.ts:1396`) pushes deck mutations
so the deck panel refreshes when a chat turn changes a deck. This is the sole
chat→deck-panel wiring point; there is no shared store between them.

## 3. Seam table

| Seam | File | Mechanism |
|---|---|---|
| chat turn → tools | `server.ts:511-517` | Agent SDK `mcpServers.scrychat`, stdio `node dist/index.js` |
| HTTP routes → core | `server.ts` route bodies | direct `@scrychat/core` import |
| MCP tools → core | `packages/mcp/src/tools.ts` | direct `@scrychat/core` import |
| chat → deck panel | `/api/deck-events` SSE | server-sent event, no shared state |
| server → UI chat | `/api/chat` SSE | server-sent event (§2) |
| UI → card images | `/api/card-image`, `/api/card-images` | HTTP proxy, server-side fetch |
| Arena log → collection | `arenaSync.ts` + `POST /api/collection` | File System Access API handle in the browser, `text/plain` body up to 64mb |
| reply text → card links | `linkify-core.ts` → `segments-update` | post-pass, rewrites persisted segments (§6 row 4) |

**Why core is reached two ways.** HTTP routes import core directly; chat turns
go through MCP stdio. The hop is not redundant — `.mcp.json` mounts the same
server in a Claude Code terminal session, so one tool definition serves both
frontends. A tool needed *only* by the web app should import core directly and
skip the MCP registration.

## 4. Storage / persistence envelopes

All state is files plus one SQLite mirror. No schema-version field or
migration chain exists on the JSON stores — a shape change is a hand-written
compatibility read.

| Store | Path | Shape | Version / migrations |
|---|---|---|---|
| decks | `decks/<slug>.json` | `Deck` (§5) | none — no version field |
| suggestions | `suggestions/<slug>.json` | `SuggestionFile` | none; dir is gitignored |
| chats | `chats/<id>.json` | `ChatFile` (`server.ts:167`): `{id, title, createdAt, updatedAt, sdkSessionId?, lastSeenActionIdx, messages: ChatMsg[], deckRefs?}`. `ChatMsg` (`:134`): `{role, text, tools?, segments?, activeDeck?, interrupted?, at}`; `segments` are `{type:"text"}` or `{type:"tool", name, input, result?}` (`:130`), tool results truncated to 2048 chars (`:144`). id = `<Date.now()>-<rand>` (`:264`); title = first user message cut to 40 chars (`:268`); atomic write (`:259`) | none; old files without `deckRefs` are tolerated on read |
| collection | `collection.json` | `CollectionFile` | none |
| card mirror | `data/scrychat.db` | SQLite, cards/tags/combos/prices | `meta` table via `getMeta`/`setMeta` |
| bulk downloads | `data/downloads/` | raw Scryfall + Spellbook dumps, ~1GB | cached by filename |
| config | `scrychat.config.json` | `{linkifyPass, …}` | none; `PATCH /api/config` |

Deck and suggestion slugs come from two separate `sanitizeName`
implementations (`decks.ts:88` area and `suggestions.ts:43`) that must agree.
The suggestions copy carries a comment saying so. Change one, change both, or
a deck and its suggestions stop resolving to the same file.

Writes to `suggestions/` go through `atomicWrite` (tmp file + rename,
`suggestions.ts:55`). Follow that pattern for any new JSON store.

## 5. Domain contract

Shapes of record live in `packages/core/src/`. Do not restate them elsewhere.

- **`Deck`** (`decks.ts:26`) — `{name, commander, commanderIdentity[], cards: CardEntry[], updatedAt, quotaTargets?}`.
- **`CardEntry`** (`decks.ts:4`) — `{name, tags?: string[], count?}`. **Tags are an array, not a single role.** A card belongs to many functional groups at once; the deck panel groups by tag and one card appears under several.
- **`ResolvedCard`** (`decks.ts:35`) — the enriched read: color identity, cmc, type line, `legalCommander`, image, `producedMana`, `arena`.
- **`Suggestion`** (`suggestions.ts:16`) — `{id, kind: add|cut|swap, status: pending|accepted|rejected, out?, in?, role?, why, createdAt, decidedAt?, note?}`. `out` is required for cut/swap; `in` for add/swap.
- **`QuotaTargets`** (`decks.ts:10`) — five `[min,max]` ranges. Defaults at `decks.ts:18`: lands 36-38, ramp 10-12, draw 10-12, interaction 8-10, wipes 2-4.

**Invariants / fences:**

- **Suggestions propose, they do not apply.** `deck_suggest` and
  `deck_suggestions` never mutate a deck. Only `decideSuggestion`
  (`suggestions.ts:149`), reached by an explicit human accept, edits it. This
  is what lets a chat turn queue a change under `permissionMode: "dontAsk"`
  without a human in the loop. Preserve the asymmetry.
- **Quota targets resolve per-field.** `resolveQuotaTargets`
  (`decks.ts:629`) lets a per-deck override win field-by-field over the global
  setting — a deck that overrides only `lands` keeps global values for the
  rest.
- **MTGA export is front-face only.** `exportDeck` (`decks.ts:179`) trims
  `Front // Back` to the front face for `mtga`. Arena's importer rejects the
  full name; plain and moxfield round-trip it fine. Fenced by
  `apps/web/test/export-fence.test.ts`.
- **Structured results, not prose.** Card hovers `[[Card]]`, focal images
  `![[Card]]`, and group chips `[[group:...]]` render from tool output. A tool
  that returns a pre-formatted string pushes rendering into the transcript
  where the UI cannot reach it. Add result type and component together.

## 6. Data pipelines / integrations

### 6.1 Scryfall bulk ingest → SQLite mirror

| Facet | Value |
|---|---|
| **Source + config** | `https://api.scryfall.com/bulk-data` (`ingest/download.ts:8`) → `oracle_cards`, `default_cards`, `oracle_tags`. No env var, no secret — public API, URLs hardcoded |
| **Secret location** | None. No credentials anywhere in the ingest path |
| **Transform + limits** | `ingest/cards.ts` (streaming JSON, `pipeline.on("data")` at `:187`), `ingest/prices.ts`, `ingest/tagger.ts`. Downloads cached in `data/downloads/` (~1GB), skipped if present. Run `--cards`/`--prices`/`--tags`/`--combos` to refresh one dataset |
| **Consumer contract** | `getLocalDb()` (`local.ts:111`) gates every local read. Serves `get_card`, `search_tags`, `find_alternatives`, `find_combos`. **`search_cards` deliberately stays live** so full Scryfall query syntax (`otag:`, `id<=`, `usd<`, `prefer:usd-low`) is whatever the API supports, not whatever the mirror reimplements |
| **Run host** | Local, on demand: `pnpm --filter @scrychat/core ingest`. ~2 min. Writes `data/scrychat.db`. The ingest does not run on the NAS: the 208MB DB is built locally, `scp`'d to `<DEST>/data/scrychat.db` on noel, then `docker compose restart` (`docs/deploy-nas.md`, "Refreshing card data"); the server detects the mtime change and reopens it |

### 6.2 Commander Spellbook combos

| Facet | Value |
|---|---|
| **Source + config** | Bulk `https://json.commanderspellbook.com/variants.json` (`ingest/spellbook.ts:13`); live `https://backend.commanderspellbook.com` (`spellbook.ts:29`). No secret |
| **Secret location** | None |
| **Transform + limits** | `ingest/spellbook.ts` populates combos into the mirror; `spellbook.ts:77` builds a per-combo permalink `https://commanderspellbook.com/combo/<id>` |
| **Consumer contract** | `find_combos` reads the mirror when present, else live |
| **Run host** | Local, same ingest command (`--combos`); reaches the NAS inside the copied `scrychat.db` |

### 6.3 Arena collection snapshot

| Facet | Value |
|---|---|
| **Source + config** | The user's Arena `Player.log`. Browser-side: Chrome File System Access API keeps a folder handle so the log can be re-read on demand (`ui/src/arenaSync.ts`); drag-and-drop is the fallback. **Arena's "Detailed Logs" setting must be on**, or the log holds no collection data |
| **Secret location** | None, but the data is personal. Stays local in `collection.json`; never uploaded |
| **Transform + limits** | `POST /api/collection` (`server.ts:1416`), `express.text({type:"text/plain", limit:"64mb"})` → `arena-log.ts` parse → `mapArenaIdsToOracle` (`collection.ts:56`) → `writeCollectionFile`. **Arena only; paper collections are out of scope** |
| **Consumer contract** | `getOwnedIndex` (`collection.ts:95`) and `collectionStats` (`:148`). Renders as a deck report's `arenaCheck` and as `owned` flags on tool results |
| **Run host** | Local. Browser reads the log, server writes `collection.json` at repo root (`COLLECTION_PATH`, `collection.ts:23`). `docker-compose.yml` mounts only `data/`, `decks/`, `chats/` and the credential, so on the NAS `collection.json` is inside the container filesystem, not a bind mount (inferred from the compose volumes; not otherwise documented) |

### 6.4 linkify post-pass (reply text → card links)

| Facet | Value |
|---|---|
| **Source + config** | Each assistant reply, before persist. `linkifyPass` in `scrychat.config.json` (default `true`), toggled from the settings drawer or `PATCH /api/config` (`server.ts:1604`) |
| **Secret location** | None. Uses the same subscription auth as chat |
| **Transform + limits** | `apps/web/src/linkify-core.ts` (481 L). **Two-stage and gated:** a deterministic pass against the local card-name index wraps unambiguous names for free; only the ambiguous residue escalates to a Haiku call — single words that are both a card name and ordinary English ("Opt", "Fog") — deciding per occurrence. Prose with only unambiguous names never calls a model |
| **Consumer contract** | Emits `segments-update` (`server.ts:793`) with rewritten segments; `ChatPanel.tsx` + `CardName.tsx` render `[[Card]]` as a hover and `![[Card]]` as an embedded image. Group chips `[[group:...]]` come from `group-chips-core.ts` |
| **Run host** | In-process in the web server (on the NAS: the one container, `scrychat` on noel, `docker-compose.yml`) |

### 6.5 NAS deployment (host: noel)

| Facet | Value |
|---|---|
| **Host + shape** | One container `scrychat` on noel, LAN-only at `http://noel:8787/`, `restart: unless-stopped` (`docker-compose.yml:26,31-32`). One Node process serves the built UI and spawns the MCP server as a stdio child (`docs/deploy-nas.md`) |
| **Auth** | Claude subscription, not an API key. `~/.claude.json` is copied to `<DEST>/secrets/claude.json` and mounted read-write at `/home/scrychat/.claude.json` so the SDK can refresh it. Never expose to the internet (`docs/deploy-nas.md`) |
| **State** | Bind mounts `/app/data`, `/app/decks`, `/app/chats`, host paths set by `SCRYCHAT_{CLAUDE_CREDENTIAL,DATA,DECKS,CHATS}_DIR` in `.env`, defaulting to `./data` etc. DB path is fixed at `/app/data/scrychat.db`, no env override |
| **Entrypoint** | `docker-entrypoint.sh` runs as root, `chown -R scrychat` on `/app/{decks,chats,data}` and the credential, then `exec gosu scrychat`. Without it `atomicWrite` fails EACCES on bind mounts |
| **Build** | Build ON the NAS: `better-sqlite3` compiles from source, an arm64 Mac build will not run on an x86 NAS (`docs/deploy-nas.md`). `docker compose up -d --build` |
| **Health** | `docker-compose.yml:49-55` healthcheck fetches `http://localhost:8787/` every 30s. It checks the UI root only, not `/api/health` |
| **Config** | `scrychat.config.json` is baked into the image; change it in the repo and rebuild |

## 7. Landmine index

- **Before widening `allowedTools`:** `server.ts:553` sets
  `permissionMode: "dontAsk"`. An allowed tool runs with **no human in the
  loop**, so the allowlist is the entire security boundary. Card oracle text,
  deck names, chat input and uploaded images are all untrusted input that
  reaches the model. `Bash` with no confirmation is arbitrary code execution
  on the host as the logged-in user. Denied at `server.ts:543`: `Bash`,
  `Write`, `Edit`, `NotebookEdit`, `WebFetch`, `WebSearch`, `Task`,
  `KillShell`. Keep it that way. For open-ended analysis use Anthropic's
  hosted code execution (runs off-host, cannot reach `decks/` or `data/`), not
  `Bash`.
- **Two tool permission blocks exist.** `server.ts:377` (allowlist empty,
  for the cheap linkify/title pass) and `server.ts:518` (the chat turn). A new
  tool must be added to the right one; adding it to the first grants it to a
  pass that should have no tools at all.
- **A stale `ANTHROPIC_API_KEY` breaks web chat.** Its presence overrides
  Claude Code subscription auth. `unset ANTHROPIC_API_KEY`.
- **The mirror verdict is memoized.** `getLocalDb` (`local.ts:111`) caches
  the local-vs-live decision in `cachedDb`. There *is* mtime invalidation
  (`maybeInvalidateOnMtimeChange`, `local.ts:76`) throttled to
  `STAT_THROTTLE_MS = 5000`, so a long-lived server picks up a fresh ingest
  within ~5s. The README's "restart it after the ingest" is stricter than the
  code now requires; the README was corrected to match.
- **Tool count: 21 registered, 18 in the chat allowlist.**
  `packages/mcp/src/tools.ts` registers 21 tools; the `server.ts:518`
  allowlist carries 18 `mcp__scrychat__*` names. The 3 not in the chat
  allowlist are `collection_stats`, `deck_rename_tag` and
  `deck_set_card_count`. Re-counted 2026-10-10 with
  `grep -o 'mcp__scrychat__[a-z_]*' apps/web/src/server.ts | sort -u | wc -l`;
  an earlier pass of this map said 19 and named only 2, which was wrong.
  CLAUDE.md now carries the same corrected figure.
- **`GET /api/health`** (`server.ts:1631`) reports skill-file readability and
  whether the mirror exists with cards/Arena data populated. Check it first
  when "scrychat isn't finding cards", before re-diagnosing.
- **Deck and suggestion slugs are two implementations.** They must agree; see
  §4.
- **`done` is emitted from three sites** (§2). Changing its shape means three
  edits.
- **`server.ts` is 1867 lines and `DeckPanel.tsx` is 1675.** Both are hot
  files. One agent at a time — parallel agents cannot both commit the same
  file.
- **Never modify `decks/`, `chats/`, `data/`, or `collection.json` to make a
  check pass.** They are user data. Snapshot first if a test must mutate.
- **pnpm only, never npm.**

## 8. Status ladder

Active work: the suggestions feature, on branch
`feat/suggestions-and-card-cache` (this worktree). The branch name says "and
card cache"; the landed commits cover suggestions only.

| Step | Commit | State |
|---|---|---|
| suggestion core + file store | `packages/core/src/suggestions.ts` | LANDED |
| MCP surface (`deck_suggest`, `deck_suggestions`, `deck_suggestion_decide`) | `cbb0693` era | LANDED |
| HTTP routes (`server.ts:1482-1592`) | — | LANDED |
| UI (`Suggestions.tsx`, inside deck manager, desktop + phone) | `0e17b66` | LANDED |
| allow suggestion tools in chat turns | `7558259` | LANDED |
| README coverage | `cbb0693` | LANDED |
| gitignore runtime `suggestions/` | `4506e94` | LANDED |
| card cache | — | not started / not in this branch |
| goldfish simulation | — | proposed, not started (see `CLAUDE.md` §simulation) |

No tracking issue found in-repo; the git log is the record.

## Drift log

- **Branch name over-promises.** `feat/suggestions-and-card-cache` — no card
  cache work is present in the surveyed commits.
- **No tracking issue.** §8 is reconstructed from `git log`, not from a
  canonical issue. If one exists outside the repo, point §8 at it.
- **`chats/` shape: resolved, one gap.** §4 now carries the shape from
  `server.ts`. `evals/run-tier-b.mjs` does not pin the file format; it reads
  chats via `GET /api/chats/:id` and uses only `messages[].role`,
  `.segments[]` (`type`, `text`) and `.tools[]` (`:184-203`). Not confirmed:
  the full `/api/chat` handler persist path (user message append, `sdkSessionId`
  and `lastSeenActionIdx` writes) was not read end to end.
- **Ingest `meta` keys not enumerated.** `getMeta`/`setMeta` exist; which keys
  the ingest writes was not surveyed.
- **Docker/NAS deploy: resolved, gaps.** §6.5 carries it. Not answered by the
  files: the `Dockerfile` was not read (base image, build steps); there is no
  documented path for `collection.json` or `scrychat.config.json` changes
  surviving a rebuild beyond what §6.5 states; `docs/deploy-nas.md` addresses
  the reader as using a Mac, so the `scp` source host is assumed, not fixed.
