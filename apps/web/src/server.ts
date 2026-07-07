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
const CHATS_DIR = path.join(REPO_ROOT, "chats");
const MCP_SERVER_PATH = path.join(REPO_ROOT, "packages/mcp/dist/index.js");
const CONFIG_PATH = path.join(REPO_ROOT, "scrychat.config.json");

const PORT = 8787;

// ---- config: scrychat.config.json at repo root, tolerate absent file ----
type ScrychatConfig = { linkifyPass: boolean };

const DEFAULT_CONFIG: ScrychatConfig = { linkifyPass: false };

function loadConfig(): ScrychatConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return {
      linkifyPass: typeof parsed.linkifyPass === "boolean" ? parsed.linkifyPass : DEFAULT_CONFIG.linkifyPass,
    };
  } catch {
    return DEFAULT_CONFIG;
  }
}

const config = loadConfig();
console.log(`scrychat config: linkifyPass=${config.linkifyPass}`);

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

// ---- chats: first-class local files, symmetrical with decks/ ----
type ChatSegment =
  | { type: "text"; text: string }
  | { type: "tool"; name: string; input: unknown; result?: string };

type ChatMsg = {
  role: "user" | "assistant";
  text: string;
  tools?: { name: string; input: unknown }[];
  segments?: ChatSegment[];
  activeDeck?: string;
  at: string;
};

const TOOL_RESULT_MAX_CHARS = 2048;

function truncateResult(s: string): string {
  return s.length > TOOL_RESULT_MAX_CHARS ? `${s.slice(0, TOOL_RESULT_MAX_CHARS)}…` : s;
}

// Extract a plain-text rendering of an SDK tool_result content block's `content`,
// which may be a string or an array of {type:"text", text} blocks.
function stringifyToolResultContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((c) => (c && typeof c === "object" && "text" in c ? String((c as any).text) : ""))
      .filter(Boolean)
      .join("\n");
  }
  try {
    return JSON.stringify(content);
  } catch {
    return String(content);
  }
}

type ChatFile = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sdkSessionId?: string;
  lastSeenActionIdx: number;
  messages: ChatMsg[];
  deckRefs?: string[];
};

// mirrors packages/core/src/decks.ts sanitizeName (not exported there)
function sanitizeName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Words (length >= 3) making up a deck/commander name, e.g. "Isshin, Two
// Heavens as One" -> ["isshin", "two", "heavens", "one"]. Used to detect a
// mention without requiring the full (often multi-word) name verbatim.
function nameWords(name: string): string[] {
  return name
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3);
}

// Recompute deckRefs for a chat: union of every message's activeDeck plus any
// deck whose name or commander is mentioned (case-insensitively, word-level)
// in any user message's text. Cheap: called on every append against the small
// deck list.
async function updateDeckRefs(chat: ChatFile): Promise<void> {
  const refs = new Set<string>();
  for (const m of chat.messages) {
    if (m.activeDeck) refs.add(sanitizeName(m.activeDeck));
  }
  try {
    const decks = await listDecks(DECKS_DIR);
    const userWords = new Set(
      chat.messages
        .filter((m) => m.role === "user")
        .flatMap((m) => nameWords(m.text))
    );
    if (userWords.size > 0) {
      for (const d of decks) {
        const candidateWords = [...nameWords(d.name), ...nameWords(d.commander)];
        if (candidateWords.some((w) => userWords.has(w))) {
          refs.add(sanitizeName(d.name));
        }
      }
    }
  } catch {
    // tolerate deck listing failures; keep activeDeck-derived refs
  }
  chat.deckRefs = [...refs];
}

async function atomicWrite(filePath: string, data: string): Promise<void> {
  const dir = path.dirname(filePath);
  const tmpPath = path.join(
    dir,
    `.tmp-${path.basename(filePath)}-${process.pid}-${Math.random().toString(36).slice(2)}`
  );
  await fs.promises.writeFile(tmpPath, data, "utf8");
  await fs.promises.rename(tmpPath, filePath);
}

const VALID_CHAT_ID = /^[a-z0-9][a-z0-9-]*$/;
function isValidChatId(id: unknown): id is string {
  return typeof id === "string" && id.length > 0 && id.length <= 128 && VALID_CHAT_ID.test(id);
}

function chatFilePath(id: string): string {
  if (!isValidChatId(id)) {
    throw new Error("invalid chat id");
  }
  return path.join(CHATS_DIR, `${id}.json`);
}

async function readChatFile(id: string): Promise<ChatFile | null> {
  try {
    const raw = await fs.promises.readFile(chatFilePath(id), "utf8");
    return JSON.parse(raw) as ChatFile;
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

async function writeChatFile(chat: ChatFile): Promise<void> {
  await fs.promises.mkdir(CHATS_DIR, { recursive: true });
  await atomicWrite(chatFilePath(chat.id), JSON.stringify(chat, null, 2));
}

function newChatId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function titleFromMessage(message: string): string {
  const t = message.trim().replace(/\s+/g, " ");
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
}

// ---- linkify post-pass (opt-in, see scrychat.config.json) ----
// Cheap gate: does the text look like it has a table row or list line? If
// so it's plausible bare card names slipped through (see issue #12) — worth
// the extra cheap-model pass. If not (plain prose), skip: the skill's [[...]]
// instruction almost always holds outside tabular/list contexts.
function looksTabularOrListy(text: string): boolean {
  return /^\s*\|.*\|\s*$/m.test(text) || /^\s*[-*+]\s+\S/m.test(text) || /^\s*\d+[.)]\s+\S/m.test(text);
}

const LINKIFY_TIMEOUT_MS = 10_000;
const LINKIFY_PROMPT_PREFIX =
  "Re-emit this text EXACTLY, but wrap every Magic: The Gathering card name that is not already " +
  "inside [[...]], ![[...]], or [[group:...]] in [[...]]. Change nothing else — same words, same " +
  "whitespace, same markdown, same order. Output only the rewritten text, nothing else.\n\n---\n\n";

// Runs the opt-in Haiku linkify pass over a finished assistant message's text
// segments. Returns the rewritten segments, or null on any failure/timeout —
// callers must treat null as "skip silently, original stands" per issue #12.
async function linkifySegments(segments: ChatSegment[]): Promise<ChatSegment[] | null> {
  const textSegments = segments.filter((s): s is { type: "text"; text: string } => s.type === "text");
  const combinedText = textSegments.map((s) => s.text).join("");
  if (!combinedText.trim() || !looksTabularOrListy(combinedText)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINKIFY_TIMEOUT_MS);
  try {
    const q = query({
      prompt: `${LINKIFY_PROMPT_PREFIX}${combinedText}`,
      options: {
        cwd: REPO_ROOT,
        env: SDK_ENV,
        model: "haiku", // cheap-model alias; see @anthropic-ai/claude-agent-sdk AgentDefinition.model
        maxTurns: 1,
        allowedTools: [],
        disallowedTools: ["Bash", "Read", "Write", "Edit", "NotebookEdit", "WebFetch", "WebSearch", "Task", "KillShell"],
        permissionMode: "dontAsk",
        abortController: controller,
      },
    });

    let rewritten = "";
    for await (const msg of q) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") rewritten += block.text;
        }
      }
    }
    clearTimeout(timer);
    if (!rewritten.trim()) return null;

    // Single combined text segment stood in for N text segments above; any
    // interleaved tool segments are preserved as-is, text segments collapse
    // into one rewritten block at the position of the first text segment.
    const firstTextIdx = segments.findIndex((s) => s.type === "text");
    if (firstTextIdx === -1) return null;
    const out: ChatSegment[] = [];
    let inserted = false;
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.type === "text") {
        if (!inserted) {
          out.push({ type: "text", text: rewritten });
          inserted = true;
        }
        // subsequent text segments are dropped: folded into the rewrite above
      } else {
        out.push(seg);
      }
    }
    return out;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

app.post("/api/chat", async (req: Request, res: Response) => {
  const { message, sessionId, activeDeck, chatId: reqChatId } = req.body ?? {};
  if (typeof message !== "string" || message.length === 0) {
    res.status(400).json({ error: "message is required" });
    return;
  }
  if (reqChatId !== undefined && reqChatId !== null && reqChatId !== "" && !isValidChatId(reqChatId)) {
    res.status(400).json({ error: "invalid chatId" });
    return;
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const clientSessionId: string = typeof sessionId === "string" ? sessionId : crypto.randomUUID();

  let chat: ChatFile | null =
    typeof reqChatId === "string" && reqChatId.length > 0 ? await readChatFile(reqChatId) : null;
  const isNewChat = !chat;
  const now = new Date().toISOString();
  if (!chat) {
    chat = {
      id: newChatId(),
      title: titleFromMessage(message),
      createdAt: now,
      updatedAt: now,
      lastSeenActionIdx: pushed - Math.min(pushed, 5),
      messages: [],
    };
  }
  const msgActiveDeck = typeof activeDeck === "string" && activeDeck.length > 0 ? activeDeck : undefined;
  chat.messages.push({ role: "user", text: message, activeDeck: msgActiveDeck, at: now });
  chat.updatedAt = now;
  await updateDeckRefs(chat);
  await writeChatFile(chat);

  if (isNewChat) {
    sseWrite(res, { type: "chat", chatId: chat.id });
  }

  // file wins for resume; sessionMap is a fallback for legacy/no-file clients
  const resumeSdkSessionId = chat.sdkSessionId ?? sessionMap.get(clientSessionId);

  let prompt = message;
  const recentActions = recentActionsForChat(chat);
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

  let assistantText = "";
  const assistantTools: { name: string; input: unknown }[] = [];
  const segments: ChatSegment[] = [];
  // tool_use_id -> index into `segments` of the {type:"tool"} segment, so a
  // later tool_result (arrives as a "user" message) can attach to it.
  const toolSegmentByUseId = new Map<string, number>();

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
        chat.sdkSessionId = msg.session_id;
      }

      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") {
            assistantText += block.text;
            const last = segments[segments.length - 1];
            if (last && last.type === "text") {
              last.text += block.text;
            } else {
              segments.push({ type: "text", text: block.text });
            }
            sseWrite(res, { type: "text-delta", text: block.text });
          } else if (block.type === "tool_use") {
            assistantTools.push({ name: block.name, input: block.input });
            segments.push({ type: "tool", name: block.name, input: block.input });
            toolSegmentByUseId.set(block.id, segments.length - 1);
            sseWrite(res, { type: "tool-use", name: block.name, input: block.input });
          }
        }
      }

      // tool_result blocks arrive on a subsequent "user" message; match by
      // tool_use_id back to the segment created above.
      if (msg.type === "user") {
        const content = (msg.message as { content?: unknown }).content;
        if (Array.isArray(content)) {
          for (const block of content) {
            if (block && typeof block === "object" && (block as any).type === "tool_result") {
              const toolUseId = (block as any).tool_use_id as string | undefined;
              if (!toolUseId) continue;
              const idx = toolSegmentByUseId.get(toolUseId);
              if (idx === undefined) continue;
              const result = truncateResult(stringifyToolResultContent((block as any).content));
              const seg = segments[idx];
              if (seg && seg.type === "tool") seg.result = result;
              sseWrite(res, { type: "tool-result", toolIndex: idx, result });
            }
          }
        }
      }

      if (msg.type === "result") {
        setSession(clientSessionId, msg.session_id);
        chat.sdkSessionId = msg.session_id;
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
    // Opt-in linkify post-pass (issue #12): runs after "done" has already
    // streamed (the reply is final either way), so a slow/failed pass never
    // delays the visible response — it only ever arrives as a later
    // "segments-update" correction, or not at all. Persisted segments are
    // whichever version we end up with (linkified if the pass ran and
    // succeeded, original otherwise).
    let finalSegments = segments;
    if (config.linkifyPass && !res.writableEnded) {
      const linkified = await linkifySegments(segments);
      if (linkified) {
        finalSegments = linkified;
        sseWrite(res, { type: "segments-update", segments: linkified });
      }
    }

    chat.messages.push({
      role: "assistant",
      text: assistantText,
      tools: assistantTools,
      segments: finalSegments,
      at: new Date().toISOString(),
    });
    chat.updatedAt = new Date().toISOString();
    await writeChatFile(chat);
    res.end();
  }
});

app.get("/api/chats", async (req: Request, res: Response) => {
  try {
    const deckFilter = typeof req.query.deck === "string" ? sanitizeName(req.query.deck) : null;
    await fs.promises.mkdir(CHATS_DIR, { recursive: true });
    const files = await fs.promises.readdir(CHATS_DIR);
    const summaries: { id: string; title: string; updatedAt: string; messageCount: number }[] = [];
    for (const file of files) {
      if (!file.endsWith(".json") || file.startsWith(".tmp-")) continue;
      const chat = await readChatFile(file.replace(/\.json$/, ""));
      if (chat) {
        // backfill tolerance: old chat files without deckRefs are unlinked
        if (deckFilter && !(chat.deckRefs ?? []).includes(deckFilter)) continue;
        summaries.push({
          id: chat.id,
          title: chat.title,
          updatedAt: chat.updatedAt,
          messageCount: chat.messages.length,
        });
      }
    }
    summaries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    res.json(summaries);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/chats/:id", async (req: Request, res: Response) => {
  if (!isValidChatId(req.params.id)) {
    res.status(400).json({ error: "invalid chat id" });
    return;
  }
  try {
    const chat = await readChatFile(req.params.id);
    if (!chat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.delete("/api/chats/:id", async (req: Request, res: Response) => {
  if (!isValidChatId(req.params.id)) {
    res.status(400).json({ error: "invalid chat id" });
    return;
  }
  try {
    await fs.promises.unlink(chatFilePath(req.params.id));
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === "ENOENT") {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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

// Chat-file-backed variant: lastSeenActionIdx lives in the chat file so
// action context survives server restarts (mirrors recentActionsFor above).
function recentActionsForChat(chat: ChatFile): string[] {
  const oldestIndex = pushed - actionLog.length;
  const seen = chat.lastSeenActionIdx ?? Math.max(oldestIndex, pushed - 5);
  const fromIdx = Math.max(0, seen - oldestIndex);
  const entries = actionLog.slice(fromIdx).map((e) => e.text);
  chat.lastSeenActionIdx = pushed;
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
        manaCost: card.manaCost,
      }
    : null;
  resolverCache.set(key, resolved);
  return resolved;
};

// Lightweight card-image lookup for chat text hover previews: local-mirror
// getCard lookup (fast) via the same resolver/cache as the decks API. Returns
// {image} on hit, 404 on miss/unresolvable (e.g. bold-but-not-a-card).
app.get("/api/card-image", async (req: Request, res: Response) => {
  try {
    const name = req.query.name;
    if (typeof name !== "string" || name.trim().length === 0) {
      res.status(400).json({ error: "name is required" });
      return;
    }
    const resolved = await resolver(name.trim());
    if (!resolved?.image) {
      res.status(404).json({ error: "Card not found" });
      return;
    }
    res.json({ image: resolved.image });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Batch card-image lookup for group-chip galleries: GET ?names=a;b;c ->
// {name: image|null} map. One pass over the shared resolver/cache — same
// local-mirror lookup as /api/card-image, just amortized over N names.
app.get("/api/card-images", async (req: Request, res: Response) => {
  try {
    const namesParam = req.query.names;
    if (typeof namesParam !== "string" || namesParam.trim().length === 0) {
      res.status(400).json({ error: "names is required" });
      return;
    }
    const names = namesParam
      .split(";")
      .map((n) => n.trim())
      .filter(Boolean);
    const out: Record<string, string | null> = {};
    await Promise.all(
      names.map(async (name) => {
        const resolved = await resolver(name);
        out[name] = resolved?.image ?? null;
      })
    );
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

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
        return { ...c, image: resolved?.image ?? null, manaCost: resolved?.manaCost ?? null };
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
