# Deploying scrychat on the NAS (noel)

LAN-only, autostarting container. Single Node process serving the built UI and
spawning the MCP server as a stdio child.

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

ssh $NAS "mkdir -p $DEST/data $DEST/decks $DEST/chats $DEST/secrets"

# 1. Subscription credential (after a local `claude` browser login)
scp ~/.claude.json $NAS:$DEST/secrets/claude.json

# 2. Scryfall mirror — 208MB, gitignored, so it must be copied (not built)
scp data/scrychat.db $NAS:$DEST/data/scrychat.db

# 3. Your existing decks (optional; the app also creates new ones)
scp decks/*.json $NAS:$DEST/decks/ 2>/dev/null || true
```

Point compose at those host paths with an `.env` next to `docker-compose.yml`
on the NAS (checkout of the repo, or just the compose file + Dockerfile + repo):

```sh
# /volume1/docker/scrychat/.env
SCRYCHAT_CLAUDE_CREDENTIAL=/volume1/docker/scrychat/secrets/claude.json
SCRYCHAT_DATA_DIR=/volume1/docker/scrychat/data
SCRYCHAT_DECKS_DIR=/volume1/docker/scrychat/decks
SCRYCHAT_CHATS_DIR=/volume1/docker/scrychat/chats
```

If you skip the `.env`, compose falls back to `./data`, `./decks`, `./chats`,
and `./secrets/claude.json` relative to the compose file.

## Build and run

```sh
docker compose up -d --build
docker compose logs -f          # watch it boot; look for "mcp server:" + listen line
```

`restart: unless-stopped` makes it **autostart** with the Docker daemon on the
NAS (survives reboots and crashes; stays down only if you `docker compose stop`).

Reach it on the LAN at `http://noel:8787/`.

## Notes / gotchas

- **Architecture:** the image compiles `better-sqlite3` from source, so build it
  ON the NAS (`--build` as above). Don't build on your Mac (arm64) and run on an
  x86 NAS — the native binary won't match. Building on-device sidesteps this.
- **DB path is fixed.** The mirror MUST be at `/app/data/scrychat.db` inside the
  container (resolved from the repo root; no env override). The compose mount
  handles this — don't move it.
- **Do not expose to the internet.** Personal subscription quota is spent by
  anyone who can reach the app. Keep it LAN-only, or put an authenticating
  reverse proxy in front.
- **Refreshing card data:** re-run the ingest locally, then re-copy
  `data/scrychat.db` to the NAS and `docker compose restart`. The server detects
  the DB mtime change and reopens it.
- **Config:** `scrychat.config.json` (`linkifyPass: true`) is baked into the
  image at the repo root. Change it in the repo and rebuild to alter behavior.
