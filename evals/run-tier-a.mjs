#!/usr/bin/env node
/**
 * Tier A mechanical eval harness for scrychat (see evals/golden.md, A1-A9).
 *
 * Plain Node, no deps. Reuses the JSON-RPC-over-stdio spawn pattern from
 * packages/mcp/test/rpc-smoke.mjs: spawn `node packages/mcp/dist/index.js`
 * with cwd = a throwaway fs.mkdtemp dir (so deck evals never touch the
 * repo's decks/), speak newline-delimited JSON-RPC, initialize handshake,
 * then tools/call each assertion in golden.md's Tier A table.
 *
 * Prints one OK/FAIL line per assertion with observed values, exits 1 on
 * any FAIL, and ends with `TIER A: n/9 PASSED`.
 */

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, "..", "packages", "mcp", "dist", "index.js");

const workDir = mkdtempSync(path.join(tmpdir(), "scrychat-tier-a-"));

const results = []; // { id, ok, msg }

function record(id, ok, msg) {
  results.push({ id, ok, msg });
  console.log(`${ok ? "OK" : "FAIL"}: ${id} ${msg}`);
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

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Tools proxy to Scryfall's live API and degrade to `{error: "..."}` text
  // (never a thrown tools/call error - see packages/mcp/src/tools.ts safe()).
  // A single eval run fires many Scryfall requests back-to-back (A1, A2, A5's
  // per-candidate-tag searches, A7/A8/A9's card lookups); that burst can
  // occasionally trip Scryfall's 429 even with the client-side throttle in
  // packages/core/src/scryfall.ts. Retry a couple of times with backoff
  // before letting the eval assertion see (and fail on) the error.
  async function callTool(name, args, label, timeoutMs = 20000) {
    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const res = await withTimeout(
        send("tools/call", { name, arguments: args }),
        timeoutMs,
        label ?? `tools/call ${name}`,
      );
      if (res.error) {
        throw new Error(`tools/call ${name} error: ${JSON.stringify(res.error)}`);
      }
      const text = res.result?.content?.[0]?.text ?? "{}";
      const parsed = JSON.parse(text);
      const isRateLimited = typeof parsed?.error === "string" && /429|Too Many Requests/.test(parsed.error);
      if (isRateLimited && attempt < maxAttempts) {
        await sleep(attempt * 8000);
        continue;
      }
      return parsed;
    }
  }

  try {
    // --- handshake ---
    const initRes = await withTimeout(
      send("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "tier-a-eval", version: "0.0.1" },
      }),
      10000,
      "initialize",
    );
    if (initRes.result?.serverInfo?.name !== "scrychat") {
      throw new Error(`initialize failed: ${JSON.stringify(initRes)}`);
    }
    notify("notifications/initialized", {});

    // --- A1: search_cards otag:token-doubler ---
    try {
      const r = await callTool("search_cards", { query: "otag:token-doubler" }, "A1 search_cards");
      const names = (r.cards ?? []).map((c) => c.n);
      const expected = ["Doubling Season", "Parallel Lives", "Mondrak", "Anointed Procession", "Adrix and Nev"];
      const missing = expected.filter((e) => !names.some((n) => n.includes(e)));
      const totalOk = typeof r.total === "number" && r.total >= 10 && r.total <= 30;
      const ok = totalOk && missing.length === 0;
      record(
        "A1",
        ok,
        `total=${r.total} (want 10-30) missing=[${missing.join(", ")}] names=[${names.join(", ")}]`,
      );
    } catch (err) {
      record("A1", false, `threw: ${err.message}`);
    }

    // --- A2: search_cards otag:sacrifice-outlet id<=bg usd<3 ---
    try {
      const r = await callTool(
        "search_cards",
        { query: "otag:sacrifice-outlet id<=bg usd<3", limit: 50 },
        "A2 search_cards",
      );
      const cards = r.cards ?? [];
      const badCi = cards.filter((c) => {
        const ci = (c.ci ?? "").split("").filter((x) => x.length);
        return !ci.every((x) => x === "B" || x === "G");
      });
      const totalOk = typeof r.total === "number" && r.total > 400;
      const ok = totalOk && badCi.length === 0 && cards.length > 0;
      record(
        "A2",
        ok,
        `total=${r.total} (want >400) returned=${cards.length} badCi=${JSON.stringify(badCi.map((c) => ({ n: c.n, ci: c.ci })))}`,
      );
    } catch (err) {
      record("A2", false, `threw: ${err.message}`);
    }

    // --- A3 (not requested by task instructions to implement — skip per scope) ---
    // NOTE: task explicitly enumerates A1,A2,A5,A7,A8,A9 as the ones with detailed specs,
    // but golden.md defines A1-A9 and asks "every assertion A1-A9". Implement A3,A4,A6 too,
    // straight from golden.md.

    // --- A3: search_tags removal ---
    try {
      const r = await callTool("search_tags", { query: "removal", limit: 10 }, "A3 search_tags");
      const arr = Array.isArray(r) ? r : [];
      const slugs = arr.map((t) => t.slug ?? "");
      // Ranking is tiered (slug/label match before alias/description match),
      // then sorted by member count descending within each tier. "removal"
      // primary-matches many slug/label entries, so "sweeper" (a desc-only
      // match via its "see also" text) doesn't make the top 10 — that's
      // expected. The concrete acceptance bar (per FAILURE A3) is that both
      // a spot-removal and a mass-removal-flavored slug surface in top 10.
      const hasSpot = slugs.includes("spot-removal");
      const hasMass = slugs.includes("multi-removal");
      const ok = arr.length >= 5 && hasSpot && hasMass;
      record(
        "A3",
        ok,
        `count=${arr.length} (want >=5) hasSpotSlug=${hasSpot} hasMassSlug=${hasMass} slugs=[${slugs.join(", ")}]`,
      );
    } catch (err) {
      record("A3", false, `threw: ${err.message}`);
    }

    // --- A4: get_card kodama east tree ---
    try {
      const r = await callTool("get_card", { name: "kodama east tree" }, "A4 get_card");
      const nameOk = typeof r.name === "string" && r.name.toLowerCase().includes("kodama of the east tree");
      const ci = Array.isArray(r.colorIdentity) ? r.colorIdentity.join("") : "";
      const ciOk = ci === "G";
      const ok = nameOk && ciOk;
      record("A4", ok, `name="${r.name}" colorIdentity=${JSON.stringify(r.colorIdentity)}`);
    } catch (err) {
      record("A4", false, `threw: ${err.message}`);
    }

    // --- A5: find_alternatives Doubling Season gw <60 ---
    try {
      const r = await callTool(
        "find_alternatives",
        { card: "Doubling Season", color_identity_within: "gw", max_price: 60 },
        "A5 find_alternatives",
      );
      const allMembers = (r.roles ?? []).flatMap((role) => role.members.map((m) => ({ ...m, roleSlug: role.slug })));
      const names = allMembers.map((m) => m.n);
      const hasParallelLives = names.some((n) => n === "Parallel Lives");
      const hasAnointedProcession = names.some((n) => n === "Anointed Procession");
      const hasDoublingSeason = names.some((n) => n === "Doubling Season");
      const ciViolations = allMembers.filter((m) => {
        const ci = (m.ci ?? "").split("").filter((x) => x.length);
        return !ci.every((x) => "GW".includes(x));
      });
      const priceViolations = allMembers.filter((m) => typeof m.usd === "number" && m.usd >= 60);
      const ok =
        hasParallelLives &&
        hasAnointedProcession &&
        !hasDoublingSeason &&
        ciViolations.length === 0 &&
        priceViolations.length === 0;
      record(
        "A5",
        ok,
        `hasParallelLives=${hasParallelLives} hasAnointedProcession=${hasAnointedProcession} hasDoublingSeason=${hasDoublingSeason} ` +
          `ciViolations=${JSON.stringify(ciViolations.map((m) => ({ n: m.n, ci: m.ci })))} ` +
          `priceViolations=${JSON.stringify(priceViolations.map((m) => ({ n: m.n, usd: m.usd })))} ` +
          `roles=[${(r.roles ?? []).map((ro) => ro.slug).join(", ")}]`,
      );
    } catch (err) {
      record("A5", false, `threw: ${err.message}`);
    }

    // find_alternatives (A5) alone can fire ~15 sequential Scryfall requests
    // (1 getCard + up to 10 otag-verification searches + up to 4 role
    // searches). Give that burst a moment to drain so it doesn't compound
    // with A7/A8/A9's card lookups later in this same process and trip a 429.
    await sleep(4000);

    // --- A6: find_combos Hullbreaker Horror ---
    try {
      const r = await callTool("find_combos", { cards: ["Hullbreaker Horror"] }, "A6 find_combos");
      const arr = Array.isArray(r) ? r : Array.isArray(r.combos) ? r.combos : [];
      const nonEmpty = arr.length > 0;
      const shapeOk = arr.every(
        (c) =>
          (Array.isArray(c.pieces) || Array.isArray(c.uses) || Array.isArray(c.cards)) &&
          (typeof c.produces !== "undefined" || Array.isArray(c.results) || Array.isArray(c.produces)),
      );
      const statusOk = arr.every((c) => !("status" in c) || c.status === "OK" || c.status === undefined);
      const ok = nonEmpty && shapeOk && statusOk;
      record(
        "A6",
        ok,
        `count=${arr.length} shapeOk=${shapeOk} statusOk=${statusOk} sample=${JSON.stringify(arr[0] ?? null)}`,
      );
    } catch (err) {
      record("A6", false, `threw: ${err.message}`);
    }

    // --- A7 + A8 shared deck setup: real Selesnya commander ---
    const deckName = `tier-a-eval-${Date.now()}`;
    let createJson = null;
    try {
      createJson = await callTool(
        "deck_create",
        { name: deckName, commander: "Trostani, Selesnya's Voice" },
        "deck_create A7/A8",
      );
      if (createJson.error) throw new Error(createJson.error);
    } catch (err) {
      record("A7", false, `deck_create threw: ${err.message}`);
      record("A8", false, `deck_create threw: ${err.message}`);
    }

    if (createJson && !createJson.error) {
      // --- A7: add Lightning Bolt (off-identity) ---
      try {
        const r = await callTool(
          "deck_add",
          { name: deckName, cards: [{ name: "Lightning Bolt" }] },
          "A7 deck_add off-identity",
        );
        const rejection = (r.rejected ?? [])[0];
        const ok =
          (r.added ?? []).length === 0 &&
          rejection &&
          typeof rejection.reason === "string" &&
          /identity/i.test(rejection.reason);
        record("A7", ok, `added=${JSON.stringify(r.added)} rejected=${JSON.stringify(r.rejected)}`);
      } catch (err) {
        record("A7", false, `threw: ${err.message}`);
      }

      // --- A8: add same non-basic card twice -> second rejected (singleton) ---
      try {
        const cardName = "Sol Ring";
        const first = await callTool(
          "deck_add",
          { name: deckName, cards: [{ name: cardName, role: "ramp" }] },
          "A8 deck_add first",
        );
        const second = await callTool(
          "deck_add",
          { name: deckName, cards: [{ name: cardName, role: "ramp" }] },
          "A8 deck_add second",
        );
        const firstOk = (first.added ?? []).length === 1 && (first.rejected ?? []).length === 0;
        const secondRejection = (second.rejected ?? [])[0];
        const secondOk =
          (second.added ?? []).length === 0 &&
          secondRejection &&
          /singleton/i.test(secondRejection.reason ?? "");
        const ok = firstOk && secondOk;
        record(
          "A8",
          ok,
          `first=${JSON.stringify(first)} second=${JSON.stringify(second)}`,
        );
      } catch (err) {
        record("A8", false, `threw: ${err.message}`);
      }

      // --- A9: seed a small deck, then deck_get -> byRole, curve, quotaCheck ---
      // By this point A1/A2/A4/A5/A7/A8 have already fired ~20+ sequential
      // Scryfall requests (A5's find_alternatives alone does up to ~15: one
      // getCard, up to 10 otag-verification searches, up to 4 role searches).
      // A9's deck_add makes 10 more back-to-back card lookups; give Scryfall's
      // burst window a moment to drain first so this isn't one continuous
      // burst that trips a 429 regardless of per-request throttling.
      try {
        await sleep(3000);
        const seedCards = [
          { name: "Forest", role: "land", count: 20 },
          { name: "Plains", role: "land", count: 16 },
          { name: "Rampant Growth", role: "ramp" },
          { name: "Farseek", role: "ramp" },
          { name: "Elvish Mystic", role: "ramp" },
          { name: "Return of the Wildspeaker", role: "draw" },
          { name: "Shamanic Revelation", role: "draw" },
          { name: "Beast Within", role: "interaction" },
          { name: "Swords to Plowshares", role: "interaction" },
          { name: "Wrath of God", role: "wipe" },
        ];
        const addRes = await callTool("deck_add", { name: deckName, cards: seedCards }, "A9 deck_add seed");
        if (addRes.error) throw new Error(`deck_add error: ${addRes.error}`);
        // deck_get's report re-resolves every card via Scryfall to build the
        // curve (deckReport calls the resolver once per card, uncached) -
        // i.e. another ~10-call burst right after deck_add's ~10-call burst.
        // Give it a beat so the two bursts don't merge into one that trips
        // Scryfall's rate limiter.
        await sleep(2000);
        const getRes = await callTool("deck_get", { name: deckName }, "A9 deck_get");
        if (getRes.error) throw new Error(`deck_get error: ${getRes.error}`);

        const hasByRole = getRes.byRole && typeof getRes.byRole === "object";
        const hasCurve = getRes.report && getRes.report.curve && typeof getRes.report.curve === "object";
        const hasQuotaCheck = getRes.report && getRes.report.quotaCheck && typeof getRes.report.quotaCheck === "object";
        const ok = Boolean(hasByRole && hasCurve && hasQuotaCheck);
        record(
          "A9",
          ok,
          `addRejected=${JSON.stringify(addRes.rejected)} byRole=${JSON.stringify(getRes.byRole)} ` +
            `curve=${JSON.stringify(getRes.report?.curve)} quotaCheck=${JSON.stringify(getRes.report?.quotaCheck)}`,
        );
      } catch (err) {
        record("A9", false, `threw: ${err.message}`);
      }
    } else {
      record("A9", false, "skipped: deck_create failed");
    }
  } finally {
    child.stdin.end();
    child.kill();
    rmSync(workDir, { recursive: true, force: true });
    if (stderrBuf.trim()) {
      console.error("--- server stderr ---");
      console.error(stderrBuf.trim());
    }
  }

  const passed = results.filter((r) => r.ok).length;
  console.log(`\nTIER A: ${passed}/9 PASSED`);
  if (passed < results.length || results.length < 9) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("tier-a eval crashed:", err);
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {}
  process.exit(1);
});
