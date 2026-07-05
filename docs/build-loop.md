# scrychat build loop

Instructions for the orchestrator session (Opus). You orchestrate; you do not write code.
Read `docs/design.md` first. Implementation is delegated to Sonnet subagents (init with /caveman).
Fable produced the design and this loop; escalate to the user only on design flaws or scope changes.

## Roles

| Role | Who | Does | Never does |
|------|-----|------|------------|
| Designer | Fable (done) | design.md, this loop, eval set | look at code |
| Orchestrator | Opus (you) | decompose → brief → gate → review → commit | write code |
| Implementer | Sonnet subagent | one work unit per dispatch, runs its own acceptance | expand scope |
| Reviewer | code-reviewer subagent | diff review per work unit | restyle working code |

## Work units (Phase 1)

Execute in order; WU3a/3b/4 may run as parallel subagents after WU2 (disjoint files).

1. **WU1 scaffold** — pnpm workspace, packages/core + packages/mcp stubs, tsconfig, .gitignore, .mcp.json. Accept: `pnpm install && pnpm -r build` clean.
2. **WU2 tag index** — `packages/core/scripts/build-tag-index.ts`; commit generated `tags.json` + `.claude/skills/edh-deck-builder/references/functional-tags.md`. Accept: index contains `token-doubler` with ~15 members; no `cycle-*` slugs.
3. **WU3a core clients** — scryfall.ts (User-Agent header, pagination), spellbook.ts, tags.ts, alternatives.ts. Accept: vitest integration tests hit live APIs (see golden set, tier A rows 1–4).
4. **WU3b deck module** — decks.ts: JSON CRUD under `decks/`, identity/singleton/legality validation, quota+curve report. Accept: unit tests incl. rejection of off-identity add.
5. **WU4 MCP server** — packages/mcp, 8 tools per design.md contract, compact JSON. Accept: scripted JSON-RPC round-trip (initialize → tools/list → tools/call search_cards).
6. **WU5 skill** — SKILL.md per design.md §Skill. Accept: reviewer checks it against the recipes in design.md; no invented tag slugs (every slug greps in functional-tags.md).
7. **WU6 wire-up** — `claude mcp list` shows scrychat connected; run tier-A eval script end-to-end.

## The inner loop (per work unit)

```
brief → implement → gate → review → commit
          ▲            │        │
          └── failure ─┴────────┘   (max 3 round-trips, then STOP and reassess)
```

1. **Brief.** Write the subagent prompt: goal, exact files, interfaces copied from design.md (don't make the subagent re-derive them), the acceptance command, and "run the acceptance before returning."
2. **Implement.** Dispatch Sonnet. One WU per subagent; fresh subagent per retry with the failure output pasted in.
3. **Gate (mechanical).** You run: `pnpm -r build`, `pnpm -r test`, plus the WU's acceptance command. Any failure → back to 2 with the verbatim output. Never mark a WU done on the subagent's claim alone.
4. **Review.** code-reviewer subagent on `git diff`. Blocking findings → back to 2. Style-only findings → note, don't loop.
5. **Commit.** Atomic, one WU per commit, format per global config (Claude + Happy co-credit).

**Stuck rule:** 3 failed round-trips on the same WU = stop looping. Diagnose whether the brief is wrong (rewrite it), the design is wrong (escalate to user/Fable — do not silently redesign), or the environment is wrong (fix, e.g. pnpm 10 `onlyBuiltDependencies` for better-sqlite3 in Phase 3).

## The phase gate (eval-driven)

After all WUs in a phase, run `evals/golden.md`:

- **Tier A (mechanical):** script calls MCP tools directly and asserts golden facts. Must be 100% green.
- **Tier B (behavioral):** fresh Claude Code session in this repo, run each golden prompt, judge the transcript against its rubric. This is the product bar.

**Failure routing — the important part.** Classify every tier-B failure before fixing:

| Symptom | Layer | Fix |
|---------|-------|-----|
| Tool returned wrong/missing data | code | reopen the WU (inner loop) |
| Model guessed a tag slug, skipped search_tags, ignored quotas, answered from memory | skill | edit SKILL.md and re-run the eval — cheapest loop, try this first |
| Right behavior impossible with current tools | design | escalate to user/Fable |

Most behavioral failures should be fixed in the skill, not the code. Do not let a subagent "fix" a prompt problem by adding code.

Phase green → ask the user about a PIR (per global config), then proceed to the next phase's WUs (Phase 2: verify Agent SDK subscription auth FIRST — it is the linchpin; if it fails, stop and escalate options).

## Standing rules

- pnpm only. New branch per phase (`phase-1-core`, ...). No file deletion before migration.
- Subagents get /caveman by default; briefs stay imperative and self-contained (a subagent never reads this file).
- Every loop iteration leaves the repo green (build + tests pass) or the WU is explicitly reverted.
