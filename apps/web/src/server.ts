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
  const { message, sessionId, activeDeck } = req.body ?? {};
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

  let prompt = message;
  const recentActions = recentActionsFor(clientSessionId);
  let contextLine: string | null = null;
  if (typeof activeDeck === "string" && activeDeck.length > 0) {
    try {
      const deck = await getDeck(activeDeck, DECKS_DIR);
      if (deck) {
        const cardCount = deck.cards.reduce((n, c) => n + (c.count ?? 1), 0) + 1; // +1 for commander
        contextLine = `[UI context: the user has deck "${deck.name}" (commander: ${deck.commander}, ${cardCount} cards) open in the deck panel. Treat ambiguous references — "my deck", the commander's name, "my payoffs" — as referring to this deck; call deck_get "${deck.name}" for its current list before answering deck-specific questions. The user may still ask about unrelated cards/decks; this is context, not a restriction.`;
      }
    } catch {
      // tolerate missing/unreadable deck: ignore and fall back to plain message
    }
  }
  if (recentActions.length > 0) {
    const actionsText = `Recent UI actions since your last message: ${recentActions.join("; ")}.`;
    contextLine = contextLine ? `${contextLine} ${actionsText}` : `[UI context: ${actionsText}`;
  }
  if (contextLine) {
    prompt = `${contextLine}]\n\n${message}`;
  }

  try {
    const q = query({
      prompt,
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

// ---- UI action log: recent deck CRUD, surfaced to chat as context ----
// Indices are absolute (monotonic `pushed` count), not array positions, so
// trimming the array to ACTION_LOG_MAX entries never desyncs lastSeenMap.
const ACTION_LOG_MAX = 50;
const actionLog: { t: number; text: string }[] = [];
let pushed = 0; // total entries ever logged
const lastSeenMap = new Map<string, number>(); // clientSessionId -> absolute index seen so far

function logAction(text: string): void {
  actionLog.push({ t: Date.now(), text });
  pushed++;
  if (actionLog.length > ACTION_LOG_MAX) actionLog.shift();
}

function recentActionsFor(clientSessionId: string): string[] {
  const oldestIndex = pushed - actionLog.length;
  const defaultSeen = Math.max(oldestIndex, pushed - 5);
  const seen = lastSeenMap.get(clientSessionId) ?? defaultSeen;
  const fromIdx = Math.max(0, seen - oldestIndex);
  const entries = actionLog.slice(fromIdx).map((e) => e.text);
  lastSeenMap.set(clientSessionId, pushed);
  return entries;
}

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
    logAction(`created deck "${deck.name}" (commander ${deck.commander})`);
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
    for (const c of result.added) {
      logAction(`added "${c.name}"${c.role ? ` (${c.role})` : ""} to "${req.params.name}"`);
    }
    for (const r of result.rejected) {
      logAction(`tried to add "${r.name}" to "${req.params.name}" — rejected: ${r.reason}`);
    }
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
    for (const name of cards) {
      logAction(`removed "${name}" from "${req.params.name}"`);
    }
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
    logAction(`deleted deck "${req.params.name}"`);
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
