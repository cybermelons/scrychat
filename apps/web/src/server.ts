import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import os from "node:os";
import express from "express";
import type { Request, Response } from "express";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { validateImages } from "./image-core.js";
import { imageTurnPrompt } from "./image-turn-prompt.js";
import {
  getCard,
  listDecks,
  getDeck,
  deckReport,
  exportDeck,
  createDeck,
  createDraftDeck,
  saveDraft,
  discardDraft,
  addCards,
  removeCards,
  moveCardBoard,
  deleteDeck,
  setCardTags,
  setDeckMeta,
  renameTag,
  renameDeck,
  setCommander,
  importDecklist,
  listCommanders,
  getPrecons,
  matchesFilter,
  setCardCount,
  removeTag,
  getLocalDb,
  categoryTagMembersLocal,
  parseCiMask,
  writeCollectionFile,
  mapArenaIdsToOracle,
  parseArenaLog,
  collectionStats,
  getOwnedIndex,
  resolveQuotaTargets,
  RECOGNIZED_QUOTA_TAGS,
  addSuggestions,
  listSuggestions,
  decideSuggestion,
  clearDecided,
  type CardResolver,
} from "@scrychat/core";
import {
  populateGroupChipsInText,
  detectCategoryChipsInText,
  type CategoryResolver,
} from "./group-chips-core.js";
import { parseCollectionBody, buildImportResult } from "./collection-core.js";
import { createDeckHistory, mergeFeedback, unknownMetaField } from "./deck-history-core.js";
import { getCollectionHealth, getDbHealth } from "./health-core.js";
import { isValidDeckName } from "./deck-name-core.js";
import { ALLOWED_TOOLS, DISALLOWED_TOOLS } from "./tools-core.js";
import { createRequireUser } from "./auth.js";
import { createTurnLimiter, isUsageLimitError, pauseUntilFromError, REFUSAL_MESSAGE } from "./limits-core.js";
import { userIdFromEmail, userPaths, chatFileFor, deckEventFor, migrateLegacy, type UserPaths } from "./users-core.js";
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
// Per-user storage root: users/<email>/{decks,chats,suggestions,collection.json,
// scrychat.config.json}. Only data/ (the Scryfall mirror) stays shared.
const USERS_DIR = path.resolve(process.env.SCRYCHAT_USERS_DIR || path.join(REPO_ROOT, "users"));
const OWNER_ID = userIdFromEmail(process.env.OWNER_EMAIL);
const MCP_SERVER_PATH = path.join(REPO_ROOT, "packages/mcp/dist/index.js");

const PORT = Number(process.env.PORT) || 8787;

// ---- per-user paths ----
const ensured = new Set<string>();
/** Storage paths of the authenticated caller (requireUser ran first), dirs created. */
function me(req: Request): UserPaths {
  const p = userPaths(USERS_DIR, req.user as string);
  if (!ensured.has(p.root)) {
    for (const d of [p.decks, p.chats, p.suggestions]) fs.mkdirSync(d, { recursive: true });
    ensured.add(p.root);
  }
  return p;
}

// ---- config: users/<email>/scrychat.config.json, tolerate absent file ----
// Parsing/validation lives in config-core.ts (pure, unit-tested); this just
// owns the fs read/write. One mutable object per user, reused for the process
// lifetime so per-request reads (e.g. cfg.defaultExportFormat) hot-apply as soon
// as a PATCH mutates it in place -- never reassign it.
function loadConfig(configPath: string): ScrychatConfig {
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return parseConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function persistConfig(configPath: string, cfg: ScrychatConfig): void {
  const dir = path.dirname(configPath);
  const tmpPath = path.join(dir, `.${path.basename(configPath)}.tmp-${process.pid}-${Date.now()}`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tmpPath, JSON.stringify(cfg, null, 2), "utf8");
  fs.renameSync(tmpPath, configPath);
}

const configs = new Map<string, ScrychatConfig>();
function cfgOf(req: Request): ScrychatConfig {
  let c = configs.get(req.user as string);
  if (!c) {
    c = loadConfig(me(req).config);
    configs.set(req.user as string, c);
  }
  return c;
}

// Shared-subscription limits (docs/multi-user.md decision 9): 2 concurrent turns
// for everyone, a daily budget per non-owner, a pause on a usage-limit error.
const limiter = createTurnLimiter({ ownerId: OWNER_ID });

const app = express();

// ---- identity: Cloudflare Access JWT on every data route (docs/multi-user.md) ----
// Fails closed: with CF_TEAM/CF_AUD unset every /api and /suggestions request
// is 401, unless SCRYCHAT_DEV_USER is set (local dev only, NEVER on the NAS).
// Static UI files stay public (no data). Runs before the 30mb JSON parser so an
// unauthenticated caller cannot make us buffer a body.
const CF_TEAM = process.env.CF_TEAM || undefined;
const CF_AUD = process.env.CF_AUD || undefined;
const DEV_USER = process.env.SCRYCHAT_DEV_USER || undefined;
const requireUser = createRequireUser({ team: CF_TEAM, aud: CF_AUD, devUser: DEV_USER });
app.use(["/api", "/suggestions"], requireUser);
// 30mb, not the 100kb default: an image turn carries up to
// MAX_IMAGES_PER_TURN (4) x MAX_IMAGE_BYTES (5mb) of base64, and base64 costs
// 4 bytes per 3, so the worst legitimate body is ~26.7mb. Measured 2026-10-11:
// at the default limit a single 200kb photo 413s in the body parser, BEFORE
// validateImages runs, so the per-image error messages are never reached.
// Keep this above the image-core budget or the two disagree silently.
app.use(express.json({ limit: "30mb" }));

// ---- session management: sessionId -> SDK session id for resume ----
const SESSION_MAP_MAX = 100;
// Keys are `${user}/${clientSessionId}`: the client picks the id, so it must not be shared across users.
const sessionMap = new Map<string, string>();

class ResumeFailed extends Error {}

// chat.id -> in-flight turn, so POST /api/chats/:id/stop can interrupt it.
// `q` starts null: the turn is registered before the SDK query is
// constructed (see /api/chat) so a Stop click can't race ahead of
// registration; `interrupted` may be set before `q` lands, in which case
// the query is interrupted as soon as it's assigned.
// Keys are `${user}/${chat.id}`.
const activeTurns = new Map<string, { q: ReturnType<typeof query> | null; interrupted: boolean }>();

function setSession(key: string, sdkSessionId: string): void {
  sessionMap.delete(key); // reinsert at newest position
  sessionMap.set(key, sdkSessionId);
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

/*
 * Re-exported for packages/mcp's mirror test, which reads this app to check
 * the number deck_present sizes against. It is a DISPLAY cap, owned and
 * explained by truncate-core.ts: it bounds what the hover popover renders,
 * NOT what is stored or streamed, and never bounded the model's context (the
 * SDK hands the model the untruncated result before this app observes it).
 *
 * #70: do not reapply this when capturing a tool_result. Cutting the stored
 * string mid-record made it invalid JSON, which silently disabled every
 * parse*Spec component and hid card names from the grounding check.
 */
export { TOOL_RESULT_MAX_CHARS } from "./truncate-core.js";

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
  feedback?: Record<string, 1 | -1>;
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
async function updateDeckRefs(chat: ChatFile, decksDir: string): Promise<void> {
  const refs = new Set<string>();
  for (const m of chat.messages) {
    if (m.activeDeck) refs.add(sanitizeName(m.activeDeck));
  }
  try {
    const decks = await listDecks(decksDir);
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

async function readChatFile(chatsDir: string, id: string): Promise<ChatFile | null> {
  try {
    const raw = await fs.promises.readFile(chatFileFor(chatsDir, id), "utf8");
    return JSON.parse(raw) as ChatFile;
  } catch (err: any) {
    if (err?.code === "ENOENT") return null;
    throw err;
  }
}

async function writeChatFile(chatsDir: string, chat: ChatFile): Promise<void> {
  await fs.promises.mkdir(chatsDir, { recursive: true });
  await atomicWrite(chatFileFor(chatsDir, chat.id), JSON.stringify(chat, null, 2));
}

function newChatId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function titleFromMessage(message: string): string {
  const t = message.trim().replace(/\s+/g, " ");
  return t.length > 40 ? `${t.slice(0, 40)}…` : t;
}


app.post("/api/chat", async (req: Request, res: Response) => {
  const { message, sessionId, activeDeck, chatId: reqChatId, images: rawImages } = req.body ?? {};
  if (typeof message !== "string" || message.length === 0) {
    res.status(400).json({ error: "message is required" });
    return;
  }
  if (reqChatId !== undefined && reqChatId !== null && reqChatId !== "" && !isValidChatId(reqChatId)) {
    res.status(400).json({ error: "invalid chatId" });
    return;
  }
  // Images are validated before anything is persisted or streamed, so a bad
  // upload is a plain 400 rather than a half-started turn. The bytes are never
  // written to disk: they live in this request and in the message handed to
  // the SDK, and are dropped when the turn ends (#54).
  const imageCheck = validateImages(rawImages);
  if (!imageCheck.ok) {
    res.status(400).json({
      error: imageCheck.index >= 0 ? `image ${imageCheck.index}: ${imageCheck.error}` : `images: ${imageCheck.error}`,
    });
    return;
  }
  const images = imageCheck.images;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const slot = limiter.tryAcquire(req.user as string);
  if (!slot.ok) {
    sseWrite(res, { type: "done", error: REFUSAL_MESSAGE[slot.reason] });
    res.end();
    return;
  }
  // "close" fires when the response ends or the client drops: the slot cannot leak.
  res.on("close", slot.release);

  const clientSessionId: string = typeof sessionId === "string" ? sessionId : crypto.randomUUID();

  const user = req.user as string;
  const paths = me(req);
  const sessionKey = `${user}/${clientSessionId}`;
  const state = stateOf(user);

  let chat: ChatFile | null =
    typeof reqChatId === "string" && reqChatId.length > 0 ? await readChatFile(paths.chats, reqChatId) : null;
  const isNewChat = !chat;
  const now = new Date().toISOString();
  if (!chat) {
    chat = {
      id: newChatId(),
      title: titleFromMessage(message),
      createdAt: now,
      updatedAt: now,
      lastSeenActionIdx: state.pushed - Math.min(state.pushed, 5),
      messages: [],
    };
  }
  const msgActiveDeck = typeof activeDeck === "string" && activeDeck.length > 0 ? activeDeck : undefined;
  chat.messages.push({ role: "user", text: message, activeDeck: msgActiveDeck, at: now });
  chat.updatedAt = now;
  await updateDeckRefs(chat, paths.decks);
  await writeChatFile(paths.chats, chat);

  // Register the turn as stoppable before the client can possibly see the
  // chat id (the "chat" SSE event below): otherwise a Stop click that races
  // the async deck/query setup below would hit activeTurns.get() finding
  // nothing (404, silently swallowed by the client) until `q` exists.
  const turnEntry: { q: ReturnType<typeof query> | null; interrupted: boolean } = { q: null, interrupted: false };
  const turnKey = `${user}/${chat.id}`;
  activeTurns.set(turnKey, turnEntry);

  if (isNewChat) {
    sseWrite(res, { type: "chat", chatId: chat.id });
  }

  // file wins for resume; sessionMap is a fallback for legacy/no-file clients
  const resumeSdkSessionId = chat.sdkSessionId ?? sessionMap.get(sessionKey);

  let prompt = message;
  const recentActions = recentActionsForChat(state, chat);
  let contextLine: string | null = null;
  // Captured alongside contextLine for the group-chip population post-pass
  // (issue #20/#21): filters chip-completion members to the active deck's
  // color identity, same as the deck panel itself would.
  let activeDeckIdentity: string[] | null = null;
  if (typeof activeDeck === "string" && activeDeck.length > 0) {
    try {
      const deck = await getDeck(activeDeck, paths.decks);
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

  // The resume id can point at a transcript that no longer exists (container
  // layer lost on recreate, or the one-time migration). Retry once without it.
  let resumeId = resumeSdkSessionId;
  try {
  for (let attempt = 0; ; attempt++) {
    // Text-only turns keep the plain-string prompt they have always used, so a
    // regression here can only reach image turns. Only when the turn carries an
    // image do we switch to the AsyncIterable form, which is the only way to
    // send an image content block (`prompt: string | AsyncIterable<SDKUserMessage>`).
    const sdkPrompt: string | AsyncIterable<SDKUserMessage> =
      images.length === 0 ? prompt : imageTurnPrompt(prompt, images, resumeId ?? "");

    try {
      const q = query({
        prompt: sdkPrompt,
        options: {
          cwd: REPO_ROOT,
          env: SDK_ENV,
          resume: resumeId,
          settingSources: ["project"],
          mcpServers: {
            scrychat: {
              type: "stdio",
              command: "node",
              args: [MCP_SERVER_PATH],
              // The MCP child resolves decks, suggestions, collection and config under this root.
              env: { ...SDK_ENV, SCRYCHAT_ROOT: paths.root } as Record<string, string>,
            },
          },
          allowedTools: [...ALLOWED_TOOLS],
          disallowedTools: [...DISALLOWED_TOOLS],
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
          setSession(sessionKey, msg.session_id);
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
                // #70: store and stream the result WHOLE. The 2048-char cap
                // that used to be applied here is a display bound (it keeps a
                // blob out of data-result and the hover popover) and is now
                // applied at render time instead. Cutting at capture made the
                // stored JSON invalid, which silently disabled every
                // parse*Spec component and hid card names from the grounding
                // check -- measured on the real deck, 29 of 76 names survived.
                // See truncate-core.ts.
                const result = stringifyToolResultContent((block as any).content);
                const seg = segments[idx];
                if (seg && seg.type === "tool") seg.result = result;
                sseWrite(res, { type: "tool-result", toolIndex: idx, result });
              }
            }
          }
        }

        if (msg.type === "result") {
          // A resume whose transcript is gone comes back as an error result with no output:
          // retry once as a fresh session instead of surfacing it (the chat JSON is kept).
          if (msg.is_error) {
          const text = String((msg as any).result ?? "");
          if (isUsageLimitError(text)) limiter.pause(pauseUntilFromError(text, Date.now()));
        }
        if (resumeId && msg.is_error && segments.length === 0) throw new ResumeFailed(String((msg as any).result ?? ""));
          setSession(sessionKey, msg.session_id);
          chat.sdkSessionId = msg.session_id;
          sseWrite(res, {
            type: "done",
            sessionId: clientSessionId,
            result: msg.subtype === "success" ? msg.result : null,
            isError: msg.is_error,
          });
        }
      }
      break;
    } catch (err) {
      const errText = err instanceof Error ? err.message : String(err);
      if (isUsageLimitError(errText)) limiter.pause(pauseUntilFromError(errText, Date.now()));
      if (resumeId && attempt === 0 && segments.length === 0 && !res.writableEnded) {
        console.warn(`resume of ${resumeId} failed (${err instanceof Error ? err.message : String(err)}); starting a fresh session`);
        resumeId = undefined;
        chat.sdkSessionId = undefined;
        continue;
      }
      sseWrite(res, { type: "done", sessionId: clientSessionId, error: err instanceof Error ? err.message : String(err) });
      break;
    }
  }
  } finally {
    // Read/delete via the LOCAL `turnEntry` reference captured at
    // registration, not a fresh activeTurns.get(chat.id) lookup: a second
    // stream for the same chat.id can start (and register its own entry)
    // while this stream is still in its post-done chip pass below, and a
    // get-then-delete by key would read/delete THAT turn's entry instead of
    // this one — leaking a stale interrupted flag and making the second
    // turn's Stop button silently no-op. Only delete the map entry if it
    // still points at this stream's turnEntry (i.e. no newer turn replaced
    // it in the meantime).
    turnInterrupted = turnEntry.interrupted;
    if (activeTurns.get(turnKey) === turnEntry) {
      activeTurns.delete(turnKey);
    }
    // Group-chip post-pass (issues #20/#21): runs after "done" has already
    // streamed (the reply is final either way), so a slow/failed pass never
    // delays the visible response — it only ever arrives as a later
    // "segments-update" correction, or not at all. Persisted segments are
    // whichever version we end up with (rewritten if the pass changed
    // something, original otherwise).
    let finalSegments = segments;
    if (!res.writableEnded) {
      // The chip post-pass must never take down chat
      // persistence below (chat.messages.push / writeChatFile / res.end).
      // On any unexpected failure here, log and fall through with the
      // original segments untouched.
      try {
        // Runs in-place on `segments`. `changed` tracks every mutation
        // below so exactly one segments-update fires when anything changed.
        let changed = false;

        // Group-chip population post-pass (issue #20/#21): the model rarely
        // hand-lists a full/accurate member set for [[group:LABEL|...]]
        // chips, so deterministically complete/repair them from the local
        // SQLite mirror, filtered to the active deck's color identity.
        // Fail-open: a null db (no local mirror yet) makes the
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
          // the label check).
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

        // Single emit covering all in-place changes above.
        if (changed) {
          finalSegments = segments;
          sseWrite(res, { type: "segments-update", segments });
        }
      } catch (err) {
        console.error("chip post-pass failed, skipping:", err);
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
    await writeChatFile(paths.chats, chat);
    if (turnInterrupted && !res.writableEnded) {
      sseWrite(res, { type: "done", sessionId: clientSessionId, interrupted: true });
    }
    res.end();
  }
});

app.get("/api/chats", async (req: Request, res: Response) => {
  try {
    const deckFilter = typeof req.query.deck === "string" ? sanitizeName(req.query.deck) : null;
    const chatsDir = me(req).chats;
    const files = await fs.promises.readdir(chatsDir);
    const summaries: { id: string; title: string; updatedAt: string; messageCount: number }[] = [];
    for (const file of files) {
      if (!file.endsWith(".json") || file.startsWith(".tmp-")) continue;
      const chat = await readChatFile(chatsDir, file.replace(/\.json$/, ""));
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
    const chat = await readChatFile(me(req).chats, req.params.id);
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
    await fs.promises.unlink(chatFileFor(me(req).chats, req.params.id));
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
  const entry = activeTurns.get(`${req.user}/${req.params.id}`);
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
  const { title, feedback } = req.body ?? {};
  if (title !== undefined || feedback === undefined) {
    if (typeof title !== "string" || title.trim().length === 0 || title.length > 200) {
      res.status(400).json({ error: "invalid title" });
      return;
    }
  }
  if (feedback !== undefined && mergeFeedback(undefined, feedback) === null) {
    res.status(400).json({ error: "invalid feedback" });
    return;
  }
  try {
    const chat = await readChatFile(me(req).chats, req.params.id);
    if (!chat) {
      res.status(404).json({ error: "Chat not found" });
      return;
    }
    if (typeof title === "string") chat.title = title.trim();
    if (feedback !== undefined) chat.feedback = mergeFeedback(chat.feedback, feedback)!;
    chat.updatedAt = new Date().toISOString();
    await writeChatFile(me(req).chats, chat);
    res.json({ ok: true, title: chat.title, feedback: chat.feedback ?? {} });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Owner-only: counts, pause and active turns of the shared subscription.
app.get("/api/admin/usage", (req: Request, res: Response) => {
  if (!OWNER_ID || req.user !== OWNER_ID) {
    res.status(403).json({ error: "owner only" });
    return;
  }
  res.json(limiter.usage());
});

// ---- UI action log: recent deck CRUD, surfaced to chat as context ----
// Per user, so one user's edits never reach another's prompt. Indices are
// absolute (monotonic `pushed` count), not array positions, so trimming the
// array to ACTION_LOG_MAX entries never desyncs lastSeenActionIdx.
const ACTION_LOG_MAX = 50;
type UserState = { actionLog: { t: number; text: string }[]; pushed: number };
const userStates = new Map<string, UserState>();
function stateOf(user: string): UserState {
  let st = userStates.get(user);
  if (!st) userStates.set(user, (st = { actionLog: [], pushed: 0 }));
  return st;
}

// Per-deck edit history keyed `${user}/${deck}`; also pushed live over /api/deck-events.
// ponytail: in-memory ring, lost on restart; persist to JSONL in core when users ask
const deckHistory = createDeckHistory();
const historyKey = (user: string, deck: string) => `${user}/${deck}`;
const historyListeners = new Set<(user: string, deck: string, entry: { at: string; action: string }) => void>();

function logAction(req: Request, text: string, deck?: string): void {
  const user = req.user as string;
  const st = stateOf(user);
  st.actionLog.push({ t: Date.now(), text });
  st.pushed++;
  if (st.actionLog.length > ACTION_LOG_MAX) st.actionLog.shift();
  if (deck) {
    const entry = deckHistory.record(historyKey(user, deck), text);
    for (const fn of historyListeners) fn(user, deck, entry);
  }
}

// Chat-file-backed: lastSeenActionIdx lives in the chat file so
// action context survives server restarts.
function recentActionsForChat(st: UserState, chat: ChatFile): string[] {
  const oldestIndex = st.pushed - st.actionLog.length;
  const seen = chat.lastSeenActionIdx ?? Math.max(oldestIndex, st.pushed - 5);
  const fromIdx = Math.max(0, seen - oldestIndex);
  const entries = st.actionLog.slice(fromIdx).map((e) => e.text);
  chat.lastSeenActionIdx = st.pushed;
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
        usd: card.usd,
        edhrecRank: card.edhrecRank,
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

app.get("/api/decks", async (req: Request, res: Response) => {
  try {
    const decks = await listDecks(me(req).decks);
    res.json(decks.map((d) => ({ name: d.name, commander: d.commander, updatedAt: d.updatedAt, draft: d.draft })));
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
    const deck = await getDeck(req.params.name, me(req).decks);
    if (!deck) {
      res.status(404).json({ error: "Deck not found" });
      return;
    }
    const report = await deckReport(req.params.name, resolver, me(req).decks, cfgOf(req).quotaTargets);

    const owned = getOwnedIndex(me(req).collection);
    function isOwnedName(name: string): boolean {
      if (!owned) return false;
      const lower = name.toLowerCase();
      if (owned.names.has(lower)) return true;
      const frontFace = lower.split(" // ")[0];
      return owned.names.has(frontFace);
    }

    const commanderResolved = deck.commander ? await resolver(deck.commander) : null;
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
      : cfgOf(req).defaultExportFormat;
    const text = await exportDeck(req.params.name, format, me(req).decks);
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
    const deck = await createDeck(name, commander, resolver, me(req).decks);
    logAction(req, `created deck "${deck.name}" (commander ${deck.commander})`, deck.name);
    res.json({ deck });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Unsaved "New deck" drafts: a real flagged file; Save renames + clears the flag, Discard deletes it.
app.post("/api/decks/draft", async (req: Request, res: Response) => {
  try { res.json({ deck: await createDraftDeck(me(req).decks) }); } catch (err) { res.status(400).json({ error: String(err instanceof Error ? err.message : err) }); }
});
app.post("/api/decks/:name/save-draft", async (req: Request, res: Response) => {
  try {
    const to = req.body?.name;
    if (!isValidDeckName(req.params.name) || !isValidDeckName(to)) { res.status(400).json({ error: "invalid deck name" }); return; }
    const deck = await saveDraft(req.params.name, to, me(req).decks);
    deckHistory.rename(historyKey(req.user as string, req.params.name), historyKey(req.user as string, to));
    res.json({ deck });
  } catch (err) { res.status(400).json({ error: String(err instanceof Error ? err.message : err) }); }
});
app.delete("/api/decks/:name/draft", async (req: Request, res: Response) => {
  try {
    if (!isValidDeckName(req.params.name)) { res.status(400).json({ error: "invalid deck name" }); return; }
    await discardDraft(req.params.name, me(req).decks);
    deckHistory.delete(historyKey(req.user as string, req.params.name));
    res.json({ ok: true });
  } catch (err) { res.status(400).json({ error: String(err instanceof Error ? err.message : err) }); }
});

// ---- browse: commanders (local mirror) + precons (MTGJSON) ----

async function uniqueDeckName(base: string, decksDir: string): Promise<string> {
  const root = base.replace(/[\\/\0]/g, "-").trim().slice(0, 120) || "Deck";
  for (let i = 1; ; i++) {
    const n = i === 1 ? root : `${root} (${i})`;
    if (!(await getDeck(n, decksDir))) return n;
  }
}

type PreconView = Awaited<ReturnType<typeof getPrecons>>[number];
const preconSummary = ({ cards, type, ...rest }: PreconView) => ({ ...rest, cardCount: cards.reduce((n, c) => n + c.count, 0) });

app.get("/api/browse/commanders", (req: Request, res: Response) => {
  const num = (v: unknown) => (typeof v === "string" && v !== "" ? Number(v) : undefined);
  const r = listCommanders({
    q: typeof req.query.q === "string" ? req.query.q : undefined,
    colors: typeof req.query.colors === "string" ? req.query.colors : undefined,
    limit: num(req.query.limit),
    offset: num(req.query.offset),
  });
  if (!r.ok) res.status(503).json({ error: r.error });
  else res.json(r);
});

app.get("/api/browse/precons", async (req: Request, res: Response) => {
  try {
    const { q, colors } = req.query as { q?: string; colors?: string };
    const all = await getPrecons();
    res.json({
      precons: all
        .filter((p) => matchesFilter(p.name + " " + p.commanders.map((c) => c.name).join(" "), [...new Set(p.commanders.flatMap((c) => c.colorIdentity))], q, colors))
        .map(preconSummary),
    });
  } catch (err) {
    res.status(502).json({ error: `MTGJSON unavailable: ${err instanceof Error ? err.message : String(err)}` });
  }
});

app.get("/api/browse/precons/:fileName", async (req: Request, res: Response) => {
  try {
    const p = (await getPrecons()).find((x) => x.fileName === req.params.fileName);
    if (!p) res.status(404).json({ error: "Precon not found" });
    else res.json(p);
  } catch (err) {
    res.status(502).json({ error: `MTGJSON unavailable: ${err instanceof Error ? err.message : String(err)}` });
  }
});

app.post("/api/browse/precons/:fileName/import", async (req: Request, res: Response) => {
  try {
    const p = (await getPrecons()).find((x) => x.fileName === req.params.fileName);
    if (!p) {
      res.status(404).json({ error: "Precon not found" });
      return;
    }
    const name = await uniqueDeckName(typeof req.body?.name === "string" && req.body.name.trim() ? req.body.name.trim() : p.name, me(req).decks);
    if (!isValidDeckName(name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const deck = await createDeck(name, p.commanders[0].name, resolver, me(req).decks);
    // Partner commanders ride along as ordinary cards (a deck holds one commander).
    const cards = [...p.commanders.slice(1).map((c) => ({ name: c.name })), ...p.cards];
    const result = await addCards(name, cards, resolver, me(req).decks);
    logAction(req, `created deck "${name}" (commander ${deck.commander}) from precon "${p.name}"`, name);
    for (const r of result.rejected) logAction(req, `tried to add "${r.name}" to "${name}" — rejected: ${r.reason}`, name);
    res.json({ deck, added: result.added.length, rejected: result.rejected });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/browse/start", async (req: Request, res: Response) => {
  try {
    const { commander } = req.body ?? {};
    if (typeof commander !== "string" || !commander.trim()) {
      res.status(400).json({ error: "commander is required" });
      return;
    }
    const name = await uniqueDeckName(commander.trim(), me(req).decks);
    if (!isValidDeckName(name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const deck = await createDeck(name, commander.trim(), resolver, me(req).decks);
    logAction(req, `created deck "${deck.name}" (commander ${deck.commander})`, deck.name);
    res.json({ deck });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/browse/explore", async (req: Request, res: Response) => {
  try {
    const { q, colors } = req.query as { q?: string; colors?: string };
    const mine = await Promise.all(
      (await listDecks(me(req).decks))
        .filter((d) => matchesFilter(d.name + " " + d.commander, d.commanderIdentity, q, colors))
        .map(async (d) => ({
          name: d.name,
          commander: d.commander,
          colorIdentity: d.commanderIdentity,
          cardCount: d.cards.reduce((n, c) => n + (c.count ?? 1), 0),
          image: (await resolver(d.commander))?.image ?? null,
        }))
    );
    // A dead MTGJSON must not hide the user's own decks: report it beside them.
    let precons: ReturnType<typeof preconSummary>[] = [];
    let preconError: string | undefined;
    try {
      precons = (await getPrecons())
        .filter((p) => matchesFilter(p.name + " " + p.commanders.map((c) => c.name).join(" "), [...new Set(p.commanders.flatMap((c) => c.colorIdentity))], q, colors))
        .map(preconSummary);
    } catch (err) {
      preconError = `MTGJSON unavailable: ${err instanceof Error ? err.message : String(err)}`;
    }
    res.json({ decks: mine, precons, preconError });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// Other decks sharing the given deck's commander: the user's own + matching precons.
app.get("/api/browse/other-decks", async (req: Request, res: Response) => {
  try {
    const name = req.query.deck;
    if (!isValidDeckName(name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const cur = await getDeck(name, me(req).decks);
    if (!cur) {
      res.status(404).json({ error: "Deck not found" });
      return;
    }
    const cmd = cur.commander.toLowerCase();
    const decks = (await listDecks(me(req).decks))
      .filter((d) => d.name !== cur.name && d.commander.toLowerCase() === cmd)
      .map((d) => ({ name: d.name, commander: d.commander, cardCount: d.cards.reduce((n, c) => n + (c.count ?? 1), 0) }));
    let precons: ReturnType<typeof preconSummary>[] = [];
    let preconError: string | undefined;
    try {
      precons = (await getPrecons()).filter((p) => p.commanders.some((c) => c.name.toLowerCase() === cmd)).map(preconSummary);
    } catch (err) {
      preconError = `MTGJSON unavailable: ${err instanceof Error ? err.message : String(err)}`;
    }
    res.json({ commander: cur.commander, decks, precons, preconError });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/decks/:name/cards", async (req: Request, res: Response) => {
  try {
    if (!isValidDeckName(req.params.name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const { cards, board } = req.body ?? {};
    if (!Array.isArray(cards)) {
      res.status(400).json({ error: "cards array is required" });
      return;
    }
    const result = await addCards(req.params.name, cards, resolver, me(req).decks, { board: board === "side" ? "side" : "main" });
    for (const c of result.added) {
      logAction(req, `added "${c.name}"${c.tags?.length ? ` (${c.tags.join(", ")})` : ""} to ${c.board === "side" ? "sideboard of " : ""}"${req.params.name}"`, req.params.name);
    }
    for (const r of result.rejected) {
      logAction(req, `tried to add "${r.name}" to "${req.params.name}" — rejected: ${r.reason}`, req.params.name);
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
    const deck = await setCardTags(req.params.name, cards, me(req).decks);
    for (const c of cards) {
      logAction(req, `tagged "${c.name}" [${(c.tags ?? []).join(", ")}] in "${req.params.name}"`, req.params.name);
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
    const deck = await renameTag(req.params.name, from, to, me(req).decks);
    logAction(req, `renamed tag "${from}" → "${to}" in "${req.params.name}"`, req.params.name);
    res.json({ deck });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.patch("/api/decks/:name/board", async (req: Request, res: Response) => {
  try {
    if (!isValidDeckName(req.params.name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const { card, board } = req.body ?? {};
    if (typeof card !== "string" || (board !== "main" && board !== "side")) {
      res.status(400).json({ error: "card (string) and board (main|side) are required" });
      return;
    }
    const deck = await moveCardBoard(req.params.name, card, board, me(req).decks);
    logAction(req, `Moved ${card} to ${board === "side" ? "sideboard" : "mainboard"}`, req.params.name);
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
    const deck = await removeCards(req.params.name, cards, me(req).decks);
    for (const name of cards) {
      logAction(req, `removed "${name}" from "${req.params.name}"`, req.params.name);
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
    const ok = await deleteDeck(req.params.name, me(req).decks);
    if (!ok) {
      res.status(404).json({ error: "Deck not found" });
      return;
    }
    logAction(req, `deleted deck "${req.params.name}"`, req.params.name);
    deckHistory.delete(historyKey(req.user as string, req.params.name));
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
      { deckName, mode, targets: cfgOf(req).quotaTargets },
      resolver,
      me(req).decks
    )) as {
      created?: { name: string };
      added?: { name: string }[];
    };
    if (result.created) {
      logAction(req, `imported decklist into new deck "${result.created.name}"`, result.created.name);
    } else if (result.added && result.added.length > 0) {
      logAction(req, `imported ${result.added.length} card(s) into "${deckName}"`, deckName);
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
    const deck = await renameDeck(req.params.name, name, me(req).decks);
    logAction(req, `renamed deck "${req.params.name}" → "${name}"`, req.params.name);
    deckHistory.rename(historyKey(req.user as string, req.params.name), historyKey(req.user as string, name));
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
    const result = await setCommander(req.params.name, commander, resolver, me(req).decks);
    logAction(req, 
      `set commander of "${req.params.name}" to "${result.deck.commander}"` +
        (result.nowIllegal.length > 0 ? ` (${result.nowIllegal.length} card(s) now illegal)` : ""),
      req.params.name
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
    const result = await setCardCount(req.params.name, card, count, resolver, me(req).decks);
    if (result.updated) {
      logAction(req, `set "${result.updated.name}" count to ${result.updated.count} in "${req.params.name}"`, req.params.name);
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
    const result = await removeTag(req.params.name, tag, me(req).decks);
    logAction(req, `removed tag "${tag}" from ${result.affected} card(s) in "${req.params.name}"`, req.params.name);
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

app.patch("/api/decks/:name/meta", async (req: Request, res: Response) => {
  try {
    if (!isValidDeckName(req.params.name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const body = req.body ?? {};
    const bad = unknownMetaField(body);
    if (bad) {
      res.status(400).json({ error: bad });
      return;
    }
    // writing the deck file triggers the /api/deck-events watcher event
    const deck = await setDeckMeta(req.params.name, body, me(req).decks);
    logAction(req, `set meta (${Object.keys(body).join(", ")}) of "${req.params.name}"`, req.params.name);
    res.json({ deck });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(/not found/i.test(message) ? 404 : 400).json({ error: message });
  }
});

app.get("/api/decks/:name/history", (req: Request, res: Response) => {
  if (!isValidDeckName(req.params.name)) {
    res.status(400).json({ error: "invalid deck name" });
    return;
  }
  res.json({ entries: deckHistory.list(historyKey(req.user as string, req.params.name)) });
});

// ---- deck-events SSE: one recursive watch over users/, filtered per connection ----
// Recursive so a user dir created after boot (first request) is covered with no
// re-watch. The filter (deckEventFor) lets a connection see only its own decks.
const deckEventListeners = new Set<(rel: string | null) => void>();
let usersWatcher: fs.FSWatcher | null = null;
function ensureUsersWatcher(): void {
  if (usersWatcher) return;
  fs.mkdirSync(USERS_DIR, { recursive: true });
  usersWatcher = fs.watch(USERS_DIR, { recursive: true }, (_eventType, filename) => {
    const rel = filename ? String(filename) : null;
    for (const fn of deckEventListeners) fn(rel);
  });
  usersWatcher.on("error", (err) => console.error("users watcher error:", err));
}

app.get("/api/deck-events", (req: Request, res: Response) => {
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const user = req.user as string;
  me(req); // make sure the user's dirs exist before any change lands
  ensureUsersWatcher();
  const onFile = (rel: string | null) => {
    const name = deckEventFor(user, rel);
    if (name) sseWrite(res, { name });
  };
  deckEventListeners.add(onFile);

  const onHistory = (u: string, deck: string, entry: { at: string; action: string }) => {
    if (u === user) sseWrite(res, { type: "history", deck, entry });
  };
  historyListeners.add(onHistory);

  req.on("close", () => {
    deckEventListeners.delete(onFile);
    historyListeners.delete(onHistory);
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
    }, me(req).collection);

    res.json({ ok: true, stats: { ...buildImportResult(cards, mapResult), importedAt } });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.get("/api/collection", async (req: Request, res: Response) => {
  try {
    const stats = collectionStats(me(req).collection);
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


// ---- suggestions: AI proposes deck changes, human accepts/rejects ----
// The AI writes these through the MCP deck_suggest tool; this surface is for
// browsing and deciding them (mobile-friendly UI at /suggestions).

app.get("/api/decks/:name/suggestions", async (req: Request, res: Response) => {
  try {
    if (!isValidDeckName(req.params.name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const all = await listSuggestions(req.params.name, me(req).suggestions);
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const suggestions = status ? all.filter((s) => s.status === status) : all;
    res.json({
      deck: req.params.name,
      pending: all.filter((s) => s.status === "pending").length,
      suggestions,
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/decks/:name/suggestions", async (req: Request, res: Response) => {
  try {
    if (!isValidDeckName(req.params.name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const proposals = Array.isArray(req.body) ? req.body : req.body?.suggestions;
    if (!Array.isArray(proposals) || proposals.length === 0) {
      res.status(400).json({ error: "expected a non-empty 'suggestions' array" });
      return;
    }
    const all = await addSuggestions(req.params.name, proposals, me(req).suggestions);
    res.json({ deck: req.params.name, added: proposals.length, suggestions: all });
  } catch (err) {
    // Validation failures (missing 'in'/'out'/'why') are client errors.
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.post("/api/decks/:name/suggestions/:id/:verdict", async (req: Request, res: Response) => {
  try {
    const { name, id, verdict } = req.params;
    if (!isValidDeckName(name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    if (verdict !== "accept" && verdict !== "reject") {
      res.status(400).json({ error: "verdict must be 'accept' or 'reject'" });
      return;
    }
    const status = verdict === "accept" ? "accepted" : "rejected";

    // Validate BEFORE recording the verdict. decideSuggestion refuses to
    // decide the same suggestion twice, so writing the verdict first and
    // then failing would leave it accepted-but-unapplied with no way to
    // retry. Check the deck can take the change, then record, then apply.
    let outCard: string | undefined;
    if (status === "accepted") {
      const pendingList = await listSuggestions(name, me(req).suggestions);
      const target = pendingList.find((s) => s.id === id);
      if (target?.out) {
        const current = await getDeck(name, me(req).decks);
        const present = current?.cards.some(
          (c) => c.name.toLowerCase() === target.out!.toLowerCase(),
        );
        if (!present) {
          res.status(409).json({
            deck: name,
            error: `"${target.out}" is no longer in the deck — suggestion is stale`,
          });
          return;
        }
        outCard = target.out;
      }
    }

    const suggestion = await decideSuggestion(name, id, status, req.body?.note, me(req).suggestions);

    // Accepting records intent AND applies the card change, so the mobile
    // surface is one tap. decideSuggestion never writes the deck file itself,
    // keeping a single writer per deck.
    let applied: unknown = null;
    if (status === "accepted") {
      if (outCard) {
        await removeCards(name, [outCard], me(req).decks);
      }
      if (suggestion.in) {
        applied = await addCards(
          name,
          [{ name: suggestion.in, ...(suggestion.role ? { tags: [suggestion.role] } : {}) }],
          resolver,
          me(req).decks,
        );
      }
    }
    logAction(req, 
      `${status} suggestion ${suggestion.in ? `+"${suggestion.in}"` : ""}${suggestion.out ? ` -"${suggestion.out}"` : ""} in "${name}"`,
      name,
    );
    res.json({ deck: name, suggestion, applied });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

app.delete("/api/decks/:name/suggestions", async (req: Request, res: Response) => {
  try {
    if (!isValidDeckName(req.params.name)) {
      res.status(400).json({ error: "invalid deck name" });
      return;
    }
    const removed = await clearDecided(req.params.name, me(req).suggestions);
    res.json({ deck: req.params.name, removed });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

// ---- settings surface: scrychat.config.json read/write over HTTP (issue #37) ----
app.get("/api/config", (req: Request, res: Response) => {
  const config = cfgOf(req);
  res.json({
    ...config,
    recognizedQuotaTags: RECOGNIZED_QUOTA_TAGS,
    effectiveQuotaTargets: resolveQuotaTargets(config.quotaTargets),
  });
});

app.patch("/api/config", (req: Request, res: Response) => {
  const config = cfgOf(req);
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
    persistConfig(me(req).config, config);
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
app.get("/api/health", (req: Request, res: Response) => {
  const skillPath = path.join(REPO_ROOT, ".claude/skills/edh-deck-builder/SKILL.md");
  let skillLoaded = false;
  try {
    fs.accessSync(skillPath, fs.constants.R_OK);
    skillLoaded = true;
  } catch {
    skillLoaded = false;
  }

  const dbPath = path.join(REPO_ROOT, "data/scrychat.db");
  // NOT getLocalDb() for `exists`: getLocalDb conflates "file absent" with
  // "file present, zero cards" by design (both mean "fall back to live
  // Scryfall" for its normal callers). A diagnostic endpoint is the one caller
  // that must tell them apart, so existence comes from stat and counts from a
  // direct read-only open (see health-core.ts). `usableAsMirror` keeps the old
  // getLocalDb signal under an honest name.
  const dbHealth = getDbHealth(dbPath);

  res.json({
    ok: true,
    repoRoot: REPO_ROOT,
    skillLoaded,
    skillPath,
    db: dbHealth,
    collection: getCollectionHealth(me(req).collection),
  });
});

// ---- static UI (built by apps/web/ui -> ui/dist) ----

// ---- mobile browse surface for suggestions (server-rendered, no build step) ----
// Deliberately not part of the React app: this is a read-mostly phone surface,
// so a single self-contained page avoids a Vite build and loads on one request.
app.get("/suggestions", async (req: Request, res: Response) => {
  const deckParam = typeof req.query.deck === "string" ? req.query.deck : undefined;
  try {
    const decks = await listDecks(me(req).decks);
    const deckName = deckParam && isValidDeckName(deckParam) ? deckParam : decks[0]?.name;
    if (!deckName) {
      res.type("html").send(renderSuggestionsPage(null, [], [], ""));
      return;
    }
    const suggestions = await listSuggestions(deckName, me(req).suggestions);
    const deck = await getDeck(deckName, me(req).decks);
    res.type("html").send(
      renderSuggestionsPage(deck, suggestions, decks.map((d) => d.name), deckName),
    );
  } catch (err) {
    res.status(500).type("html").send(
      `<pre>${escapeHtml(err instanceof Error ? err.message : String(err))}</pre>`,
    );
  }
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string,
  );
}

function renderSuggestionsPage(
  deck: Awaited<ReturnType<typeof getDeck>>,
  suggestions: Awaited<ReturnType<typeof listSuggestions>>,
  deckNames: string[],
  activeDeck: string,
): string {
  const pending = suggestions.filter((s) => s.status === "pending");
  const decided = suggestions.filter((s) => s.status !== "pending");
  const art = (name: string) =>
    `https://api.scryfall.com/cards/named?exact=${encodeURIComponent(name)}&format=image&version=art_crop`;

  const card = (s: (typeof suggestions)[number]) => {
    const rows = [
      s.out ? `<div class="c out"><img loading="lazy" src="${art(s.out)}" alt=""><span class="m">&minus;</span><span class="n">${escapeHtml(s.out)}</span></div>` : "",
      s.in ? `<div class="c in"><img loading="lazy" src="${art(s.in)}" alt=""><span class="m">+</span><span class="n">${escapeHtml(s.in)}</span></div>` : "",
    ].join("");
    const acts =
      s.status === "pending"
        ? `<div class="acts">
             <button class="acc" data-id="${s.id}" data-v="accept">Accept</button>
             <button class="rej" data-id="${s.id}" data-v="reject">Reject</button>
           </div>`
        : `<div class="verdict ${s.status}">${s.status}${s.note ? " &middot; " + escapeHtml(s.note) : ""}</div>`;
    return `<article class="s ${s.status}" id="${s.id}">
      <header><span class="k ${s.kind}">${s.kind}</span>${s.role ? `<span class="r">${escapeHtml(s.role)}</span>` : ""}<span class="id">${s.id}</span></header>
      ${rows}
      <p class="why">${escapeHtml(s.why)}</p>
      ${acts}
    </article>`;
  };

  const picker =
    deckNames.length > 1
      ? `<select id="deck">${deckNames
          .map((n) => `<option${n === activeDeck ? " selected" : ""}>${escapeHtml(n)}</option>`)
          .join("")}</select>`
      : `<span class="dn">${escapeHtml(activeDeck)}</span>`;

  return `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>scrychat suggestions${activeDeck ? " — " + escapeHtml(activeDeck) : ""}</title>
<style>
  :root{--bg:#0e1013;--p:#16191e;--l:#262b33;--ink:#e7e9ee;--dim:#878e9c;
    --ok:#4ec98a;--cut:#e0675f;--swap:#6ba8f5}
  *{box-sizing:border-box;-webkit-tap-highlight-color:transparent}
  body{margin:0;background:var(--bg);color:var(--ink);
    font:16px/1.5 ui-sans-serif,-apple-system,"Segoe UI",Roboto,sans-serif;
    padding:0 0 env(safe-area-inset-bottom)}
  .top{position:sticky;top:0;background:#0e1013f2;backdrop-filter:blur(8px);
    border-bottom:1px solid var(--l);padding:12px 16px;display:flex;
    align-items:center;gap:10px;z-index:5}
  h1{font-size:15px;margin:0;font-weight:600}
  .count{margin-left:auto;font-size:13px;color:var(--dim)}
  select,.dn{background:#1b1f26;color:var(--ink);border:1px solid var(--l);
    border-radius:7px;padding:6px 9px;font:inherit;font-size:13px;max-width:52vw}
  main{padding:14px 16px 28px;max-width:720px;margin:0 auto}
  .s{background:var(--p);border:1px solid var(--l);border-radius:11px;
    padding:14px;margin-bottom:12px}
  .s.rejected{opacity:.5}.s.accepted{border-color:#2c4a39}
  .s header{display:flex;align-items:center;gap:8px;margin-bottom:11px}
  .k{font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;
    padding:3px 7px;border-radius:4px;color:#0e1013}
  .k.add{background:var(--ok)}.k.cut{background:var(--cut)}.k.swap{background:var(--swap)}
  .r{font-size:12.5px;color:var(--dim)}
  .id{margin-left:auto;font-size:11px;color:#5c636f}
  .c{display:flex;align-items:center;gap:9px;background:#1b1f26;
    border:1px solid var(--l);border-radius:8px;padding:7px 11px 7px 7px;margin-bottom:7px}
  .c img{width:58px;height:42px;object-fit:cover;border-radius:5px;background:#232830;flex:0 0 auto}
  .c .m{font-weight:700;flex:0 0 auto}
  .c.out .m{color:var(--cut)}.c.in .m{color:var(--ok)}
  .c.out .n{text-decoration:line-through;color:var(--dim)}
  .n{font-size:14.5px;min-width:0;overflow-wrap:anywhere}
  .why{margin:9px 0 0;font-size:14px;color:#c3c9d4}
  .acts{display:flex;gap:9px;margin-top:13px}
  button{flex:1;font:inherit;font-size:15px;padding:11px;border-radius:9px;
    border:1px solid var(--l);background:#1b1f26;color:var(--ink);min-height:44px}
  button:active{transform:scale(.98)}
  button:disabled{opacity:.4}
  .acc{border-color:#2c4a39;color:var(--ok)}
  .rej{border-color:#4a2c2c;color:var(--cut)}
  .verdict{margin-top:11px;font-size:12.5px;text-transform:uppercase;
    letter-spacing:.05em;color:var(--dim)}
  .verdict.accepted{color:var(--ok)}.verdict.rejected{color:var(--cut)}
  h2{font-size:12px;text-transform:uppercase;letter-spacing:.09em;color:var(--dim);
    margin:24px 0 11px;font-weight:600}
  .empty{color:var(--dim);font-size:14.5px;text-align:center;padding:48px 16px;line-height:1.7}
  .empty code{background:#1b1f26;padding:2px 6px;border-radius:4px;font-size:13px}
</style>
<div class="top">
  <h1>Suggestions</h1>
  ${picker}
  <span class="count">${pending.length} pending</span>
</div>
<main>
  ${
    suggestions.length === 0
      ? `<p class="empty">No suggestions for this deck yet.<br>Ask Claude to review it, then it calls<br><code>deck_suggest</code>.</p>`
      : ""
  }
  ${pending.map(card).join("")}
  ${decided.length ? `<h2>Decided</h2>` + decided.map(card).join("") : ""}
</main>
<script>
  const deck = ${JSON.stringify(activeDeck)};
  const sel = document.getElementById("deck");
  if (sel) sel.onchange = () => { location.search = "?deck=" + encodeURIComponent(sel.value); };

  for (const b of document.querySelectorAll(".acc,.rej")) {
    b.addEventListener("click", async () => {
      const card = b.closest(".s");
      for (const x of card.querySelectorAll("button")) x.disabled = true;
      b.textContent = "...";
      try {
        const r = await fetch(
          "/api/decks/" + encodeURIComponent(deck) + "/suggestions/" +
            encodeURIComponent(b.dataset.id) + "/" + b.dataset.v,
          { method: "POST", headers: { "content-type": "application/json" }, body: "{}" },
        );
        if (!r.ok) throw new Error((await r.json()).error || r.statusText);
        location.reload();
      } catch (e) {
        b.textContent = "Failed";
        alert(e.message);
        for (const x of card.querySelectorAll("button")) x.disabled = false;
      }
    });
  }
</script>`;
}

const UI_DIST = path.resolve(__dirname, "../ui/dist");
app.use(express.static(UI_DIST));

// SPA fallback: serve index.html for any non-API GET
app.get(/^\/(?!api\/).*/, (req: Request, res: Response) => {
  res.sendFile(path.join(UI_DIST, "index.html"), (err) => {
    if (err) res.status(404).send("UI not built. Run: pnpm --filter @scrychat/web build");
  });
});

// One-time move of the pre-multi-user data (REPO_ROOT/decks, chats, ...) into
// users/<OWNER_EMAIL>. Runs only when OWNER_EMAIL is set and that dir is absent.
if (OWNER_ID) {
  try {
    const moved = migrateLegacy(REPO_ROOT, USERS_DIR, OWNER_ID);
    if (moved) console.log(`migration: copied ${moved.join(", ")} into ${path.join(USERS_DIR, OWNER_ID)} (legacy copies left in place)`);
  } catch (err) {
    console.error("migration failed:", err);
  }
}

app.listen(PORT, () => {
  // Every non-loopback IPv4 this host answers on. `app.listen(PORT)` with no
  // host already binds all interfaces, so a reader on another machine can use
  // any of these -- and printing `localhost` told them the opposite. Plain
  // http must use the ADDRESS: a *.ts.net name is HSTS-preloaded, so http
  // forces https and fails with ERR_SSL_PROTOCOL_ERROR.
  const addrs = Object.values(os.networkInterfaces())
    .flatMap((ifaces) => ifaces ?? [])
    .filter((i) => i.family === "IPv4" && !i.internal)
    .map((i) => i.address);
  console.log(`scrychat web listening on http://localhost:${PORT} (this host)`);
  for (const a of addrs) console.log(`  reachable at http://${a}:${PORT}`);
  console.log(`repo root: ${REPO_ROOT}`);
  console.log(`mcp server: ${MCP_SERVER_PATH}`);
  if (CF_TEAM && CF_AUD) console.log(`auth: Cloudflare Access (${CF_TEAM})`);
  else if (DEV_USER) console.warn(`!!! SCRYCHAT_DEV_USER=${DEV_USER}: AUTH BYPASSED, every request is that user. Local dev only; never set this on the NAS.`);
  else console.warn("auth: CF_TEAM/CF_AUD unset and no SCRYCHAT_DEV_USER: every /api request will be 401");
});
