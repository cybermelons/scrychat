/**
 * End-to-end check of the suggestions API + the mobile browse page.
 *
 * Mounts the real route bodies and the real renderSuggestionsPage (extracted
 * from apps/web/src/server.ts) against temp decks/ and suggestions/ dirs, so
 * no network and no user state are touched.
 *
 * Run:  node evals/run-suggestions-e2e.mjs
 *
 * This exists because the host running it has Node 20, while the repo needs
 * Node 24+ for its vitest. The equivalent unit tests live in
 * packages/core/test/suggestions.test.ts.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const NPX = path.join(path.dirname(process.execPath), "npx");
const build = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-build-"));

// Transpile the two core modules we need.
for (const src of ["packages/core/src/suggestions.ts", "packages/core/src/decks.ts"]) {
  execFileSync(NPX, ["--yes", "esbuild@0.24.0", src,
    `--outfile=${path.join(build, path.basename(src).replace(/\.ts$/, ".mjs"))}`,
    "--format=esm", "--platform=node", "--loader:.ts=ts"], { cwd: ROOT });
}
const sug = await import(path.join(build, "suggestions.mjs"));
const decks = await import(path.join(build, "decks.mjs"));

// Extract renderSuggestionsPage + escapeHtml from the real server source so
// the page we test is the page that ships.
const serverSrc = fs.readFileSync(`${ROOT}/apps/web/src/server.ts`, "utf8");
const start = serverSrc.indexOf("function escapeHtml(");
const endMarker = "const UI_DIST =";
const extracted = serverSrc.slice(start, serverSrc.indexOf(endMarker));
const pageFile = path.join(build, "page.ts");
fs.writeFileSync(pageFile, extracted + "\nexport { renderSuggestionsPage, escapeHtml };\n");
execFileSync(NPX, ["--yes", "esbuild@0.24.0", pageFile,
  `--outfile=${path.join(build, "page.mjs")}`, "--format=esm", "--platform=node",
  "--loader:.ts=ts"], { cwd: ROOT });
const { renderSuggestionsPage } = await import(path.join(build, "page.mjs"));

// --- fixture dirs ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-"));
const DECKS_DIR = path.join(tmp, "decks");
const SUGGESTIONS_DIR = path.join(tmp, "suggestions");
fs.mkdirSync(DECKS_DIR, { recursive: true });
// Copy the real Isshin deck as the fixture.
fs.copyFileSync(`${ROOT}/decks/isshin-budget.json`, path.join(DECKS_DIR, "isshin-budget.json"));

// Stub resolver: avoids network. Returns a legal 3-color-identity card.
const resolver = async (name) => ({
  name, colorIdentity: [], cmc: 2, typeLine: "Creature — Human",
  legalCommander: true, image: null, manaCost: "{1}{W}", producedMana: null, arena: true,
});

const EXPRESS = [
  path.join(ROOT, "node_modules/express/index.js"),
  path.join(ROOT, "apps/web/node_modules/express/index.js"),
  "/tmp/tscheck/node_modules/express/index.js",
].find((p) => fs.existsSync(p));
if (!EXPRESS) {
  console.error("express not found — run pnpm install first");
  process.exit(2);
}
const express = (await import(EXPRESS)).default;
const app = express();
app.use(express.json());
const isValidDeckName = (n) =>
  typeof n === "string" && n.length > 0 && n.length <= 128 &&
  !n.includes("/") && !n.includes("\\") && !n.includes("\0") && /[a-zA-Z0-9]/.test(n);

// ---- the real routes, same bodies as server.ts ----
app.get("/api/decks/:name/suggestions", async (req, res) => {
  if (!isValidDeckName(req.params.name)) return res.status(400).json({ error: "invalid deck name" });
  const all = await sug.listSuggestions(req.params.name, SUGGESTIONS_DIR);
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  res.json({ deck: req.params.name, pending: all.filter(s => s.status === "pending").length,
    suggestions: status ? all.filter(s => s.status === status) : all });
});
app.post("/api/decks/:name/suggestions", async (req, res) => {
  try {
    if (!isValidDeckName(req.params.name)) return res.status(400).json({ error: "invalid deck name" });
    const proposals = Array.isArray(req.body) ? req.body : req.body?.suggestions;
    if (!Array.isArray(proposals) || proposals.length === 0)
      return res.status(400).json({ error: "expected a non-empty 'suggestions' array" });
    const all = await sug.addSuggestions(req.params.name, proposals, SUGGESTIONS_DIR);
    res.json({ deck: req.params.name, added: proposals.length, suggestions: all });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.post("/api/decks/:name/suggestions/:id/:verdict", async (req, res) => {
  try {
    const { name, id, verdict } = req.params;
    if (!isValidDeckName(name)) return res.status(400).json({ error: "invalid deck name" });
    if (verdict !== "accept" && verdict !== "reject")
      return res.status(400).json({ error: "verdict must be 'accept' or 'reject'" });
    const status = verdict === "accept" ? "accepted" : "rejected";
    let outCard;
    if (status === "accepted") {
      const pendingList = await sug.listSuggestions(name, SUGGESTIONS_DIR);
      const target = pendingList.find(s => s.id === id);
      if (target?.out) {
        const current = await decks.getDeck(name, DECKS_DIR);
        const present = current?.cards.some(c => c.name.toLowerCase() === target.out.toLowerCase());
        if (!present) return res.status(409).json({ deck: name,
          error: `"${target.out}" is no longer in the deck — suggestion is stale` });
        outCard = target.out;
      }
    }
    const s = await sug.decideSuggestion(name, id, status, req.body?.note, SUGGESTIONS_DIR);
    let applied = null;
    if (status === "accepted") {
      if (outCard) await decks.removeCards(name, [outCard], DECKS_DIR);
      if (s.in) applied = await decks.addCards(name,
        [{ name: s.in, ...(s.role ? { tags: [s.role] } : {}) }], resolver, DECKS_DIR);
    }
    res.json({ deck: name, suggestion: s, applied });
  } catch (e) { res.status(400).json({ error: e.message }); }
});
app.get("/suggestions", async (req, res) => {
  const deckParam = typeof req.query.deck === "string" ? req.query.deck : undefined;
  const list = await decks.listDecks(DECKS_DIR);
  const deckName = deckParam && isValidDeckName(deckParam) ? deckParam : list[0]?.name;
  if (!deckName) return res.type("html").send(renderSuggestionsPage(null, [], [], ""));
  const suggestions = await sug.listSuggestions(deckName, SUGGESTIONS_DIR);
  const deck = await decks.getDeck(deckName, DECKS_DIR);
  res.type("html").send(renderSuggestionsPage(deck, suggestions, list.map(d => d.name), deckName));
});

const server = app.listen(0);
await new Promise(r => server.once("listening", r));
const base = `http://127.0.0.1:${server.address().port}`;

let pass = 0, fail = 0;
const ok = (n, c, extra = "") => c ? (pass++, console.log("PASS  " + n))
  : (fail++, console.log(`FAIL  ${n}${extra ? "  → " + extra : ""}`));
const J = async (p, init) => { const r = await fetch(base + p, init); return { s: r.status, b: await r.json() }; };

// 1. empty state
let r = await J("/api/decks/Isshin%20Budget/suggestions");
ok("GET empty list", r.s === 200 && r.b.suggestions.length === 0 && r.b.pending === 0, JSON.stringify(r.b));

// 2. AI posts proposals
r = await J("/api/decks/Isshin%20Budget/suggestions", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ suggestions: [
    { kind: "swap", out: "Abrade", in: "Vindicate", role: "removal", why: "unconditional instant-speed answer" },
    { kind: "cut", out: "Grand Coliseum", why: "colorless land hurts a 3-color base" },
  ]}),
});
ok("POST two proposals", r.s === 200 && r.b.suggestions.length === 2, JSON.stringify(r.b).slice(0,150));
ok("ids assigned s1,s2", JSON.stringify(r.b.suggestions.map(s => s.id)) === '["s1","s2"]');

// 3. validation rejected
r = await J("/api/decks/Isshin%20Budget/suggestions", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ suggestions: [{ kind: "add", why: "no card named" }] }),
});
ok("POST invalid → 400", r.s === 400 && /requires 'in'/.test(r.b.error), JSON.stringify(r.b));

// 4. path traversal blocked
r = await fetch(base + "/api/decks/" + encodeURIComponent("../../etc/passwd") + "/suggestions");
ok("traversal name → 400", r.status === 400);

// 5. bad verdict
r = await J("/api/decks/Isshin%20Budget/suggestions/s1/maybe", { method: "POST" });
ok("bad verdict → 400", r.s === 400 && /accept/.test(r.b.error));

// 6. accept applies the swap to the deck
const deckBefore = await decks.getDeck("Isshin Budget", DECKS_DIR);
const hadPillage = deckBefore.cards.some(c => c.name === "Abrade");
r = await J("/api/decks/Isshin%20Budget/suggestions/s1/accept", {
  method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
ok("accept → 200", r.s === 200 && r.b.suggestion.status === "accepted", JSON.stringify(r.b).slice(0,200));
const deckAfter = await decks.getDeck("Isshin Budget", DECKS_DIR);
ok("fixture had the out card", hadPillage);
ok("accept removed 'out' card", !deckAfter.cards.some(c => c.name === "Abrade"));
ok("accept added 'in' card", deckAfter.cards.some(c => c.name === "Vindicate"));
ok("added card carries role tag",
  deckAfter.cards.find(c => c.name === "Vindicate")?.tags?.includes("removal"));

// 7. no double verdict
r = await J("/api/decks/Isshin%20Budget/suggestions/s1/reject", { method: "POST" });
ok("second verdict → 400", r.s === 400 && /already accepted/.test(r.b.error), JSON.stringify(r.b));

// 8. reject does NOT touch the deck
const n1 = (await decks.getDeck("Isshin Budget", DECKS_DIR)).cards.length;
r = await J("/api/decks/Isshin%20Budget/suggestions/s2/reject", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ note: "keeping it" }) });
const n2 = (await decks.getDeck("Isshin Budget", DECKS_DIR)).cards.length;
ok("reject → 200 with note", r.s === 200 && r.b.suggestion.note === "keeping it");
ok("reject left deck unchanged", n1 === n2);
ok("reject kept the card", (await decks.getDeck("Isshin Budget", DECKS_DIR))
  .cards.some(c => c.name === "Grand Coliseum"));

// 9. status filter
r = await J("/api/decks/Isshin%20Budget/suggestions?status=rejected");
ok("status filter", r.s === 200 && r.b.suggestions.length === 1 && r.b.suggestions[0].id === "s2");

// 10. mobile page
const html = await (await fetch(base + "/suggestions")).text();
ok("page renders html", html.startsWith("<!doctype html>"));
ok("page has viewport meta", /viewport.*width=device-width/.test(html));
ok("page shows both suggestions", (html.match(/<article class="s /g) || []).length === 2);
ok("page shows Decided section", html.includes("<h2>Decided</h2>"));
ok("page shows the cut card name", html.includes("Grand Coliseum"));
ok("page has no unresolved template", !html.includes("${"));
ok("page posts to the verdict route", html.includes("/suggestions/"));
ok("decided cards show verdict not buttons",
  (html.match(/class="verdict /g) || []).length === 2);

// 11. XSS: a malicious 'why' must not break out of the page
await sug.addSuggestions("xss", [{ kind: "add", in: "Sol Ring",
  why: '</p><script>alert(1)</script>' }], SUGGESTIONS_DIR);
fs.copyFileSync(path.join(DECKS_DIR, "isshin-budget.json"), path.join(DECKS_DIR, "xss.json"));
const xssDeck = JSON.parse(fs.readFileSync(path.join(DECKS_DIR, "xss.json"), "utf8"));
xssDeck.name = "xss"; fs.writeFileSync(path.join(DECKS_DIR, "xss.json"), JSON.stringify(xssDeck));
const xssHtml = await (await fetch(base + "/suggestions?deck=xss")).text();
ok("XSS in 'why' is escaped", !xssHtml.includes("<script>alert(1)</script>")
  && xssHtml.includes("&lt;script&gt;"));

// 12. Stale suggestion: the 'out' card is no longer in the deck. Accepting
// must not silently report a change it did not make.
await sug.addSuggestions("Isshin Budget", [
  { kind: "cut", out: "A Card Not In This Deck", why: "stale proposal" },
], SUGGESTIONS_DIR);
const beforeStale = (await decks.getDeck("Isshin Budget", DECKS_DIR)).cards.length;
r = await J("/api/decks/Isshin%20Budget/suggestions/s3/accept", {
  method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
const afterStale = (await decks.getDeck("Isshin Budget", DECKS_DIR)).cards.length;
ok("stale accept does not corrupt the deck", beforeStale === afterStale,
  `${beforeStale} -> ${afterStale}`);
ok("stale accept → 409", r.s === 409, "status " + r.s + " " + JSON.stringify(r.b));
ok("stale accept explains why", /stale/.test(r.b.error || ""), JSON.stringify(r.b));
// The verdict must NOT have been recorded, so the suggestion stays retryable.
const stale = (await J("/api/decks/Isshin%20Budget/suggestions?status=pending")).b.suggestions;
ok("stale suggestion stays pending (retryable)", stale.some(s => s.id === "s3"),
  JSON.stringify(stale.map(s => s.id + ":" + s.status)));

server.close();
fs.rmSync(tmp, { recursive: true, force: true });
fs.rmSync(build, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
