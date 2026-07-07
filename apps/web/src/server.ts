import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import type { Request, Response } from "express";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  getCard,
  listDecks,
  getDeck,
  deckReport,
  createDeck,
  addCards,
  removeCards,
  deleteDeck,
  type CardResolver,
} from "@scrychat/core";

// CRITICAL: strip stale ANTHROPIC_API_KEY / ANTHROPIC_AUTH_TOKEN from the
// process env at startup, before anything else touches process.env or the
// SDK. This machine has a stale ANTHROPIC_API_KEY that 401s; the Agent SDK
// must run on subscription (Max) auth, not API billing.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const SDK_ENV: Record<string, string | undefined> = { ...process.env };
delete SDK_ENV.ANTHROPIC_API_KEY;
delete SDK_ENV.ANTHROPIC_AUTH_TOKEN;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../../../");
const DECKS_DIR = path.join(REPO_ROOT, "decks");
const MCP_SERVER_PATH = path.join(REPO_ROOT, "packages/mcp/dist/index.js");

const PORT = 8787;

const app = express();
app.use(express.json());

// ---- session management: sessionId -> SDK session id for resume ----
const SESSION_MAP_MAX = 100;
const sessionMap = new Map<string, string>();

function setSession(clientSessionId: string, sdkSessionId: string): void {
  sessionMap.delete(clientSessionId); // reinsert at newest position
  sessionMap.set(clientSessionId, sdkSessionId);
  if (sessionMap.size > SESSION_MAP_MAX) {
    const oldest = sessionMap.keys().next().value;
    if (oldest !== undefined) sessionMap.delete(oldest);
  }
}

function sseWrite(res: Response, event: Record<string, unknown>): void {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

app.post("/api/chat", async (req: Request, res: Response) => {
  const { message, sessionId } = req.body ?? {};
  if (typeof message !== "string" || message.length === 0) {
    res.status(400).json({ error: "message is required" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const clientSessionId: string = typeof sessionId === "string" ? sessionId : crypto.randomUUID();
  const resumeSdkSessionId = sessionMap.get(clientSessionId);

  try {
    const q = query({
      prompt: message,
      options: {
        cwd: REPO_ROOT,
        env: SDK_ENV,
        resume: resumeSdkSessionId,
        settingSources: ["project"],
        mcpServers: {
          scrychat: {
            type: "stdio",
            command: "node",
            args: [MCP_SERVER_PATH],
          },
        },
        allowedTools: [
          "mcp__scrychat__search_cards",
          "mcp__scrychat__get_card",
          "mcp__scrychat__search_tags",
          "mcp__scrychat__find_alternatives",
          "mcp__scrychat__find_combos",
          "mcp__scrychat__deck_list",
          "mcp__scrychat__deck_create",
          "mcp__scrychat__deck_get",
          "mcp__scrychat__deck_add",
          "mcp__scrychat__deck_remove",
          "Read",
          "Grep",
        ],
        disallowedTools: [
          "Bash",
          "Write",
          "Edit",
          "NotebookEdit",
          "WebFetch",
          "WebSearch",
          "Task",
          "KillShell",
        ],
        permissionMode: "dontAsk",
      },
    });

    res.on("close", () => {
      if (!res.writableEnded) {
        void q.interrupt();
      }
    });

    for await (const msg of q) {
      if (res.writableEnded) break;
      if (msg.type === "system" && msg.subtype === "init") {
        setSession(clientSessionId, msg.session_id);
      }

      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            sseWrite(res, { type: "text-delta", text: block.text });
          } else if (block.type === "tool_use") {
            sseWrite(res, { type: "tool-use", name: block.name, input: block.input });
          }
        }
      }

      if (msg.type === "result") {
        setSession(clientSessionId, msg.session_id);
        sseWrite(res, {
          type: "done",
          sessionId: clientSessionId,
          result: msg.subtype === "success" ? msg.result : null,
          isError: msg.is_error,
        });
      }
    }
  } catch (err) {
    sseWrite(res, { type: "done", error: err instanceof Error ? err.message : String(err) });
  } finally {
    res.end();
  }
});

// ---- decks API, backed directly by @scrychat/core ----
const resolverCache = new Map<string, Awaited<ReturnType<CardResolver>>>();

const resolver: CardResolver = async (name: string) => {
  const key = name.toLowerCase();
  const cached = resolverCache.get(key);
  if (cached !== undefined) return cached;
  const card = await getCard(name);
  const resolved = card
    ? {
        name: card.name,
        colorIdentity: card.colorIdentity,
        cmc: card.cmc,
        typeLine: card.typeLine,
        legalCommander: card.legalCommander,
        image: card.image,
      }
    : null;
  resolverCache.set(key, resolved);
  return resolved;
};

app.get("/api/decks", async (_req: Request, res: Response) => {
  try {
    const decks = await listDecks(DECKS_DIR);
    res.json(decks.map((d) => ({ name: d.name, commander: d.commander, updatedAt: d.updatedAt })));
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/decks/:name", async (req: Request, res: Response) => {
  try {
    const deck = await getDeck(req.params.name, DECKS_DIR);
    if (!deck) {
      res.status(404).json({ error: "Deck not found" });
      return;
    }
    const report = await deckReport(req.params.name, resolver, DECKS_DIR);

    const commanderResolved = await resolver(deck.commander);
    const cardsWithImages = await Promise.all(
      deck.cards.map(async (c) => {
        const resolved = await resolver(c.name);
        return { ...c, image: resolved?.image ?? null };
      })
    );
    const deckWithImages = {
      ...deck,
      commanderImage: commanderResolved?.image ?? null,
      cards: cardsWithImages,
    };

    res.json({ deck: deckWithImages, report });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/decks", async (req: Request, res: Response) => {
  try {
    const { name, commander } = req.body ?? {};
    if (typeof name !== "string" || typeof commander !== "string") {
      res.status(400).json({ error: "name and commander are required" });
      return;
    }
    const deck = await createDeck(name, commander, resolver, DECKS_DIR);
    res.json({ deck });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/decks/:name/cards", async (req: Request, res: Response) => {
  try {
    const { cards } = req.body ?? {};
    if (!Array.isArray(cards)) {
      res.status(400).json({ error: "cards array is required" });
      return;
    }
    const result = await addCards(req.params.name, cards, resolver, DECKS_DIR);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.delete("/api/decks/:name/cards", async (req: Request, res: Response) => {
  try {
    const { cards } = req.body ?? {};
    if (!Array.isArray(cards)) {
      res.status(400).json({ error: "cards array is required" });
      return;
    }
    const deck = await removeCards(req.params.name, cards, DECKS_DIR);
    res.json({ deck });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.delete("/api/decks/:name", async (req: Request, res: Response) => {
  try {
    const ok = await deleteDeck(req.params.name, DECKS_DIR);
    if (!ok) {
      res.status(404).json({ error: "Deck not found" });
      return;
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---- deck-events SSE: watch decks/ dir for changes ----
app.get("/api/deck-events", (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  fs.mkdirSync(DECKS_DIR, { recursive: true });
  const watcher = fs.watch(DECKS_DIR, (_eventType, filename) => {
    if (!filename || !filename.endsWith(".json") || filename.startsWith(".tmp-")) return;
    const name = filename.replace(/\.json$/, "");
    sseWrite(res, { name });
  });

  req.on("close", () => {
    watcher.close();
  });
});

// ---- static UI (built by apps/web/ui -> ui/dist) ----
const UI_DIST = path.resolve(__dirname, "../ui/dist");
app.use(express.static(UI_DIST));

// SPA fallback: serve index.html for any non-API GET
app.get(/^\/(?!api\/).*/, (_req: Request, res: Response) => {
  res.sendFile(path.join(UI_DIST, "index.html"), (err) => {
    if (err) res.status(404).send("UI not built. Run: pnpm --filter @scrychat/web build");
  });
});

app.listen(PORT, () => {
  console.log(`scrychat web listening on http://localhost:${PORT}`);
  console.log(`repo root: ${REPO_ROOT}`);
  console.log(`mcp server: ${MCP_SERVER_PATH}`);
});
