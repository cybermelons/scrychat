#!/usr/bin/env node
/**
 * Tier B behavioral formatting-contract eval harness for scrychat
 * (issue #42; see evals/golden.md, B-fmt-1..6).
 *
 * Plain Node, no deps. Starts the built web server itself
 * (apps/web/dist/server.js) on a random free port with a stripped env (no
 * ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN — a stray key shadows subscription
 * auth), drives POST /api/chat over SSE with ONE cheap prompt per contract,
 * and asserts mechanically (regex/JSON) over the PERSISTED chat files
 * (chats/<id>.json segments) plus the live SSE tool-event log. Judge-free.
 *
 * Why persisted segments, not streamed deltas: the linkify / group-chip
 * post-passes mutate text segments AFTER the `done` SSE event (server.ts
 * emits `segments-update` in its finally block), so chats/<id>.json is the
 * source of truth for card-ref / chip / embed contracts.
 *
 * B-fmt-5 is pure HTTP (GET /api/decks/:name/export?format=mtga) — the
 * export shape is a code contract, no LLM needed.
 *
 * Cleanup: every chat this run creates is deleted via DELETE /api/chats/:id;
 * tmp decks (tmp-tier-b-*) via DELETE /api/decks/:name plus an fs backstop
 * sweep over decks/tmp-tier-b-*.json ONLY. Never touches user decks/chats.
 *
 * `--contract` flag accepted for gate symmetry with the issue text; the
 * default run already IS the contract subset (all six checks are cheap).
 *
 * Mirrors run-tier-c.mjs style: one OK/FAIL line per check, exit 1 on any
 * FAIL, ends with `TIER B: n/6 PASSED`.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SERVER_PATH = path.join(REPO_ROOT, "apps", "web", "dist", "server.js");
const DECKS_DIR = path.join(REPO_ROOT, "decks");

const CHAT_TIMEOUT_MS = 240_000;

const results = []; // { id, ok, msg }

function record(id, ok, msg) {
  results.push({ id, ok, msg });
  console.log(`${ok ? "OK" : "FAIL"}: ${id} ${msg}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- free port picker: bind to 0, read assigned port, close ---
function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

// ---- contract matchers ----
const EMBED_RE = /!\[\[[^\]]+\]\]/g;
// populated group chip: [[group:LABEL|member(;member)*]] with non-empty members
const GROUP_CHIP_RE = /\[\[group:[^\]|]+\|[^\]]+\]\]/g;

// Extract fenced code blocks (``` ... ```). Returns array of inner contents.
function codeFences(text) {
  const fences = [];
  const re = /```[^\n]*\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(text)) !== null) fences.push(m[1]);
  return fences;
}

// Is `name` wrapped as a card-ref [[name]] or [[name|alias]] in `text`?
function hasCardRef(text, name) {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\[\\[${esc}(\\|[^\\]]+)?\\]\\]`, "i").test(text);
}

function frontFace(name) {
  return name.split(" // ")[0];
}

async function main() {
  if (!fs.existsSync(SERVER_PATH)) {
    console.error(`server build missing: ${SERVER_PATH} (run: pnpm -r build)`);
    process.exit(1);
  }

  const port = await getFreePort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const env = { ...process.env, PORT: String(port) };
  delete env.ANTHROPIC_API_KEY;
  delete env.ANTHROPIC_AUTH_TOKEN;

  const child = spawn(process.execPath, [SERVER_PATH], {
    cwd: REPO_ROOT,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderrBuf = "";
  child.stdout.on("data", () => {});
  child.stderr.on("data", (d) => {
    stderrBuf += d.toString();
  });

  const createdChatIds = new Set();
  const tmpDeckNames = new Set();

  // ---- SSE chat helper: POST /api/chat, parse the event stream ----
  // Returns { chatId, events } where events is the ordered parsed event log
  // ({type:"chat"|"text-delta"|"tool-use"|"tool-result"|"segments-update"|"done", ...}).
  // Reads until the stream actually closes (linkify's segments-update fires
  // AFTER done), or until timeoutMs (abort, return what arrived).
  async function chat({ message, chatId, activeDeck }, timeoutMs = CHAT_TIMEOUT_MS) {
    const body = { message };
    if (chatId) body.chatId = chatId;
    if (activeDeck) body.activeDeck = activeDeck;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const events = [];
    let resolvedChatId = chatId ?? null;

    try {
      const res = await fetch(`${baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`POST /api/chat status=${res.status}`);
      }
      const decoder = new TextDecoder();
      let buf = "";
      for await (const chunk of res.body) {
        buf += decoder.decode(chunk, { stream: true });
        let idx;
        while ((idx = buf.indexOf("\n\n")) !== -1) {
          const frame = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            let ev;
            try {
              ev = JSON.parse(line.slice(6));
            } catch {
              continue;
            }
            events.push(ev);
            if (ev.type === "chat" && typeof ev.chatId === "string") {
              resolvedChatId = ev.chatId;
              createdChatIds.add(ev.chatId);
            }
          }
        }
      }
    } catch (err) {
      if (err.name !== "AbortError") throw err;
      // timeout: return what arrived so the assertion can report on it
    } finally {
      clearTimeout(timer);
    }
    return { chatId: resolvedChatId, events };
  }

  // ---- persisted-chat reader: last assistant message's segments ----
  // Retries for up to ~15s: a client-side stream timeout/abort can race the
  // server's post-stream persist (assistant message is appended in the
  // /api/chat handler's finally block), so the file may briefly hold only
  // the user message.
  async function readPersisted(chatIdVal) {
    const deadline = Date.now() + 15_000;
    for (;;) {
      const res = await fetch(`${baseUrl}/api/chats/${encodeURIComponent(chatIdVal)}`);
      if (res.status !== 200) throw new Error(`GET /api/chats/${chatIdVal} status=${res.status}`);
      const chatFile = await res.json();
      const assistants = (chatFile.messages ?? []).filter((m) => m.role === "assistant");
      const last = assistants[assistants.length - 1];
      if (last) {
        const segments = last.segments ?? [];
        const text = segments
          .filter((s) => s.type === "text")
          .map((s) => s.text)
          .join("");
        return { segments, text, tools: last.tools ?? [] };
      }
      if (Date.now() >= deadline) {
        throw new Error(`no assistant message persisted in chat ${chatIdVal}`);
      }
      await sleep(500);
    }
  }

  async function apiJson(method, url, bodyObj) {
    const res = await fetch(`${baseUrl}${url}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: bodyObj === undefined ? undefined : JSON.stringify(bodyObj),
    });
    let json = null;
    try {
      json = await res.json();
    } catch {}
    return { status: res.status, json };
  }

  try {
    // --- wait for readiness: poll GET /api/decks until 200, timeout 15s ---
    const readyDeadline = Date.now() + 15000;
    let ready = false;
    while (Date.now() < readyDeadline) {
      try {
        const res = await fetch(`${baseUrl}/api/decks`);
        if (res.status === 200) {
          ready = true;
          break;
        }
      } catch {
        // server not up yet
      }
      await sleep(200);
    }
    if (!ready) {
      throw new Error(`server did not become ready within 15s on port ${port}`);
    }

    // ---- shared tmp deck for B-fmt-1 / B-fmt-3 (mono-B commander) ----
    const deckName = `tmp-tier-b-${Date.now()}`;
    tmpDeckNames.add(deckName);
    let deckCards = []; // added entries: { name }
    {
      const create = await apiJson("POST", "/api/decks", {
        name: deckName,
        commander: "Sheoldred, the Apocalypse",
      });
      if (create.status !== 200) {
        throw new Error(`tmp deck create failed: status=${create.status} ${JSON.stringify(create.json)}`);
      }
      const add = await apiJson("POST", `/api/decks/${encodeURIComponent(deckName)}/cards`, {
        cards: [
          { name: "Sol Ring", tags: ["ramp"] },
          { name: "Swamp", tags: ["land"] },
          { name: "Demonic Tutor", tags: ["tutor"] },
          { name: "Sign in Blood", tags: ["draw"] },
        ],
      });
      deckCards = add.json?.added ?? [];
      if (deckCards.length === 0) {
        throw new Error(`tmp deck seed add failed: ${JSON.stringify(add.json)}`);
      }
    }

    // --- B-fmt-1: 'decklist as codeblock' → one fence, no [[ inside, all cards present ---
    try {
      const { chatId } = await chat({
        message: `Export the deck "${deckName}" as a codeblock so I can copy it into Arena.`,
        activeDeck: deckName,
      });
      const { text } = await readPersisted(chatId);
      const fences = codeFences(text);
      const fenceCountOk = fences.length === 1;
      const fence = fences[0] ?? "";
      const refLeaks = (fence.match(/\[\[/g) ?? []).length;
      const fenceLines = fence.split("\n").map((l) => l.trim());
      const wantLines = [
        `1 ${frontFace("Sheoldred, the Apocalypse")}`,
        ...deckCards.map((c) => frontFace(c.name)),
      ];
      const missing = wantLines.filter(
        (w) => !fenceLines.some((l) => l === w || l.endsWith(` ${w}`) || l.includes(w)),
      );
      const ok = fenceCountOk && refLeaks === 0 && missing.length === 0;
      record(
        "B-fmt-1",
        ok,
        `fences=${fences.length} (want 1) cardRefLeaksInFence=${refLeaks} missingLines=${JSON.stringify(missing)}`,
      );
    } catch (err) {
      record("B-fmt-1", false, `threw: ${err.message}`);
    }

    // --- B-fmt-2: card table → every name cell is a card-ref span ---
    try {
      const names = ["Sol Ring", "Arcane Signet", "Mind Stone"];
      const { chatId } = await chat({
        message:
          "Make a small markdown table comparing these three cards side by side: Sol Ring, Arcane Signet, and Mind Stone. Columns: card name, mana cost, what it does.",
      });
      const { text } = await readPersisted(chatId);
      // table region: contiguous lines containing '|'
      const tableText = text
        .split("\n")
        .filter((l) => l.includes("|"))
        .join("\n");
      const hasTable = tableText.length > 0;
      const bare = names.filter((n) => !hasCardRef(tableText, n));
      const ok = hasTable && bare.length === 0;
      record(
        "B-fmt-2",
        ok,
        `hasTable=${hasTable} unwrappedNames=${JSON.stringify(bare)}`,
      );
    } catch (err) {
      record("B-fmt-2", false, `threw: ${err.message}`);
    }

    // --- B-fmt-3: role mention in prose → populated [[group:]] chip ---
    try {
      const { chatId } = await chat({
        message:
          "In one or two sentences: do I need more board wipes in this deck? Mention the board wipes category.",
        activeDeck: deckName,
      });
      const { text } = await readPersisted(chatId);
      const chips = text.match(GROUP_CHIP_RE) ?? [];
      const ok = chips.length >= 1;
      record(
        "B-fmt-3",
        ok,
        `populatedChips=${chips.length} sample=${JSON.stringify(chips[0] ?? null)}`,
      );
    } catch (err) {
      record("B-fmt-3", false, `threw: ${err.message}`);
    }

    // --- B-fmt-4: embed rubric — focal card exactly one ![[..]], list zero ---
    try {
      const { chatId: idA } = await chat({ message: "Tell me about the card Doubling Season." });
      const { text: textA } = await readPersisted(idA);
      const embedsA = (textA.match(EMBED_RE) ?? []).length;

      const { chatId: idB } = await chat({ message: "List a few token doublers as a bulleted list." });
      const { text: textB } = await readPersisted(idB);
      const embedsB = (textB.match(EMBED_RE) ?? []).length;

      const ok = embedsA === 1 && embedsB === 0;
      record("B-fmt-4", ok, `focalEmbeds=${embedsA} (want 1) listEmbeds=${embedsB} (want 0)`);
    } catch (err) {
      record("B-fmt-4", false, `threw: ${err.message}`);
    }

    // --- B-fmt-5: mtga export of a DFC deck → front-face names only (pure HTTP) ---
    try {
      const dfcDeck = `tmp-tier-b-dfc-${Date.now()}`;
      tmpDeckNames.add(dfcDeck);
      const create = await apiJson("POST", "/api/decks", {
        name: dfcDeck,
        commander: "Sheoldred, the Apocalypse",
      });
      if (create.status !== 200) throw new Error(`dfc deck create status=${create.status}`);
      const add = await apiJson("POST", `/api/decks/${encodeURIComponent(dfcDeck)}/cards`, {
        cards: [
          { name: "Malakir Rebirth", tags: ["interaction"] },
          { name: "Agadeem's Awakening", tags: ["ramp"] },
        ],
      });
      const added = (add.json?.added ?? []).map((c) => c.name);
      const storedAsDfc = added.filter((n) => n.includes(" // "));
      const res = await fetch(
        `${baseUrl}/api/decks/${encodeURIComponent(dfcDeck)}/export?format=mtga`,
      );
      const exportText = await res.text();
      const dfcLeaks = (exportText.match(/ \/\/ /g) ?? []).length;
      const lines = exportText.split("\n");
      const hasMalakir = lines.includes("1 Malakir Rebirth");
      const hasAgadeem = lines.includes("1 Agadeem's Awakening");
      const hasCommander = lines.includes("1 Sheoldred, the Apocalypse");
      const ok =
        res.status === 200 &&
        added.length === 2 &&
        storedAsDfc.length === 2 && // proves the deck really stores full "Front // Back" names
        dfcLeaks === 0 &&
        hasMalakir &&
        hasAgadeem &&
        hasCommander;
      record(
        "B-fmt-5",
        ok,
        `status=${res.status} storedAsDfc=${storedAsDfc.length}/2 dfcLeaksInExport=${dfcLeaks} ` +
          `frontFaceLines: malakir=${hasMalakir} agadeem=${hasAgadeem} commander=${hasCommander}`,
      );
    } catch (err) {
      record("B-fmt-5", false, `threw: ${err.message}`);
    }

    // --- B-fmt-6: Arena availability question → ≥1 tool call precedes the answer ---
    try {
      const { chatId, events } = await chat({
        message: "Is the card Village Bell-Ringer available on MTG Arena? Answer briefly.",
      });
      const toolUses = events.filter((e) => e.type === "tool-use").map((e) => e.name);
      // Persisted tools[] as a second witness (survives even if SSE parsing hiccuped)
      let persistedTools = [];
      try {
        persistedTools = (await readPersisted(chatId)).tools.map((t) => t.name);
      } catch {}
      const ok = toolUses.length >= 1 || persistedTools.length >= 1;
      record(
        "B-fmt-6",
        ok,
        `sseToolUses=${JSON.stringify(toolUses)} persistedTools=${JSON.stringify(persistedTools)} (want >=1, no from-memory Arena claims)`,
      );
    } catch (err) {
      record("B-fmt-6", false, `threw: ${err.message}`);
    }
  } finally {
    // ---- cleanup: only artifacts this run created ----
    for (const id of createdChatIds) {
      try {
        await fetch(`${baseUrl}/api/chats/${encodeURIComponent(id)}`, { method: "DELETE" });
      } catch {}
    }
    for (const name of tmpDeckNames) {
      try {
        await fetch(`${baseUrl}/api/decks/${encodeURIComponent(name)}`, { method: "DELETE" });
      } catch {}
    }
    // fs backstop: ONLY tmp-tier-b-* deck files
    try {
      for (const f of fs.readdirSync(DECKS_DIR)) {
        if (f.startsWith("tmp-tier-b-") && f.endsWith(".json")) {
          fs.rmSync(path.join(DECKS_DIR, f), { force: true });
        }
      }
    } catch {}
    child.kill();
    if (process.env.TIER_B_DEBUG && stderrBuf.trim()) {
      console.error("--- server stderr ---");
      console.error(stderrBuf.trim());
    }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nTIER B: ${passed}/6 PASSED`);
  if (passed < results.length || results.length < 6) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("tier-b eval crashed:", err);
  process.exit(1);
});
