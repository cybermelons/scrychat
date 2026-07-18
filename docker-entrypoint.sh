#!/bin/sh
# Runs as root, fixes ownership on the bind-mounted state dirs, then drops to
# the unprivileged `scrychat` user via gosu.
#
# WHY: decks/chats/data are bind-mounted from the host (see docker-compose.yml).
# A bind mount keeps the HOST directory's uid/gid, which almost never matches the
# in-image `scrychat` system user. That mismatch makes the mounts unwritable, so
# atomicWrite() in packages/core/src/decks.ts fails with EACCES when it tries to
# create its `.tmp-*` file (the "/app/decks/.tmp..." permission error). chown-ing
# to scrychat here makes writes work regardless of the host owner.
set -e

for dir in /app/decks /app/chats /app/data; do
  # Only if it exists; -R is cheap for these small dirs (the 208MB DB dir has
  # few entries). Ignore failures on read-only mounts so the app still starts.
  [ -d "$dir" ] && chown -R scrychat:scrychat "$dir" 2>/dev/null || true
done

# The subscription credential is a single mounted file; the SDK refreshes it in
# place, so it must be writable by scrychat too.
[ -e /home/scrychat/.claude.json ] && chown scrychat:scrychat /home/scrychat/.claude.json 2>/dev/null || true

exec gosu scrychat "$@"
