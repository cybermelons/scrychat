#!/usr/bin/env node
/**
 * Scripted JSON-RPC smoke test against the built scrychat MCP server.
 *
 * Spawns `node dist/index.js` with cwd set to a throwaway temp dir (so any
 * `decks/` directory it creates is isolated and easy to clean up), speaks
 * newline-delimited JSON-RPC over stdio, and asserts:
 *   1. initialize succeeds
 *   2. tools/list returns exactly 14 tools
 *   3. tools/call search_cards {query:"otag:token-doubler"} -> total >= 10
 *   4. tools/call search_tags {query:"removal"} -> non-empty array
 *   5. tools/call deck_create + deck_add with an off-identity card -> a
 *      rejection with a reason is present
 *   6. tools/call deck_import with a *CMDR*-marked new-mode decklist ->
 *      creates a deck, adds valid cards, and accounts for a junk line
 *
 * Cleans up the temp cwd (and any decks/ it created) on exit.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deleteDeck } from "../dist/tools.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, "..", "dist", "index.js");

const workDir = mkdtempSync(path.join(tmpdir(), "scrychat-mcp-smoke-"));

let failed = false;
function assert(cond, msg) {
  if (!cond) {
    failed = true;
    console.error(`FAIL: ${msg}`);
  } else {
    console.log(`OK: ${msg}`);
  }
}

async function main() {
  const child = spawn(process.execPath, [serverPath], {
    cwd: workDir,
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stderrBuf = "";
  child.stderr.on("data", (d) => {
    stderrBuf += d.toString();
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
        console.error("non-JSON line from server stdout:", line);
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
    const req = { jsonrpc: "2.0", method, params };
    child.stdin.write(JSON.stringify(req) + "\n");
  }

  function withTimeout(promise, ms, label) {
    return Promise.race([
      promise,
      new Promise((_, reject) => setTimeout(() => reject(new Error(`timeout waiting for ${label}`)), ms)),
    ]);
  }

  try {
    // 1. initialize
    const initRes = await withTimeout(
      send("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "rpc-smoke", version: "0.0.1" },
      }),
      10000,
      "initialize",
    );
    assert(initRes.result?.serverInfo?.name === "scrychat", "initialize returns serverInfo.name === 'scrychat'");
    notify("notifications/initialized", {});

    // 2. tools/list
    const listRes = await withTimeout(send("tools/list", {}), 10000, "tools/list");
    const tools = listRes.result?.tools ?? [];
    assert(tools.length === 14, `tools/list returns 14 tools (got ${tools.length}: ${tools.map((t) => t.name).join(", ")})`);

    // 3. search_cards otag:token-doubler
    const searchRes = await withTimeout(
      send("tools/call", { name: "search_cards", arguments: { query: "otag:token-doubler" } }),
      20000,
      "tools/call search_cards",
    );
    const searchText = searchRes.result?.content?.[0]?.text ?? "{}";
    const searchJson = JSON.parse(searchText);
    assert(
      typeof searchJson.total === "number" && searchJson.total >= 10,
      `search_cards otag:token-doubler total >= 10 (got ${searchJson.total})`,
    );

    // 4. search_tags removal
    const tagsRes = await withTimeout(
      send("tools/call", { name: "search_tags", arguments: { query: "removal" } }),
      15000,
      "tools/call search_tags",
    );
    const tagsText = tagsRes.result?.content?.[0]?.text ?? "[]";
    const tagsJson = JSON.parse(tagsText);
    assert(Array.isArray(tagsJson) && tagsJson.length > 0, `search_tags 'removal' non-empty (got ${tagsJson.length})`);

    // 5. deck_create + deck_add with off-identity card -> rejection
    const deckName = `smoke-test-deck-${Date.now()}`;
    const createRes = await withTimeout(
      send("tools/call", { name: "deck_create", arguments: { name: deckName, commander: "Atraxa, Praetors' Voice" } }),
      15000,
      "tools/call deck_create",
    );
    const createText = createRes.result?.content?.[0]?.text ?? "{}";
    const createJson = JSON.parse(createText);
    assert(!createJson.error, `deck_create succeeded (${JSON.stringify(createJson)})`);

    // Atraxa is WUBG; Lightning Bolt (R) is off-identity -> should be rejected.
    const addRes = await withTimeout(
      send("tools/call", {
        name: "deck_add",
        arguments: { name: deckName, cards: [{ name: "Lightning Bolt" }] },
      }),
      15000,
      "tools/call deck_add",
    );
    const addText = addRes.result?.content?.[0]?.text ?? "{}";
    const addJson = JSON.parse(addText);
    const rejection = addJson.rejected?.[0];
    assert(
      rejection && typeof rejection.reason === "string" && rejection.reason.length > 0,
      `deck_add off-identity card rejected with reason (got ${JSON.stringify(addJson)})`,
    );

    // 6. deck_import new-mode with a *CMDR* marker + valid cards + a junk line
    const importDeckName = `smoke-test-import-${Date.now()}`;
    const importText =
      "1 Atraxa, Praetors' Voice *CMDR*\n1 Sol Ring\n1 Arcane Signet\nblarghle not a card 999";
    const importRes = await withTimeout(
      send("tools/call", {
        name: "deck_import",
        arguments: { text: importText, deck_name: importDeckName },
      }),
      20000,
      "tools/call deck_import",
    );
    const importTextOut = importRes.result?.content?.[0]?.text ?? "{}";
    const importJson = JSON.parse(importTextOut);
    assert(importJson.mode === "new", `deck_import mode === "new" (got ${JSON.stringify(importJson)})`);
    assert(!!importJson.created?.commander, `deck_import created.commander is set (got ${JSON.stringify(importJson.created)})`);
    assert(
      Array.isArray(importJson.added) && importJson.added.length >= 1,
      `deck_import added at least 1 card (got ${JSON.stringify(importJson.added)})`,
    );
    const junkAccountedFor =
      (importJson.rejected?.length ?? 0) + (importJson.unparsed?.length ?? 0) >= 1;
    assert(
      junkAccountedFor,
      `deck_import accounts for junk line in rejected/unparsed (got rejected=${JSON.stringify(
        importJson.rejected,
      )}, unparsed=${JSON.stringify(importJson.unparsed)})`,
    );

    // 7. deck_rename on the earlier Atraxa deck -> renamed deck reflects the new name
    const renamedDeckName = `${deckName}-renamed`;
    const renameRes = await withTimeout(
      send("tools/call", {
        name: "deck_rename",
        arguments: { name: deckName, new_name: renamedDeckName },
      }),
      15000,
      "tools/call deck_rename",
    );
    const renameText = renameRes.result?.content?.[0]?.text ?? "{}";
    const renameJson = JSON.parse(renameText);
    assert(
      !renameJson.error && renameJson.name === renamedDeckName,
      `deck_rename renamed deck to ${renamedDeckName} (got ${JSON.stringify(renameJson)})`,
    );

    await deleteDeck(importDeckName, path.join(workDir, "decks"));
  } finally {
    child.stdin.end();
    child.kill();
    rmSync(workDir, { recursive: true, force: true });
    if (stderrBuf.trim()) {
      console.error("--- server stderr ---");
      console.error(stderrBuf.trim());
    }
  }

  if (failed) {
    console.error("\nSMOKE TEST: FAILED");
    process.exit(1);
  } else {
    console.log("\nSMOKE TEST: PASSED");
  }
}

main().catch((err) => {
  console.error("smoke test crashed:", err);
  rmSync(workDir, { recursive: true, force: true });
  process.exit(1);
});
