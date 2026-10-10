# scrychat — agent instructions

Read `README.md` for the feature surface and `docs/design.md` for the design
intent. This file holds the decisions that are easy to get wrong, and the
reasoning behind them.

## Orientation

- `packages/core` — Scryfall + Commander Spellbook clients, local tag index,
  functional-alternatives scoring, deck file CRUD. Decks are JSON under `decks/`.
- `packages/mcp` — MCP stdio server, 22 tools over core.
- `apps/web` — Express + Claude Agent SDK backend, React frontend, SSE between
  chat and deck panel. Tool permissions live in `apps/web/src/server.ts`.

## The architecture, and why it is this one

scrychat runs on the **Claude Agent SDK with Claude Code subscription auth**,
not the raw Messages API. This is deliberate and it is the load-bearing choice:

- No per-token billing. Everything runs on the Pro/Max subscription.
- The model arrives with the full Claude Code tool surface. We subtract from
  it (`disallowedTools`) rather than build it up from nothing.
- One MCP server serves both frontends — the terminal session and the web app.

Do not propose replacing this with `@anthropic-ai/sdk` and a hand-rolled tool
loop. That trades working subscription auth and a full tool surface for an
API key and a `while` loop we would have to maintain.

Do not add LangChain or any agent framework. The Agent SDK already is the
framework, and a framework that hands back strings fights the structured
tool results the UI renders from.

## Why MCP, when the web app owns both sides

The web app could import `packages/core` directly and skip the stdio hop. It
does not, on purpose: the same server mounts in a Claude Code terminal session
via `.mcp.json`. One tool definition, two frontends, no drift. The process hop
is the price of that, and it is cheap.

If a tool is ever needed ONLY by the web app and never by a terminal session,
import it from core directly. Do not add it to the MCP server out of habit.

## Structured results are the product

Card hovers (`[[Card]]`), focal images (`![[Card]]`), group chips
(`[[group:...]]`), quota bars, mana curve, and the suggestions section all
render from structured tool output, not from prose.

So: a tool returns JSON the UI can key a component off. A tool that returns a
formatted string for the model to echo has pushed rendering into the transcript
where the UI cannot reach it. Add the result type and the component together.

## The discovery loop

The feature set is found by use, not designed up front. Goldfish simulation is
the worked example — it was not on any roadmap until chat use surfaced it.

1. Ask an open-ended question in chat.
2. Notice which questions repeat.
3. Promote a repeat into a fixed tool: real result type, real component,
   pinned behaviour.
4. Keep the one-offs as chat.

A repeat that has graduated gets determinism. A question nobody has asked
twice does not need reproducibility — it needs to be answerable at all.

## Simulation: pin the math, generate the presentation

These pull in opposite directions and the split matters.

**Simulation is ours, deterministic, seeded.** Goldfishing is a fixed
algorithm — shuffle, draw 7, apply the mulligan rule, play a land, cast what
is castable, count turns to lethal. Write it as a pure function in
`packages/core` with an explicit seed. A model-authored simulation differs run
to run in its mulligan logic and its sequencing heuristic, silently, so two
decks stop being comparable. Comparability is the whole point of goldfishing,
so this is a correctness rule, not a style one.

Sequencing is the hard part, not the loop. A greedy heuristic (land, then
highest castable CMC, prefer creatures) is an acceptable start. Mark it with a
`ponytail:` comment naming the ceiling and the upgrade path.

**Presentation is generated.** A deck suggestion has no single correct visual
form, and varying it per deck is the point. The model emits chart specs
(`{type, data, x, y}`); the web app renders them with one chart component.
Prefer a spec over a model-authored component. If a slide genuinely cannot be
expressed as a spec, render the component inside an iframe with no parent
access — never into the main document.

## Tool permissions — do not widen without reading this

`apps/web/src/server.ts` sets `permissionMode: "dontAsk"`, so an allowed tool
runs with no human in the loop. The allowlist is the entire boundary.

SECURITY: DO NOT add `Bash`, `Write`, `Edit`, or `WebFetch` to `allowedTools`.
Card oracle text, deck names, chat input, and uploaded images are all
untrusted input that reaches the model. Under `dontAsk`, a prompt injection in
any of them executes directly. `Bash` with no confirmation is arbitrary code
execution on the host as the logged-in user.

Current shape, and the reason for each part:

- Allowed: 19 of the 22 `mcp__scrychat__*` tools, plus `Read` and `Grep`.
  The 3 that are registered but NOT allowlisted are `collection_stats`,
  `deck_rename_tag` and `deck_set_card_count`. Counted from
  `apps/web/src/server.ts` and `packages/mcp/src/tools.ts` on 2026-10-10.
- Denied: `Bash`, `Write`, `Edit`, `NotebookEdit`, `WebFetch`, `WebSearch`,
  `Task`, `KillShell`.
- `deck_suggest` and `deck_suggestions` propose; they do not edit the deck.
  `deck_suggestion_decide` edits, but only on an explicit human accept. Keep
  that asymmetry — it is what lets a chat turn queue a change safely.

### If open-ended analysis is needed

The want is real: a question like "win rate by archetype over six months"
cannot be pre-written as a tool. Do not satisfy it by allowing `Bash`.

Use the hosted code execution tool instead. Code runs in Anthropic's sandbox,
not on this host, so a bad program cannot reach `decks/`, `data/`, or the
network. Its limit is that it sees only what is in the prompt — one deck fits,
a full collection history does not.

Only when the analysis must query the local SQLite mirror does a local sandbox
become justified. That is a separate container with no credentials and no
outbound network, with CPU and wall-clock limits, one process per call. It is
not `Bash`. Build it when the context limit actually blocks something, and not
before.

## Conventions

- pnpm only, never npm.
- A new branch via worktree before code changes. Never `git checkout -b` in a
  shared directory — another agent may hold it.
- One-time scripts: `tmp_*.ts`.
- Never modify user data (`decks/`, `chats/`, `data/`) to make a test pass.
  Snapshot first if a check must mutate.
- Non-trivial logic leaves one runnable check behind. The eval tiers in
  `evals/` are the existing pattern: Tier A golden set, Tier B mechanical
  formatting contracts, Tier C HTTP-level.
- A running MCP server or web app decides local-vs-live mirror once at first
  use, then re-decides when the database file changes.
  `maybeInvalidateOnMtimeChange` in `packages/core/src/local.ts:78` stats
  `DB_PATH` on a 5-second throttle (`STAT_THROTTLE_MS`), so a restart after an
  ingest is NOT needed. If a fresh mirror still looks empty after 5 seconds,
  the cause is elsewhere.

## Known trip-ups

- A stale `ANTHROPIC_API_KEY` in the environment overrides subscription auth
  and breaks web chat. `unset ANTHROPIC_API_KEY`.
- MTGA export needs front-face-only names; Arena's importer rejects
  `Front // Back`, which every other format round-trips.
- `linkifyPass` escalates to Haiku only for the ambiguous residue (words that
  are both a card name and ordinary English — "Opt", "Fog"). Prose with only
  unambiguous names never calls a model. Keep that gate; removing it makes
  every reply cost an extra call.
