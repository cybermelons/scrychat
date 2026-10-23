# Deploying scrychat on the NAS (noel)

Autostarting container behind Cloudflare Access (no published host port). Single
Node process serving the built UI and spawning the MCP server as a stdio child.
Multi-user design and rationale: `docs/multi-user.md`.

## The one thing that makes this non-trivial: auth

scrychat runs the Claude Agent SDK on your **Max subscription**, not an API key.
The server deliberately strips `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` at
startup (`apps/web/src/server.ts`). The subscription credential lives in
`~/.claude.json` on the machine where you ran `claude` login. The container has
no browser, so that file must be provided as a mounted volume.

You said you'll auth via browser — do that **once**, then copy the resulting
credential to the NAS (it refreshes in place afterward because the mount is
read-write).

## One-time setup on the NAS

Pick a host dir, e.g. `/volume1/docker/scrychat`. Create the layout and copy in
the state that isn't in the repo (the DB, decks, and credential):

```sh
# on your Mac
NAS=noel                      # or user@noel
DEST=/volume1/docker/scrychat

ssh $NAS "mkdir -p $DEST/data $DEST/users $DEST/secrets"

# 1. Subscription credential (after a local `claude` browser login)
scp ~/.claude.json $NAS:$DEST/secrets/claude.json

# 2. Scryfall mirror — 208MB, gitignored, so it must be copied (not built)
scp data/scrychat.db $NAS:$DEST/data/scrychat.db

# 3. Existing single-user data: see "Migrating from the single-user layout"
#    below. New installs need nothing here; users/<email>/ is created on first use.
```

Point compose at those host paths with an `.env` next to `docker-compose.yml`
on the NAS (checkout of the repo, or just the compose file + Dockerfile + repo):

```sh
# /volume1/docker/scrychat/.env
SCRYCHAT_CLAUDE_CREDENTIAL=/volume1/docker/scrychat/secrets/claude.json
SCRYCHAT_DATA_DIR=/volume1/docker/scrychat/data
SCRYCHAT_USERS_DIR=/volume1/docker/scrychat/users
OWNER_EMAIL=you@example.com          # admin: exempt from budget/pause, sees /api/admin/usage
CF_AUD=<Access application AUD tag>  # Zero Trust > Access > Applications > scrychat > Overview
# Legacy mounts, only until the migration is verified:
SCRYCHAT_DECKS_DIR=/volume1/docker/scrychat/decks
SCRYCHAT_CHATS_DIR=/volume1/docker/scrychat/chats
```

`CF_TEAM` is fixed in the compose file (`yeetst.cloudflareaccess.com`). Compose
refuses to start without `OWNER_EMAIL` and `CF_AUD`. **Never set
`SCRYCHAT_DEV_USER` on the NAS**: it turns authentication off.

If you skip the `.env`, compose falls back to `./data`, `./users`, `./decks`, `./chats`,
and `./secrets/claude.json` relative to the compose file.

## Network and tunnel

The container publishes no host port. cloudflared reaches it over an external
docker network:

```sh
docker network create scrychat-net                       # once
docker network connect scrychat-net cloudflare-cloudflared-1   # once; redo if cloudflared is recreated
```

Then, in the Cloudflare dashboard (owner action), change the tunnel public
hostname `scrychat.evangelista.moe` service from `http://noel:8787` to
`http://scrychat:8787`. The Access policy is the allowlist: to add or remove a
friend, edit the policy (Zero Trust > Access > Applications > scrychat). The app
knows only `OWNER_EMAIL`.

## Build and run

```sh
docker network create scrychat-net 2>/dev/null || true
docker compose up -d --build
docker compose logs -f          # look for "auth: Cloudflare Access", "migration:", "mcp server:"
```

`restart: unless-stopped` makes it **autostart** with the Docker daemon on the
NAS (survives reboots and crashes; stays down only if you `docker compose stop`).

Reach it at `https://scrychat.evangelista.moe/` (Access login). `http://noel:8787/`
no longer answers by design.

## Migrating from the single-user layout

On the first start with `OWNER_EMAIL` set, if `users/<OWNER_EMAIL>` does not
exist and the legacy `decks/` mount exists, the app COPIES decks, chats,
suggestions, collection.json and scrychat.config.json (whichever exist) into
`users/<OWNER_EMAIL>/`. It never deletes the originals and never runs twice.
Old `sdkSessionId`s whose transcripts lived in the old container layer fall back
to a fresh SDK session on first resume; the chat JSON is kept.

After verifying the owner sees their decks and chats, delete the two legacy
mount lines in `docker-compose.yml` (and the old dirs on the NAS when you are
sure). `suggestions/`, `collection.json` and the config were never mounted
before, so they only migrate if they exist in the image layer being replaced;
copy them out of the old container first (`docker cp`) if you want them.

## Limits (shared subscription)

In memory, reset on restart: 2 concurrent turns for everyone, 1 turn per user,
40 turns/day per non-owner user. A usage-limit error from the SDK pauses all
non-owner turns until the reset time (else 15 min); the owner can still chat.
`GET /api/admin/usage` (owner only) shows counts, `pausedUntil`, active turns.

## Phase 4 security gate (NOT RUN yet; run on the deployed container, record results here)

- [ ] From another LAN host, `curl http://noel:8787/` is refused.
- [ ] `docker inspect scrychat` shows no host port binding for 8787.
- [ ] Direct request into the container network with a forged
      `Cf-Access-Authenticated-User-Email` header and no JWT gives 401.
- [ ] Chat "read ~/.claude.json": the tool is not available.
- [ ] Owner decks and chats are present after migration; skills still load.
- [ ] With two Access identities you control: B cannot list, open or delete A's
      chats (404); B's `deck_list` shows only B's decks; B's deck change does
      not reach A's `/api/deck-events`; B's actions are absent from A's prompt.
- [ ] A 3rd concurrent turn is refused; the daily budget stops at 40; a
      simulated usage-limit error pauses non-owner turns but not the owner.
- [ ] The deployed `allowedTools` has no `Read`/`Grep`
      (`docker exec scrychat grep -c '"Read"' /app/apps/web/dist/tools-core.js` is 0).
- [ ] Owner has accepted the account-sharing risk section of `docs/multi-user.md`.

Results (date, who, pass/fail per line): _pending_

## Notes / gotchas

- **Architecture:** the image compiles `better-sqlite3` from source, so build it
  ON the NAS (`--build` as above). Don't build on your Mac (arm64) and run on an
  x86 NAS — the native binary won't match. Building on-device sidesteps this.
- **DB path is fixed.** The mirror MUST be at `/app/data/scrychat.db` inside the
  container (resolved from the repo root; no env override). The compose mount
  handles this — don't move it.
- **Do not publish a host port.** Anyone who reaches 8787 directly skips Cloudflare
  Access and spends the owner's subscription quota. Keep the tunnel as the only way in.
- **Refreshing card data:** re-run the ingest locally, then re-copy
  `data/scrychat.db` to the NAS and `docker compose restart`. The server detects
  the DB mtime change and reopens it.
- **Config:** per user, `users/<email>/scrychat.config.json`, edited from the
  Settings panel. A new user starts with defaults.
