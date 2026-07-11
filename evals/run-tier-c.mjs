#!/usr/bin/env node
/**
 * Tier C mechanical eval harness for scrychat (see evals/golden.md, C1-C9).
 *
 * Plain Node, no deps. Starts the built web server itself (apps/web/dist/server.js)
 * on a random free port, with a stripped env (no ANTHROPIC_API_KEY/ANTHROPIC_AUTH_TOKEN
 * so a stray key can't shadow subscription auth — see server.ts's own startup guard),
 * and drives its HTTP API with plain fetch/http calls. No LLM calls in the default run.
 *
 * Mirrors run-tier-a.mjs's style: one OK/FAIL line per check, exit 1 on any FAIL,
 * ends with `TIER C: n/10 PASSED`.
 *
 * C-COLLECT: Arena-collection import e2e (POST/GET /api/collection + owned flag via
 * a spawned MCP server's get_card, mirroring packages/mcp/test/rpc-smoke.mjs). Uses a
 * fixture Player.log (evals/fixtures/arena-player.log) and backs up/restores any
 * pre-existing repo-root collection.json around the check.
 *
 * --with-chat: also runs three LLM-dependent checks against POST /api/chat (skipped
 * by default). These are judged by simple substring match and may be flaky.
 */

import { spawn } from "node:child_process";
import { createServer } from "node:net";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SERVER_PATH = path.join(REPO_ROOT, "apps", "web", "dist", "server.js");
const DECKS_DIR = path.join(REPO_ROOT, "decks");
const COLLECTION_JSON_PATH = path.join(REPO_ROOT, "collection.json");
const MCP_SERVER_PATH = path.join(REPO_ROOT, "packages", "mcp", "dist", "index.js");
const FIXTURE_LOG_PATH = path.join(__dirname, "fixtures", "arena-player.log");

const WITH_CHAT = process.argv.includes("--with-chat");

const results = []; // { id, ok, msg }

function record(id, ok, msg) {
  results.push({ id, ok, msg });
  console.log(`${ok ? "OK" : "FAIL"}: ${id} ${msg}`);
}

function skip(id, msg) {
  console.log(`SKIP: ${id} ${msg}`);
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

  let stdoutBuf = "";
  let stderrBuf = "";
  child.stdout.on("data", (d) => {
    stdoutBuf += d.toString();
  });
  child.stderr.on("data", (d) => {
    stderrBuf += d.toString();
  });

  const tmpDeckNames = new Set();

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

    const deckName = `tmp-tier-c-${Date.now()}`;
    tmpDeckNames.add(deckName);

    // --- C1: deck create ---
    let c1Deck = null;
    try {
      const res = await fetch(`${baseUrl}/api/decks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: deckName, commander: "Trostani, Selesnya's Voice" }),
      });
      const json = await res.json();
      c1Deck = json.deck;
      const commanderOk = typeof c1Deck?.commander === "string" && /trostani/i.test(c1Deck.commander);
      const ci = Array.isArray(c1Deck?.commanderIdentity) ? c1Deck.commanderIdentity.join("") : "";
      const ciOk = ci.split("").every((c) => c === "G" || c === "W") && ci.length > 0;
      const ok = res.status === 200 && commanderOk && ciOk;
      record(
        "C1",
        ok,
        `status=${res.status} commander="${c1Deck?.commander}" commanderIdentity=${JSON.stringify(c1Deck?.commanderIdentity)}`,
      );
    } catch (err) {
      record("C1", false, `threw: ${err.message}`);
    }

    // --- C2: add accepted + rejected ---
    try {
      const res = await fetch(`${baseUrl}/api/decks/${encodeURIComponent(deckName)}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cards: [
            { name: "Sol Ring", tags: ["ramp", "combo piece"] },
            { name: "Lightning Bolt" },
          ],
        }),
      });
      const json = await res.json();
      const added = json.added ?? [];
      const rejected = json.rejected ?? [];
      const solRingAdded = added.some((c) => c.name === "Sol Ring");
      const bolt = rejected.find((r) => r.name === "Lightning Bolt");
      const boltRejectedWithIdentity = Boolean(bolt && /identity/i.test(bolt.reason ?? ""));
      const ok = res.status === 200 && solRingAdded && boltRejectedWithIdentity;
      record(
        "C2",
        ok,
        `status=${res.status} added=${JSON.stringify(added.map((c) => c.name))} rejected=${JSON.stringify(rejected)}`,
      );
    } catch (err) {
      record("C2", false, `threw: ${err.message}`);
    }

    // --- C3: deck payload shape ---
    try {
      const res = await fetch(`${baseUrl}/api/decks/${encodeURIComponent(deckName)}`);
      const json = await res.json();
      const solRing = (json.deck?.cards ?? []).find((c) => c.name === "Sol Ring");
      const imageOk = typeof solRing?.image === "string" && solRing.image.includes("cards.scryfall.io");
      const manaCostOk = typeof solRing?.manaCost === "string" && solRing.manaCost.length > 0;
      const tagsOk = Array.isArray(solRing?.tags) && JSON.stringify(solRing.tags) === JSON.stringify(["ramp", "combo piece"]);
      const byTag = json.report?.byTag ?? {};
      const byTagOk = (byTag["ramp"] ?? 0) >= 1 && (byTag["combo piece"] ?? 0) >= 1;
      const untaggedOk = typeof json.report?.untaggedForQuota === "number";
      const ok = res.status === 200 && imageOk && manaCostOk && tagsOk && byTagOk && untaggedOk;
      record(
        "C3",
        ok,
        `status=${res.status} image=${solRing?.image} manaCost=${solRing?.manaCost} tags=${JSON.stringify(solRing?.tags)} byTag=${JSON.stringify(byTag)} untaggedForQuota=${json.report?.untaggedForQuota}`,
      );
    } catch (err) {
      record("C3", false, `threw: ${err.message}`);
    }

    // --- C4: PATCH tags ---
    try {
      const patchRes = await fetch(`${baseUrl}/api/decks/${encodeURIComponent(deckName)}/cards`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: [{ name: "Sol Ring", tags: ["ramp", "artifact synergy"] }] }),
      });
      const getRes = await fetch(`${baseUrl}/api/decks/${encodeURIComponent(deckName)}`);
      const getJson = await getRes.json();
      const solRing = (getJson.deck?.cards ?? []).find((c) => c.name === "Sol Ring");
      const tagsOk = JSON.stringify(solRing?.tags) === JSON.stringify(["ramp", "artifact synergy"]);
      const ok = patchRes.status === 200 && tagsOk;
      record("C4", ok, `patchStatus=${patchRes.status} tags=${JSON.stringify(solRing?.tags)}`);
    } catch (err) {
      record("C4", false, `threw: ${err.message}`);
    }

    // --- C5: rename tag ---
    try {
      const patchRes = await fetch(`${baseUrl}/api/decks/${encodeURIComponent(deckName)}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ from: "artifact synergy", to: "artifacts" }),
      });
      const getRes = await fetch(`${baseUrl}/api/decks/${encodeURIComponent(deckName)}`);
      const getJson = await getRes.json();
      const solRing = (getJson.deck?.cards ?? []).find((c) => c.name === "Sol Ring");
      const hasNew = (solRing?.tags ?? []).includes("artifacts");
      const hasOld = (solRing?.tags ?? []).includes("artifact synergy");
      const ok = patchRes.status === 200 && hasNew && !hasOld;
      record("C5", ok, `patchStatus=${patchRes.status} tags=${JSON.stringify(solRing?.tags)}`);
    } catch (err) {
      record("C5", false, `threw: ${err.message}`);
    }

    // --- C6: remove card ---
    try {
      const delRes = await fetch(`${baseUrl}/api/decks/${encodeURIComponent(deckName)}/cards`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: ["Sol Ring"] }),
      });
      const getRes = await fetch(`${baseUrl}/api/decks/${encodeURIComponent(deckName)}`);
      const getJson = await getRes.json();
      const stillHas = (getJson.deck?.cards ?? []).some((c) => c.name === "Sol Ring");
      const ok = delRes.status === 200 && !stillHas;
      record("C6", ok, `delStatus=${delRes.status} stillHasSolRing=${stillHas}`);
    } catch (err) {
      record("C6", false, `threw: ${err.message}`);
    }

    // --- C7: delete deck ---
    try {
      const delRes = await fetch(`${baseUrl}/api/decks/${encodeURIComponent(deckName)}`, { method: "DELETE" });
      const delJson = await delRes.json();
      const getRes = await fetch(`${baseUrl}/api/decks/${encodeURIComponent(deckName)}`);
      const ok = delRes.status === 200 && delJson?.ok === true && getRes.status === 404;
      record("C7", ok, `delStatus=${delRes.status} delBody=${JSON.stringify(delJson)} getStatus=${getRes.status}`);
      tmpDeckNames.delete(deckName); // deleted via API; nothing left to clean up
    } catch (err) {
      record("C7", false, `threw: ${err.message}`);
    }

    // --- C8: invalid chat id guard ---
    try {
      const res1 = await fetch(`${baseUrl}/api/chats/..%2f..%2fetc`);
      const res2 = await fetch(`${baseUrl}/api/chats/UPPER_Bad!id`);
      const ok = res1.status === 400 && res2.status === 400;
      record(
        "C8",
        ok,
        `traversalStatus=${res1.status} badIdStatus=${res2.status} (want both 400, never 500/200)`,
      );
    } catch (err) {
      record("C8", false, `threw: ${err.message}`);
    }

    // --- C9: deck-events SSE ---
    try {
      const sseDeckName = `tmp-tier-c-sse-${Date.now()}`;
      tmpDeckNames.add(sseDeckName);

      const seenLines = [];
      let resolveSeen;
      const seenPromise = new Promise((resolve) => {
        resolveSeen = resolve;
      });

      const sseReq = http.get(`${baseUrl}/api/deck-events`, (res) => {
        let buf = "";
        res.on("data", (chunk) => {
          buf += chunk.toString();
          let idx;
          while ((idx = buf.indexOf("\n\n")) !== -1) {
            const frame = buf.slice(0, idx);
            buf = buf.slice(idx + 2);
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (line) {
              seenLines.push(line);
              if (line.includes(sseDeckName)) resolveSeen(true);
            }
          }
        });
      });
      sseReq.on("error", () => {});

      // give the SSE connection a moment to establish before triggering fs events
      await sleep(300);
      await fetch(`${baseUrl}/api/decks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: sseDeckName, commander: "Trostani, Selesnya's Voice" }),
      });
      await fetch(`${baseUrl}/api/decks/${encodeURIComponent(sseDeckName)}`, { method: "DELETE" });
      tmpDeckNames.delete(sseDeckName); // deleted via API above

      const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve(false), 5000));
      const gotIt = await Promise.race([seenPromise, timeoutPromise]);
      sseReq.destroy();

      record("C9", gotIt === true, `sawDeckNameInSseData=${gotIt} lines=${JSON.stringify(seenLines.slice(-5))}`);
    } catch (err) {
      record("C9", false, `threw: ${err.message}`);
    }

    // --- C-COLLECT: collection import e2e ---
    // Safety: back up any pre-existing repo-root collection.json (bytes, not
    // parsed) and restore it verbatim in finally, regardless of pass/fail.
    // If it didn't exist before this check, delete whatever we created.
    let collectionBackup = null;
    let collectionPreexisted = false;
    try {
      collectionPreexisted = fs.existsSync(COLLECTION_JSON_PATH);
      if (collectionPreexisted) {
        collectionBackup = fs.readFileSync(COLLECTION_JSON_PATH);
      }

      const fixtureText = fs.readFileSync(FIXTURE_LOG_PATH, "utf8");

      const postRes = await fetch(`${baseUrl}/api/collection`, {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: fixtureText,
      });
      const postJson = await postRes.json();
      const postOk =
        postRes.status === 200 &&
        postJson?.ok === true &&
        typeof postJson?.stats?.uniqueOwned === "number" &&
        postJson.stats.uniqueOwned >= 2;

      const getRes = await fetch(`${baseUrl}/api/collection`);
      const getJson = await getRes.json();
      const getOk = getRes.status === 200 && getJson?.exists === true && getJson?.totalCards === 11;

      // Verify the owned flag via the MCP server's get_card tool (Doubling
      // Season is arena_id 93929, present in the fixture blob).
      const ownedResult = await checkOwnedViaMcp(REPO_ROOT, "Doubling Season");

      const ok = postOk && getOk && ownedResult.ok === true;
      record(
        "C-COLLECT",
        ok,
        `postStatus=${postRes.status} postStats=${JSON.stringify(postJson?.stats)} getStatus=${getRes.status} getBody=${JSON.stringify(
          getJson,
        )} ownedCheck=${JSON.stringify(ownedResult)}`,
      );
    } catch (err) {
      record("C-COLLECT", false, `threw: ${err.message}`);
    } finally {
      try {
        if (collectionPreexisted && collectionBackup) {
          fs.writeFileSync(COLLECTION_JSON_PATH, collectionBackup);
        } else if (!collectionPreexisted) {
          fs.rmSync(COLLECTION_JSON_PATH, { force: true });
        }
      } catch {
        // best-effort restore; nothing more we can do here
      }
    }

    // --- --with-chat: three LLM-dependent checks, skipped by default ---
    if (!WITH_CHAT) {
      skip("C10", "activeDeck context relay (LLM-dependent; run with --with-chat)");
      skip("C11", "action-log awareness (LLM-dependent; run with --with-chat)");
      skip("C12", "chat resume (LLM-dependent; run with --with-chat)");
    } else {
      await runChatChecks(baseUrl, tmpDeckNames);
    }
  } finally {
    // --- cleanup: delete any tmp-tier-c-* decks not already cleaned up above ---
    for (const name of tmpDeckNames) {
      try {
        await fetch(`${baseUrl}/api/decks/${encodeURIComponent(name)}`, { method: "DELETE" });
      } catch {
        // best-effort; also swept by fs fallback below
      }
    }
    // Belt-and-suspenders: server's DECKS_DIR is the repo's real decks/ dir
    // (see server.ts REPO_ROOT resolution) — directly remove any leftover
    // tmp-tier-c-*.json files even if the API cleanup above failed.
    try {
      const files = fs.readdirSync(DECKS_DIR);
      for (const f of files) {
        if (f.startsWith("tmp-tier-c-")) {
          fs.rmSync(path.join(DECKS_DIR, f), { force: true });
        }
      }
    } catch {
      // decks dir missing entirely: nothing to sweep
    }

    child.kill();
    await new Promise((resolve) => {
      child.on("exit", resolve);
      setTimeout(resolve, 2000);
    });

    if (stderrBuf.trim()) {
      console.error("--- server stderr ---");
      console.error(stderrBuf.trim());
    }
  }

  const expectedCount = WITH_CHAT ? 13 : 10;
  const passed = results.filter((r) => r.ok).length;
  const label = WITH_CHAT ? `TIER C: ${passed}/13 PASSED` : `TIER C: ${passed}/10 PASSED`;
  console.log(`\n${label}`);
  if (passed < results.length || results.length < expectedCount) {
    process.exit(1);
  }
}

// --- --with-chat: cheap, single-message-each behavioral checks ---
async function runChatChecks(baseUrl, tmpDeckNames) {
  async function postChatCollect(body) {
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const raw = await res.text();
    let text = "";
    let chatId = body.chatId;
    for (const frame of raw.split("\n\n")) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      try {
        const evt = JSON.parse(line.slice(5).trim());
        if (evt.type === "text-delta") text += evt.text;
        if (evt.type === "chat" && evt.chatId) chatId = evt.chatId;
      } catch {
        // ignore malformed frame
      }
    }
    return { text, chatId };
  }

  const chatDeckName = `tmp-tier-c-chat-${Date.now()}`;
  tmpDeckNames.add(chatDeckName);

  // --- C10: activeDeck context relay ---
  let firstChatId = null;
  try {
    await fetch(`${baseUrl}/api/decks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: chatDeckName, commander: "Trostani, Selesnya's Voice" }),
    });
    const { text, chatId } = await postChatCollect({
      message: "what deck do I have open?",
      activeDeck: chatDeckName,
    });
    firstChatId = chatId;
    const ok = text.toLowerCase().includes(chatDeckName.toLowerCase()) || /trostani/i.test(text);
    record("C10", ok, `chatId=${chatId} textSnippet=${JSON.stringify(text.slice(0, 200))}`);
  } catch (err) {
    record("C10", false, `threw: ${err.message}`);
  }

  // --- C11: action-log awareness ---
  try {
    await fetch(`${baseUrl}/api/decks/${encodeURIComponent(chatDeckName)}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cards: [{ name: "Sol Ring" }] }),
    });
    const { text } = await postChatCollect({
      message: "what did I just change?",
      activeDeck: chatDeckName,
    });
    const ok = /sol ring/i.test(text);
    record("C11", ok, `textSnippet=${JSON.stringify(text.slice(0, 200))}`);
  } catch (err) {
    record("C11", false, `threw: ${err.message}`);
  }

  // --- C12: chat resume ---
  try {
    if (!firstChatId) throw new Error("no chatId from C10 to resume");
    const { text } = await postChatCollect({
      message: "what did I ask you before?",
      chatId: firstChatId,
    });
    const ok = /deck/i.test(text);
    record("C12", ok, `textSnippet=${JSON.stringify(text.slice(0, 200))}`);
  } catch (err) {
    record("C12", false, `threw: ${err.message}`);
  }

  try {
    await fetch(`${baseUrl}/api/decks/${encodeURIComponent(chatDeckName)}`, { method: "DELETE" });
    tmpDeckNames.delete(chatDeckName);
  } catch {
    // swept by fs fallback in main()'s finally
  }
}

// --- C-COLLECT helper: spawn the built MCP server (stdio JSON-RPC) the same
// way packages/mcp/test/rpc-smoke.mjs does, call get_card once, and return
// its `owned` flag. Isolated cwd so it doesn't touch this repo's decks/.
async function checkOwnedViaMcp(repoRoot, cardName) {
  if (!fs.existsSync(MCP_SERVER_PATH)) {
    return { ok: false, reason: `mcp build missing: ${MCP_SERVER_PATH}` };
  }

  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "scrychat-tierc-mcp-"));
  const child = spawn(process.execPath, [MCP_SERVER_PATH], {
    cwd: workDir,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let buf = "";
  const pending = new Map();
  let nextId = 1;
  child.stdout.on("data", (d) => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf("\n")) !== -1) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      if (!line.trim()) continue;
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      if (msg.id != null && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    }
  });

  function send(method, params) {
    const id = nextId++;
    const req = { jsonrpc: "2.0", id, method, params };
    const p = new Promise((resolve) => pending.set(id, resolve));
    child.stdin.write(JSON.stringify(req) + "\n");
    return p;
  }
  function notify(method, params) {
    child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }
  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout waiting for ${label}`)), ms)),
    ]);
  }

  try {
    await withTimeout(
      send("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "tier-c-collect", version: "0.0.1" },
      }),
      10000,
      "initialize",
    );
    notify("notifications/initialized", {});

    const res = await withTimeout(
      send("tools/call", { name: "get_card", arguments: { name: cardName } }),
      15000,
      "tools/call get_card",
    );
    const text = res.result?.content?.[0]?.text ?? "{}";
    const json = JSON.parse(text);
    return { ok: json?.owned === true, card: json?.name, owned: json?.owned };
  } catch (err) {
    return { ok: false, reason: err.message };
  } finally {
    child.stdin.end();
    child.kill();
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error("tier-c eval crashed:", err);
  process.exit(1);
});
