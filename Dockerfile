# syntax=docker/dockerfile:1

# ---- build stage: install workspace deps, compile native modules, build all ----
# better-sqlite3 is a native addon (see root package.json onlyBuiltDependencies),
# so the build stage needs python3 + a C/C++ toolchain to compile it from source.
# Building from source means the compiled binary matches whatever arch this image
# is built for (x86_64 or arm64), which is what you want on a NAS.
FROM node:24-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# pnpm via corepack (repo uses pnpm workspaces; no packageManager pin, so match dev: 10.x)
RUN corepack enable && corepack prepare pnpm@10.11.1 --activate

WORKDIR /app

# Copy manifests first for layer caching, then install the whole workspace.
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/core/package.json packages/core/
COPY packages/mcp/package.json packages/mcp/
COPY apps/web/package.json apps/web/
# NOTE: apps/web/ui is a subfolder of the apps/web package (built by its
# `tsc -p ui && vite build ui` script), NOT a separate workspace package — it
# has no package.json of its own, so there is nothing to copy for it here.

# Full install (incl. dev deps: tsc/vite are needed to build). Native build for
# better-sqlite3 is allowed via the root package.json onlyBuiltDependencies.
RUN pnpm install --frozen-lockfile || pnpm install

# Now the sources and build everything (tsc for core/mcp/server + vite for the UI).
COPY . .
RUN pnpm -r build

# ---- runtime stage: slim node, no toolchain ----
FROM node:24-bookworm-slim AS runtime

# libstdc++ is already present in the node image; better-sqlite3's prebuilt
# .node from the build stage runs against it. No compiler needed at runtime.
RUN corepack enable && corepack prepare pnpm@10.11.1 --activate \
  && groupadd -r scrychat && useradd -r -g scrychat -m -d /home/scrychat scrychat

WORKDIR /app

# Copy the built workspace from the build stage (dist output + pruned node_modules).
COPY --from=build --chown=scrychat:scrychat /app /app

ENV NODE_ENV=production
ENV PORT=8787
# HOME is where the Agent SDK looks for subscription auth (~/.claude.json).
# The credential is mounted as a volume at runtime (see docker-compose.yml).
ENV HOME=/home/scrychat

EXPOSE 8787

# The server serves the built UI and spawns the MCP server as a node stdio child.
# Repo root is discovered by walking up to pnpm-workspace.yaml (see
# packages/core/src/db/connection.ts), which resolves to /app. So the DB lives at
# /app/data/scrychat.db and decks/chats/config at /app/ — these are the volume
# mount targets (see docker-compose.yml). No env override exists for these paths.
WORKDIR /app/apps/web
USER scrychat

CMD ["node", "dist/server.js"]
