import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import type { Request, Response } from "express";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { getCard, listDecks, getDeck, deckReport, type CardResolver } from "@scrychat/core";

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
const sessionMap = new Map<string, string>();

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
        allowedTools: ["mcp__scrychat__*", "Read", "Grep"],
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
      },
    });

    for await (const msg of q) {
      if (msg.type === "system" && msg.subtype === "init") {
        sessionMap.set(clientSessionId, msg.session_id);
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
        sessionMap.set(clientSessionId, msg.session_id);
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
    res.json({ deck, report });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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

app.listen(PORT, () => {
  console.log(`scrychat web listening on http://localhost:${PORT}`);
  console.log(`repo root: ${REPO_ROOT}`);
  console.log(`mcp server: ${MCP_SERVER_PATH}`);
});
