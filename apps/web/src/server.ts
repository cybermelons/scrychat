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
  exportDeck,
  createDeck,
  addCards,
  removeCards,
  deleteDeck,
  setCardTags,
  renameTag,
  renameDeck,
  setCommander,
  importDecklist,
  setCardCount,
  removeTag,
  getLocalDb,
  categoryTagMembersLocal,
  parseCiMask,
  COLLECTION_PATH,
  writeCollectionFile,
  mapArenaIdsToOracle,
  parseArenaLog,
  collectionStats,
  getOwnedIndex,
  resolveQuotaTargets,
  RECOGNIZED_QUOTA_TAGS,
  type CardResolver,
} from "@scrychat/core";
import {
  wrapTableNameCells,
  wrapNamesInText,
  classifyLinkifyCandidates,
} from "./linkify-core.js";
import {
  populateGroupChipsInText,
  detectCategoryChipsInText,
  type CategoryResolver,
} from "./group-chips-core.js";
import { parseCollectionBody, buildImportResult } from "./collection-core.js";
import { isValidDeckName } from "./deck-name-core.js";
import { parseConfig, applyConfigPatch, DEFAULT_CONFIG, type ScrychatConfig } from "./config-core.js";

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

const PORT = Number(process.env.PORT) || 8787;

// ---- config: scrychat.config.json at repo root, tolerate absent file ----
// Parsing/validation lives in config-core.ts (pure, unit-tested); this just
// owns the fs read/write. `config` is a single mutable object reused for the
// process lifetime so per-request reads (e.g. config.linkifyPass) hot-apply
// as soon as a PATCH mutates it in place — never reassign `config`.
function loadConfig(): ScrychatConfig {
  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return parseConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function persistConfig(cfg: ScrychatConfig): void {
  const dir = path.dirname(CONFIG_PATH);
  const tmpPath = path.join(dir, `.${path.basename(CONFIG_PATH)}.tmp-${process.pid}-${Date.now()}`);
  fs.writeFileSync(tmpPath, JSON.stringify(cfg, null, 2), "utf8");
  fs.renameSync(tmpPath, CONFIG_PATH);
}

const config = loadConfig();
console.log(`scrychat config: linkifyPass=${config.linkifyPass}`);

const app = express();
app.use(express.json());

// ---- session management: sessionId -> SDK session id for resume ----
const SESSION_MAP_MAX = 100;
const sessionMap = new Map<string, string>();

// chat.id -> in-flight turn, so POST /api/chats/:id/stop can interrupt it.
// `q` starts null: the turn is registered before the SDK query is
// constructed (see /api/chat) so a Stop click can't race ahead of
// registration; `interrupted` may be set before `q` lands, in which case
// the query is interrupted as soon as it's assigned.
const activeTurns = new Map<string, { q: ReturnType<typeof query> | null; interrupted: boolean }>();

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
  interrupted?: boolean;
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
// Deterministic-first flow (issue #18 rework): a Layer-3 pre-pass wraps
// table name-cells first, then classifyLinkifyCandidates (linkify-core.ts)
// splits every DB-validated candidate into unambiguous (multi-word, or a
// single word not on the common-English list — auto-wrapped with zero LLM
// calls) vs ambiguous (a single word that's also common English, e.g. "Opt",
// "Fog" — escalated to a cheap Haiku span-verdict pass that only decides
// keep-vs-drop for that residue, never rewrites the full text). This means
// prose with only unambiguous names never touches Haiku at all.

// ---- known-card-name predicate, backed by the local SQLite mirror ----
// getLocalDb() is called on every invocation (it's memoized+throttled
// internally, so this is cheap) because the cached handle can be CLOSED
// out from under us mid-session: getLocalDb() detects data/scrychat.db's
// mtime changing (e.g. an ingest ran) and closes+invalidates the previously
// returned handle. Other request paths can trigger that invalidation, so a
// prepared statement built once at module scope could silently start
// throwing on a closed handle. Instead, re-fetch the db handle each call and
// only re-prepare the statement when the handle identity changes. Fail-open
// to "not known" when the local DB is absent (matches pre-#18 behavior:
// nothing gets wrapped without a DB) or on any unexpected error.
let cachedDbForStmt: ReturnType<typeof getLocalDb> | undefined;
let cardNameStmt: ReturnType<NonNullable<ReturnType<typeof getLocalDb>>["prepare"]> | null = null;

function isKnownCardName(name: string): boolean {
  const db = getLocalDb();
  if (db !== cachedDbForStmt) {
    cachedDbForStmt = db;
    cardNameStmt = db ? db.prepare("SELECT 1 FROM cards WHERE name = ? COLLATE NOCASE LIMIT 1") : null;
  }
  if (!cardNameStmt) return false;
  const trimmed = name.trim();
  if (!trimmed) return false;
  try {
    return !!cardNameStmt.get(trimmed);
  } catch (err) {
    console.error("isKnownCardName: statement failed, treating as unknown:", err);
    return false;
  }
}

const LINKIFY_TIMEOUT_MS = 10_000;

// Span-verdict prompt (deterministic-first flow, issue #18 rework): Haiku is
// no longer asked to rewrite the whole text and find card names itself — the
// deterministic classifier already found every DB-validated candidate and
// auto-wrapped the unambiguous ones. Haiku's only job is to disambiguate the
// residue: single common-English words that are ALSO real card names (e.g.
// "Opt", "Fog"), deciding per-occurrence whether the text is using the word
// AS a Magic card or as ordinary English. Output is a small JSON array, not
// a full-text rewrite, so parsing is cheap and robust.
function buildSpanVerdictPrompt(text: string, candidates: string[]): string {
  return (
    "You are given a piece of text and a list of candidate words. Each candidate word is the name of " +
    "a real Magic: The Gathering card, but is also an ordinary English word. Decide, for THIS text, " +
    "which candidates are being used to refer to the Magic card (not as ordinary English words).\n\n" +
    "Respond with ONLY a JSON array of strings — the subset of the candidate list (verbatim, exact " +
    "spelling/case) that are being used as Magic card names in this text. If none are, respond with " +
    "an empty array []. Output nothing else — no prose, no explanation.\n\n" +
    `Candidates: ${JSON.stringify(candidates)}\n\n---\n\n${text}`
  );
}

// Extracts the first top-level JSON array substring from arbitrary model
// output (Haiku sometimes wraps JSON in prose or code fences despite
// instructions not to). Returns null if no balanced `[...]` span is found.
function extractJsonArraySubstring(s: string): string | null {
  const start = s.indexOf("[");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === "[") depth++;
    else if (s[i] === "]") {
      depth--;
      if (depth === 0) return s.slice(start, i + 1);
    }
  }
  return null;
}

// Runs the Haiku span-verdict pass over the ambiguous candidate words found
// in a finished assistant message's text segments. Returns the subset of
// `ambiguousCandidates` that Haiku says are being used as MTG cards in this
// text, validated against the candidate list and isKnownCardName. Fail-open:
// returns [] (nothing kept) on any timeout/parse-failure/error — callers
// must treat that as "skip silently, auto-wrapped unambiguous names still
// stand" per issue #12.
async function haikuSpanVerdict(
  combinedText: string,
  ambiguousCandidates: string[],
  isKnownCardName: (name: string) => boolean
): Promise<string[]> {
  if (ambiguousCandidates.length === 0) return [];

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LINKIFY_TIMEOUT_MS);
  try {
    const q = query({
      prompt: buildSpanVerdictPrompt(combinedText, ambiguousCandidates),
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

    let raw = "";
    for await (const msg of q) {
      if (msg.type === "assistant") {
        for (const block of msg.message.content) {
          if (block.type === "text") raw += block.text;
        }
      }
    }
    clearTimeout(timer);
    if (!raw.trim()) return [];

    const jsonSubstr = extractJsonArraySubstring(raw);
    if (!jsonSubstr) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonSubstr);
    } catch {
      return [];
    }
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === "string")) return [];

    const candidateSet = new Set(ambiguousCandidates);
    return parsed.filter((name) => candidateSet.has(name) && isKnownCardName(name));
  } catch {
    return [];
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

  // Register the turn as stoppable before the client can possibly see the
  // chat id (the "chat" SSE event below): otherwise a Stop click that races
  // the async deck/query setup below would hit activeTurns.get() finding
  // nothing (404, silently swallowed by the client) until `q` exists.
  const turnEntry: { q: ReturnType<typeof query> | null; interrupted: boolean } = { q: null, interrupted: false };
  activeTurns.set(chat.id, turnEntry);

  if (isNewChat) {
    sseWrite(res, { type: "chat", chatId: chat.id });
  }

  // file wins for resume; sessionMap is a fallback for legacy/no-file clients
  const resumeSdkSessionId = chat.sdkSessionId ?? sessionMap.get(clientSessionId);

  let prompt = message;
  const recentActions = recentActionsForChat(chat);
  let contextLine: string | null = null;
  // Captured alongside contextLine for the group-chip population post-pass
  // (issue #20/#21): filters chip-completion members to the active deck's
  // color identity, same as the deck panel itself would.
  let activeDeckIdentity: string[] | null = null;
  if (typeof activeDeck === "string" && activeDeck.length > 0) {
    try {
      const deck = await getDeck(activeDeck, DECKS_DIR);
      if (deck) {
        const cardCount = deck.cards.reduce((n, c) => n + (c.count ?? 1), 0) + 1; // +1 for commander
        contextLine = `[UI context: the user has deck "${deck.name}" (commander: ${deck.commander}, ${cardCount} cards) open in the deck panel. Treat ambiguous references — "my deck", the commander's name, "my payoffs" — as referring to this deck; call deck_get "${deck.name}" for its current list before answering deck-specific questions. The user may still ask about unrelated cards/decks; this is context, not a restriction.`;
        activeDeckIdentity = deck.commanderIdentity ?? null;
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
  let turnInterrupted = false;

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
          "mcp__scrychat__deck_import",
          "mcp__scrychat__deck_set_card_tags",
          "mcp__scrychat__deck_rename",
          "mcp__scrychat__deck_set_commander",
          "mcp__scrychat__deck_export",
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
        systemPrompt: {
          type: "preset",
          preset: "claude_code",
          append:
            "Card-image rubric: embed ![[Card]] only for a FOCAL card (the single headline recommendation, the commander under discussion, or a 2-3 card side-by-side comparison), capped at 2-3 per reply, never inside tables or bullet lists. Use hover [[Card]] for everything enumerable (lists, tables, passing or repeat mentions). Group chips [[group:...]] stay for categories.",
        },
      },
    });

    // Fill in the placeholder registered above (pre-query) now that `q`
    // exists; preserve any interrupt already requested while we were
    // building the query (see /api/chats/:id/stop).
    turnEntry.q = q;
    if (turnEntry.interrupted) void q.interrupt();

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
    sseWrite(res, { type: "done", sessionId: clientSessionId, error: err instanceof Error ? err.message : String(err) });
  } finally {
    // Read/delete via the LOCAL `turnEntry` reference captured at
    // registration, not a fresh activeTurns.get(chat.id) lookup: a second
    // stream for the same chat.id can start (and register its own entry)
    // while this stream is still in its post-done linkify pass below, and a
    // get-then-delete by key would read/delete THAT turn's entry instead of
    // this one — leaking a stale interrupted flag and making the second
    // turn's Stop button silently no-op. Only delete the map entry if it
    // still points at this stream's turnEntry (i.e. no newer turn replaced
    // it in the meantime).
    turnInterrupted = turnEntry.interrupted;
    if (activeTurns.get(chat.id) === turnEntry) {
      activeTurns.delete(chat.id);
    }
    // Opt-in linkify post-pass (issue #12): runs after "done" has already
    // streamed (the reply is final either way), so a slow/failed pass never
    // delays the visible response — it only ever arrives as a later
    // "segments-update" correction, or not at all. Persisted segments are
    // whichever version we end up with (linkified if the pass ran and
    // succeeded, original otherwise).
    let finalSegments = segments;
    if (config.linkifyPass && !res.writableEnded) {
      // The deterministic pre-pass + gate must never take down chat
      // persistence below (chat.messages.push / writeChatFile / res.end).
      // On any unexpected failure here, log and fall through with the
      // original segments untouched.
      try {
        // Layer 3: deterministic pre-pass, table name-cells only. Runs
        // in-place on `segments` so both the persisted segments and the
        // Haiku input below see the wraps, even if the Haiku call is
        // skipped by the gate. `changed` tracks every in-place mutation
        // below (table cells, unambiguous auto-wrap, kept ambiguous spans)
        // so exactly one segments-update fires when anything changed — a
        // table-only change with no prose candidates still emits.
        let changed = false;
        for (const seg of segments) {
          if (seg.type === "text") {
            const wrapped = wrapTableNameCells(seg.text, isKnownCardName);
            if (wrapped !== seg.text) changed = true;
            seg.text = wrapped;
          }
        }

        // Group-chip population post-pass (issue #20/#21): the model rarely
        // hand-lists a full/accurate member set for [[group:LABEL|...]]
        // chips, so deterministically complete/repair them from the local
        // SQLite mirror, filtered to the active deck's color identity. Must
        // run before classifyLinkifyCandidates/wrapNamesInText below so their
        // protected-region logic (matches on `[[...]]` spans) sees chips in
        // final form. Fail-open: a null db (no local mirror yet) makes the
        // resolver return null for everything, leaving chips unchanged.
        {
          const localDb = getLocalDb();
          const ciMask = activeDeckIdentity ? parseCiMask(activeDeckIdentity.join("")) : null;
          const resolveCategory: CategoryResolver = (phrase) => {
            if (!localDb) return null;
            try {
              return categoryTagMembersLocal(localDb, phrase, { ciMask, limit: 10 });
            } catch {
              return null;
            }
          };

          let chipsChanged = 0;
          for (const seg of segments) {
            if (seg.type === "text") {
              const populated = populateGroupChipsInText(seg.text, resolveCategory, 10);
              if (populated !== seg.text) chipsChanged++;
              seg.text = populated;
            }
          }
          if (chipsChanged > 0) {
            changed = true;
            console.log(`group-chips: populated ${chipsChanged} chips`);
          }

          // Deterministic category-phrase detection (issue #20): the model
          // often answers from memory without loading the skill, so chips
          // may never be emitted at all. Detect curated category phrases in
          // prose and replace them with populated chips — after population
          // above (so model-emitted chips suppress duplicate detection via
          // the label check) and still before the linkify classify/wrap
          // steps (their protected-region logic must see final chips).
          let detected = 0;
          for (const seg of segments) {
            if (seg.type === "text") {
              const withDetected = detectCategoryChipsInText(seg.text, resolveCategory, {
                cap: 10,
                maxChips: 5,
              });
              if (withDetected !== seg.text) detected++;
              seg.text = withDetected;
            }
          }
          if (detected > 0) {
            changed = true;
            console.log(`group-chips: detected ${detected} category phrases`);
          }
        }

        // Deterministic-first classification: split DB-validated candidates
        // into unambiguous (auto-wrap, zero LLM) vs ambiguous (single common-
        // English words that are also real card names — escalate to a Haiku
        // span-verdict pass). The classifier itself is the detector now; the
        // old hasKnownCardName gate only decided whether to *call* Haiku, but
        // is no longer the sole entry point since unambiguous names get
        // wrapped even when nothing is ambiguous enough to need Haiku.
        let combinedText = segments
          .filter((s): s is { type: "text"; text: string } => s.type === "text")
          .map((s) => s.text)
          .join("");
        const { unambiguous, ambiguous } = classifyLinkifyCandidates(combinedText, isKnownCardName);

        if (unambiguous.length === 0 && ambiguous.length === 0) {
          console.log("linkify: no candidates, skipping");
        } else {
          console.log(
            `linkify: ${unambiguous.length} unambiguous auto-wrapped, ${ambiguous.length} ambiguous -> Haiku`
          );

          // Auto-wrap unambiguous names deterministically, zero LLM.
          if (unambiguous.length > 0) {
            for (const seg of segments) {
              if (seg.type === "text") {
                const wrapped = wrapNamesInText(seg.text, unambiguous, isKnownCardName);
                if (wrapped !== seg.text) changed = true;
                seg.text = wrapped;
              }
            }
          }

          // Re-derive combinedText for the Haiku span-verdict pass so it
          // sees the already-auto-wrapped unambiguous names in context.
          combinedText = segments
            .filter((s): s is { type: "text"; text: string } => s.type === "text")
            .map((s) => s.text)
            .join("");

          if (ambiguous.length > 0 && config.linkifyPass) {
            const kept = await haikuSpanVerdict(combinedText, ambiguous, isKnownCardName);
            console.log("linkify: Haiku kept", kept);
            if (kept.length > 0) {
              for (const seg of segments) {
                if (seg.type === "text") {
                  const wrapped = wrapNamesInText(seg.text, kept, isKnownCardName);
                  if (wrapped !== seg.text) changed = true;
                  seg.text = wrapped;
                }
              }
            }
          }
        }

        // Single emit covering all in-place changes above (table pre-pass
        // included, so a table-only rewrite with zero prose candidates still
        // reaches the client).
        if (changed) {
          finalSegments = segments;
          sseWrite(res, { type: "segments-update", segments });
        }
      } catch (err) {
        console.error("linkify pre-pass failed, skipping:", err);
        finalSegments = segments;
      }
    }

    chat.messages.push({
      role: "assistant",
      text: assistantText,
      tools: assistantTools,
      segments: finalSegments,
      interrupted: turnInterrupted || undefined,
      at: new Date().toISOString(),
    });
    chat.updatedAt = new Date().toISOString();
    await writeChatFile(chat);
    if (turnInterrupted && !res.writableEnded) {
      sseWrite(res, { type: "done", sessionId: clientSessionId, interrupted: true });
    }
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

app.post("/api/chats/:id/stop", (req: Request, res: Response) => {
  if (!isValidChatId(req.params.id)) {
    res.status(400).json({ error: "invalid chat id" });
    return;
  }
  const entry = activeTurns.get(req.params.id);
  if (!entry) {
    res.status(404).json({ error: "no active turn" });
    return;
  }
  entry.interrupted = true;
  // q may not exist yet if the turn was registered before the SDK query
  // finished being constructed (see /api/chat) — once it lands, the
  // deferred interrupt above (`if (turnEntry.interrupted) void q.interrupt()`)
  // fires immediately.
  if (entry.q) void entry.q.interrupt();
  res.json({ ok: true });
});

app.patch("/api/chats/:id", async (req: Request, res: Response) => {
  if (!isValidChatId(req.params.id)) {
    res.status(400).json({ error: "invalid chat id" });
    return;
  }
  const { title } = req.body ?? {};
  if (typeof title !== "string" || title.trim().length === 0 || title.length > 200) {
    res.status(400).json({ error: "invalid title" });
    return;
  }
  try {
    const chat = await readChatFile(req.params.id);
    if (!chat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    chat.title = title.trim();
    chat.updatedAt = new Date().toISOString();
    await writeChatFile(chat);
    res.json({ ok: true, title: chat.title });
  } catch (err) {
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
        producedMana: card.producedMana,
        arena: card.arena,
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
    if (!isValidDeckName(req.params.name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const deck = await getDeck(req.params.name, DECKS_DIR);
    if (!deck) {
      res.status(404).json({ error: "Deck not found" });
      return;
    }
    const report = await deckReport(req.params.name, resolver, DECKS_DIR, config.quotaTargets);

    const owned = getOwnedIndex();
    function isOwnedName(name: string): boolean {
      if (!owned) return false;
      const lower = name.toLowerCase();
      if (owned.names.has(lower)) return true;
      const frontFace = lower.split(" // ")[0];
      return owned.names.has(frontFace);
    }

    const commanderResolved = await resolver(deck.commander);
    const cardsWithImages = await Promise.all(
      deck.cards.map(async (c) => {
        const resolved = await resolver(c.name);
        return {
          ...c,
          image: resolved?.image ?? null,
          manaCost: resolved?.manaCost ?? null,
          producedMana: resolved?.producedMana ?? null,
          typeLine: resolved?.typeLine ?? null,
          arena: resolved?.arena ?? null,
          ...(owned ? { owned: isOwnedName(c.name) } : {}),
        };
      })
    );
    const deckWithImages = {
      ...deck,
      commanderImage: commanderResolved?.image ?? null,
      ...(owned ? { commanderOwned: isOwnedName(deck.commander) } : {}),
      cards: cardsWithImages,
    };

    const collectionMeta = owned
      ? {
          importedAt: owned.importedAt,
          ownedCount: cardsWithImages.filter((c) => c.owned).length,
          missingCount: cardsWithImages.filter((c) => !c.owned).length,
        }
      : undefined;

    res.json({
      deck: deckWithImages,
      report,
      ...(collectionMeta ? { collection: collectionMeta } : {}),
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/decks/:name/export", async (req: Request, res: Response) => {
  try {
    if (!isValidDeckName(req.params.name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const allowedFormats = ["plain", "mtga", "moxfield"] as const;
    const rawFormat = req.query.format;
    const format = allowedFormats.includes(rawFormat as (typeof allowedFormats)[number])
      ? (rawFormat as (typeof allowedFormats)[number])
      : config.defaultExportFormat;
    const text = await exportDeck(req.params.name, format, DECKS_DIR);
    res.type("text/plain").send(text);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not found/i.test(message)) {
      res.status(404).json({ error: message });
    } else {
      res.status(500).json({ error: message });
    }
  }
});

app.post("/api/decks", async (req: Request, res: Response) => {
  try {
    const { name, commander } = req.body ?? {};
    if (typeof name !== "string" || typeof commander !== "string") {
      res.status(400).json({ error: "name and commander are required" });
      return;
    }
    if (!isValidDeckName(name)) {
      res.status(400).json({ error: "invalid deck name" });
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
    if (!isValidDeckName(req.params.name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const { cards } = req.body ?? {};
    if (!Array.isArray(cards)) {
      res.status(400).json({ error: "cards array is required" });
      return;
    }
    const result = await addCards(req.params.name, cards, resolver, DECKS_DIR);
    for (const c of result.added) {
      logAction(`added "${c.name}"${c.tags?.length ? ` (${c.tags.join(", ")})` : ""} to "${req.params.name}"`);
    }
    for (const r of result.rejected) {
      logAction(`tried to add "${r.name}" to "${req.params.name}" — rejected: ${r.reason}`);
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.patch("/api/decks/:name/cards", async (req: Request, res: Response) => {
  try {
    if (!isValidDeckName(req.params.name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const { cards } = req.body ?? {};
    if (!Array.isArray(cards)) {
      res.status(400).json({ error: "cards array is required" });
      return;
    }
    const cardsValid = cards.every(
      (c) =>
        c &&
        typeof c === "object" &&
        typeof c.name === "string" &&
        Array.isArray(c.tags) &&
        c.tags.every((t: unknown) => typeof t === "string")
    );
    if (!cardsValid) {
      res.status(400).json({ error: "each card must be {name: string, tags: string[]}" });
      return;
    }
    const deck = await setCardTags(req.params.name, cards, DECKS_DIR);
    for (const c of cards) {
      logAction(`tagged "${c.name}" [${(c.tags ?? []).join(", ")}]`);
    }
    res.json({ deck });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.patch("/api/decks/:name/tags", async (req: Request, res: Response) => {
  try {
    if (!isValidDeckName(req.params.name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const { from, to } = req.body ?? {};
    if (typeof from !== "string" || from.length === 0 || typeof to !== "string" || to.length === 0) {
      res.status(400).json({ error: "from and to are required non-empty strings" });
      return;
    }
    const deck = await renameTag(req.params.name, from, to, DECKS_DIR);
    logAction(`renamed tag "${from}" → "${to}" in "${req.params.name}"`);
    res.json({ deck });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.delete("/api/decks/:name/cards", async (req: Request, res: Response) => {
  try {
    if (!isValidDeckName(req.params.name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
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
    if (!isValidDeckName(req.params.name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
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

app.post("/api/decks/import", async (req: Request, res: Response) => {
  try {
    const { text, deckName, mode } = req.body ?? {};
    if (typeof text !== "string" || text.trim().length === 0) {
      res.status(400).json({ error: "text is required" });
      return;
    }
    if (deckName !== undefined && !isValidDeckName(deckName)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    if (mode !== undefined && mode !== "new" && mode !== "existing") {
      res.status(400).json({ error: 'mode must be "new" or "existing"' });
      return;
    }
    const result = (await importDecklist(
      text,
      { deckName, mode, targets: config.quotaTargets },
      resolver,
      DECKS_DIR
    )) as {
      created?: { name: string };
      added?: { name: string }[];
    };
    if (result.created) {
      logAction(`imported decklist into new deck "${result.created.name}"`);
    } else if (result.added && result.added.length > 0) {
      logAction(`imported ${result.added.length} card(s) into "${deckName}"`);
    }
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.patch("/api/decks/:name", async (req: Request, res: Response) => {
  try {
    if (!isValidDeckName(req.params.name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const { name } = req.body ?? {};
    if (!isValidDeckName(name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const deck = await renameDeck(req.params.name, name, DECKS_DIR);
    logAction(`renamed deck "${req.params.name}" → "${name}"`);
    res.json({ deck });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not found/i.test(message)) {
      res.status(404).json({ error: message });
    } else {
      res.status(400).json({ error: message });
    }
  }
});

app.patch("/api/decks/:name/commander", async (req: Request, res: Response) => {
  try {
    if (!isValidDeckName(req.params.name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const { commander } = req.body ?? {};
    if (typeof commander !== "string" || commander.trim().length === 0) {
      res.status(400).json({ error: "commander is required" });
      return;
    }
    const result = await setCommander(req.params.name, commander, resolver, DECKS_DIR);
    logAction(
      `set commander of "${req.params.name}" to "${result.deck.commander}"` +
        (result.nowIllegal.length > 0 ? ` (${result.nowIllegal.length} card(s) now illegal)` : "")
    );
    res.json({ deck: result.deck, changed: result.changed, nowIllegal: result.nowIllegal });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not found/i.test(message)) {
      res.status(404).json({ error: message });
    } else {
      res.status(400).json({ error: message });
    }
  }
});

app.patch("/api/decks/:name/cards/count", async (req: Request, res: Response) => {
  try {
    if (!isValidDeckName(req.params.name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const { card, count } = req.body ?? {};
    if (typeof card !== "string" || card.trim().length === 0) {
      res.status(400).json({ error: "card is required" });
      return;
    }
    if (typeof count !== "number") {
      res.status(400).json({ error: "count must be a number" });
      return;
    }
    const result = await setCardCount(req.params.name, card, count, resolver, DECKS_DIR);
    if (result.updated) {
      logAction(`set "${result.updated.name}" count to ${result.updated.count} in "${req.params.name}"`);
    }
    res.json({ deck: result.deck, updated: result.updated, rejected: result.rejected });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not found/i.test(message)) {
      res.status(404).json({ error: message });
    } else {
      res.status(400).json({ error: message });
    }
  }
});

app.delete("/api/decks/:name/tags/:tag", async (req: Request, res: Response) => {
  try {
    if (!isValidDeckName(req.params.name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const tag = req.params.tag;
    const result = await removeTag(req.params.name, tag, DECKS_DIR);
    logAction(`removed tag "${tag}" from ${result.affected} card(s) in "${req.params.name}"`);
    res.json({ deck: result.deck, affected: result.affected });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/not found/i.test(message)) {
      res.status(404).json({ error: message });
    } else {
      res.status(400).json({ error: message });
    }
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

// ---- Arena collection import ----
app.post("/api/collection", express.text({ type: "text/plain", limit: "64mb" }), async (req: Request, res: Response) => {
  try {
    const contentType = req.headers["content-type"];
    const parsed = parseCollectionBody(contentType, req.body);
    if ("error" in parsed) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    let cards: Record<string, number>;
    if (parsed.kind === "log") {
      const logResult = parseArenaLog(parsed.text);
      if (!logResult) {
        res.status(400).json({ error: "no collection data found in log (enable Detailed Logs in Arena?)" });
        return;
      }
      cards = logResult.cards;
    } else {
      cards = parsed.cards;
    }

    const db = getLocalDb();
    if (!db) {
      res.status(503).json({ error: "local card DB required — run: pnpm --filter @scrychat/core ingest" });
      return;
    }

    const mapResult = mapArenaIdsToOracle(db, Object.keys(cards));
    const importedAt = new Date().toISOString();
    writeCollectionFile({
      importedAt,
      source: parsed.kind === "log" ? "player-log" : "parsed",
      cards,
    });

    res.json({ ok: true, stats: { ...buildImportResult(cards, mapResult), importedAt } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/collection", async (_req: Request, res: Response) => {
  try {
    const stats = collectionStats(COLLECTION_PATH);
    if (!stats.exists) {
      res.json({ exists: false });
      return;
    }
    res.json({
      exists: true,
      importedAt: stats.importedAt,
      source: stats.source,
      uniqueOwned: stats.uniqueOwned,
      totalCards: stats.totalCards,
      unmatchedCount: stats.unmatchedCount,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---- settings surface: scrychat.config.json read/write over HTTP (issue #37) ----
app.get("/api/config", (_req: Request, res: Response) => {
  res.json({
    ...config,
    recognizedQuotaTags: RECOGNIZED_QUOTA_TAGS,
    effectiveQuotaTargets: resolveQuotaTargets(config.quotaTargets),
  });
});

app.patch("/api/config", (req: Request, res: Response) => {
  const { config: next, errors } = applyConfigPatch(config, req.body);
  if (errors.length > 0) {
    res.status(400).json({ errors });
    return;
  }
  Object.assign(config, next);
  // PATCH only ever adds/replaces quotaTargets; explicitly delete it from the
  // live object when the patch cleared the override, since Object.assign
  // can't remove keys that `next` no longer has.
  if (!("quotaTargets" in next)) {
    delete config.quotaTargets;
  }
  try {
    persistConfig(config);
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    return;
  }
  res.json({
    ...config,
    recognizedQuotaTags: RECOGNIZED_QUOTA_TAGS,
    effectiveQuotaTargets: resolveQuotaTargets(config.quotaTargets),
  });
});

// ---- health check: diagnose skill-loading / DB-staleness issues (issue #40) ----
app.get("/api/health", (_req: Request, res: Response) => {
  const skillPath = path.join(REPO_ROOT, ".claude/skills/edh-deck-builder/SKILL.md");
  let skillLoaded = false;
  try {
    fs.accessSync(skillPath, fs.constants.R_OK);
    skillLoaded = true;
  } catch {
    skillLoaded = false;
  }

  const dbPath = path.join(REPO_ROOT, "data/scrychat.db");
  let dbExists = false;
  let cardCount: number | null = null;
  let arenaPopulated: number | null = null;
  let ingestStamp: string | null = null;

  try {
    const db = getLocalDb();
    dbExists = db !== null;
    if (db) {
      try {
        const row = db.prepare("SELECT COUNT(*) AS n FROM cards").get() as { n: number };
        cardCount = row?.n ?? null;
      } catch {
        cardCount = null;
      }
      try {
        const row = db.prepare("SELECT COUNT(*) AS n FROM cards WHERE arena IS NOT NULL").get() as { n: number };
        arenaPopulated = row?.n ?? null;
      } catch {
        arenaPopulated = null;
      }
    }
  } catch {
    dbExists = false;
  }

  try {
    ingestStamp = fs.statSync(dbPath).mtime.toISOString();
  } catch {
    ingestStamp = null;
  }

  res.json({
    ok: true,
    repoRoot: REPO_ROOT,
    skillLoaded,
    skillPath,
    db: {
      exists: dbExists,
      path: dbPath,
      cardCount,
      arenaPopulated,
      ingestStamp,
    },
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
