# Multi-user scrychat (draft plan)

Status: Phases 1-2 built (lockdown, per-user storage). Phase 3 not yet. Phases 4-5 are owner actions on the NAS.

Goal: a few friends use scrychat at `scrychat.evangelista.moe`, each with
their own decks and chats, all on the owner's Claude subscription. Private
use, not a service.

## Risk the owner must accept first

One Max subscription credential that serves several people is account
sharing under the Anthropic consumer terms. It can also break the policy for
subscription auth in the Agent SDK. The owner is accountable for every prompt
a friend sends, and the account is at risk. The design below limits the
damage (few users, budgets, no file access). It does not make the use
compliant. This is the owner's decision.

## Today (facts, 2026-10-23)

- No identity code. Any caller can list, open, continue or delete any chat
  (`apps/web/src/server.ts` `/api/chats*`, chat id comes from the client).
- Port 8787 is published on the LAN, so a LAN client skips Cloudflare Access.
  The tunnel route is `http://noel:8787` (host port).
- `allowedTools` includes `Read` and `Grep` with no path limit. They reach
  `/home/scrychat/.claude.json` (the OAuth credential), all chats, all SDK
  transcripts and `/proc/self/environ`.
- Paths are module constants from `REPO_ROOT` (`server.ts:72-80`). Core deck
  and suggestion functions already take a directory parameter.
  `collection.ts:23` `COLLECTION_PATH` is a constant.
- The MCP child uses `process.cwd()` for decks, suggestions and config, and
  calls `getOwnedIndex()` with no path (`packages/mcp/src/tools.ts:56,59,70,93,205,229,293`).
- Globals shared by all callers: `actionLog` (put into every chat prompt),
  `deckHistory`, `sessionMap`, `activeTurns`, `/api/deck-events` broadcasts
  every deck change.
- No concurrency cap, no per-user budget, no handling of usage-limit errors.
- Not mounted, so lost on each container recreate: `suggestions/`,
  `collection.json`, `scrychat.config.json`.

## Decisions

1. **Identity: verify `Cf-Access-Jwt-Assertion`.** Check the signature
   against `https://yeetst.cloudflareaccess.com/cdn-cgi/access/certs`, `aud`
   = the Access app AUD tag, `iss` = the team domain. Use `jose` (new
   dependency; it handles key rotation). No valid JWT: 401. The user id is
   the email in the JWT, lowercased, limited to `[a-z0-9@._-]`.
   Rejected: trust the `Cf-Access-Authenticated-User-Email` header. It is
   plain text, and anything that reaches the container can forge it.
2. **Close the LAN port.** Remove the `8787:8787` publish. Join the
   `cloudflare-cloudflared-1` container to the scrychat compose network.
   Change the tunnel route in the Cloudflare dashboard from
   `http://noel:8787` to `http://scrychat:8787` (owner action).
3. **Allowlist = the Access policy.** The app knows only `OWNER_EMAIL`. To
   add or remove a friend, edit the Access policy.
4. **Storage per user:** one mount `users/`, layout
   `users/<email>/{decks,chats,suggestions,collection.json,scrychat.config.json}`.
   Only `data/` (Scryfall mirror) stays shared. This also fixes the deck name
   collision and the loss of suggestions, collection and config on deploy.
5. **The MCP child gets its root from env.** Pass `mcpServers` inline in
   `query()` with `env: { SCRYCHAT_ROOT: userRoot }`. In the MCP, one constant
   `ROOT = process.env.SCRYCHAT_ROOT ?? process.cwd()` feeds all path sites.
   SDK `cwd` stays `REPO_ROOT`, so skills still load.
6. **Remove `Read` and `Grep` from `allowedTools`.** The 23 MCP tools are the
   data surface. One dependency: `SKILL.md:16` points the model to
   `references/functional-tags.md`. Inline that content into `SKILL.md`, or
   leave it to `search_tags`.
7. **Settings, collection and suggestions are per user.** No global layer.
8. **Every in-memory global is keyed by user:** `actionLog`, `deckHistory`
   (`user/deck`), `activeTurns` (1 turn per user). Chat ownership comes from
   the path: a chat id resolves only under `users/<email>/chats/`, so other
   users' ids give 404. SSE: one recursive `fs.watch(users/)`, filtered per
   connection by the user's prefix.
9. **Shared-subscription limits:**
   - `MAX_CONCURRENT_TURNS=2` for all users. Over the cap: `done.error` "busy, retry".
   - `DAILY_TURNS=40` per user, owner exempt. In memory; resets on restart
     (`ponytail:` comment; persist in `users/<email>/usage.json` if needed).
   - Usage-limit error from the SDK: set `pausedUntil` (reset time from the
     error, else 15 min). Non-owner turns are refused until then. The owner
     can still try.
10. **Migration, once at startup.** If `users/<OWNER_EMAIL>` does not exist
    and legacy `decks/` exists, move decks, chats, suggestions,
    collection.json and config into it. Old `sdkSessionId`s whose transcripts
    were in the container layer must fall back to a fresh session and keep
    the chat JSON (`server.ts:356`; check that the fallback exists).
11. **Admin = `OWNER_EMAIL`:** exempt from budget and pause, plus
    `GET /api/admin/usage` (counts, `pausedUntil`, active turns). User
    management stays in the Access dashboard.

Skipped: deck sharing between users (use export/import), roles, an admin UI,
a CSRF token (the app reads no auth cookie).

## Changeset

| Phase | File | Change |
|---|---|---|
| 1 (built) | `docker-compose.yml` | Drop the `8787` publish. Replace the `decks`, `chats` mounts with `users/`. Add `OWNER_EMAIL`, `CF_TEAM`, `CF_AUD`. Add the network that cloudflared joins. |
| 1 (built) | `apps/web/src/auth.ts` (new) | `requireUser` middleware: verify the JWT with `jose`, set `req.user`. Unit test with a local JWKS. |
| 1 (built) | `apps/web/src/server.ts` | Mount `requireUser` on `/api/*` and `/suggestions`. Remove `"Read"`, `"Grep"` from `allowedTools`. Startup migration (code in `users-core.ts`, wired at startup in Phase 2). |
| 1 (built) | `.claude/skills/edh-deck-builder/SKILL.md` | Inline what the model needs from `references/functional-tags.md`. |
| 2 (built) | `apps/web/src/server.ts` | `userRoot(req)`. Replace `DECKS_DIR`, `CHATS_DIR`, `SUGGESTIONS_DIR`, `CONFIG_PATH`, `COLLECTION_PATH` uses with per-request paths. Inline `mcpServers` with `env.SCRYCHAT_ROOT`. Key `actionLog`, `deckHistory`, `activeTurns` by user. Recursive watch + filter in `/api/deck-events`. |
| 2 (built) | `packages/core/src/collection.ts` | Callers pass the collection path. Keep the default only for the CLI. |
| 2 (built) | `packages/mcp/src/tools.ts` | `ROOT` from `SCRYCHAT_ROOT`. Use it at lines 56, 59, 70, 93. Pass `join(ROOT,"collection.json")` to `getOwnedIndex` at 205, 229, 293. |
| 2 (built) | `apps/web/src/deck-history-core.ts` | No change; callers key by `user/deck`. |
| 3 | `apps/web/src/server.ts` | Turn semaphore, daily budget, `pausedUntil`, `GET /api/admin/usage`. Pure helpers in a `*-core.ts` with tests. |
| 1-3 | `docs/deploy-nas.md` | New mounts, env, tunnel route, security gate record. |

## Phases and exit checks

| Phase | Exit check |
|---|---|
| 1 Lockdown (owner only) | From another LAN host, port 8787 is refused. A direct request with a forged email header gives 401. Chat "read ~/.claude.json": the tool is not available. Owner decks and chats are present. Skills still load. |
| 2 Per user | With 2 Access identities the owner controls: B cannot list, open or delete A's chats (404). The MCP deck list for B shows only B's decks. B's deck change does not reach A's SSE. B's actions are not in A's prompt. |
| 3 Limits | A 3rd concurrent turn is refused. The budget stops at N. A simulated usage-limit error pauses non-owner turns; the owner can still chat. |
| 4 Security gate | Run the phase 1 and 2 checks again on the deployed container. The deployed `allowedTools` has no `Read`/`Grep`. `docker inspect` shows no host port 8787. The owner accepts the risk section. Record the results in `docs/deploy-nas.md`. |
| 5 Invite | Add friend 1 to the Access policy. The friend sees an empty workspace. |

Phase 3 comes before the gate on purpose: 1 friend can use up the 5-hour
quota window on day 1.
