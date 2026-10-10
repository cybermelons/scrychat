#!/usr/bin/env node
// The generator positions nothing — the page measures itself at runtime — so
// the generator is structurally blind to its own layout failures. This test is
// the only thing that can see them.
//
//   node tools/progress/test-layout.mjs            # serves + drives Chromium
//   PROGRESS_URL=http://host:port/ node ...        # test an already-served copy
//
// Raw CDP over a WebSocket, no Playwright: this host has no Playwright and no
// browser binary outside flatpak, and a board test is not worth a new driver
// dependency. Chromium comes from `flatpak run org.chromium.Chromium`, which
// cannot read repo paths, so the page is served over loopback rather than
// opened as file://.
//
// Never pipe this through grep to tidy compositor noise: the exit status then
// comes from grep and a failure reports success. Redirect stderr to a file.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { connect } from "./ws-min.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PAGE = path.join(HERE, "..", "..", "docs", "progress", "index.html");
const PORT = Number(process.env.PROGRESS_PORT || 8132);
const CDP_PORT = Number(process.env.CDP_PORT || 9334);

const VIEWPORTS = [
  { name: "wide", width: 1420, height: 1000 },
  { name: "narrow", width: 1100, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

let failures = 0;
const fail = (vp, msg) => {
  failures++;
  console.error(`FAIL [${vp}] ${msg}`);
};
const ok = (vp, msg) => console.log(`  ok   [${vp}] ${msg}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

if (!fs.existsSync(PAGE)) {
  console.error(`${PAGE} does not exist: run tools/progress/build.py first`);
  process.exit(1);
}

// ---- serve the page (flatpak Chromium cannot read the repo path) ----
let server = null;
let url = process.env.PROGRESS_URL;
if (!url) {
  server = http.createServer((_q, s) => {
    s.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    s.end(fs.readFileSync(PAGE));
  });
  await new Promise((r) => server.listen(PORT, "127.0.0.1", r));
  url = `http://127.0.0.1:${PORT}/`;
}

// ---- launch headless Chromium ----
let child = null;
async function cdpVersion() {
  try {
    const r = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

if (!(await cdpVersion())) {
  child = spawn(
    "flatpak",
    [
      "run",
      "--branch=stable",
      "org.chromium.Chromium",
      "--headless",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      `--remote-debugging-port=${CDP_PORT}`,
      `--user-data-dir=/tmp/progress-cdp-${process.pid}`,
      "about:blank",
    ],
    { stdio: "ignore", detached: true }
  );
  for (let i = 0; i < 40 && !(await cdpVersion()); i++) await sleep(500);
  if (!(await cdpVersion())) {
    console.error(`could not start Chromium on CDP port ${CDP_PORT}`);
    process.exit(1);
  }
}

// ---- minimal CDP client ----
async function session() {
  const { webSocketDebuggerUrl } = await (
    await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)
  ).json();
  // node 20.5 has no global WebSocket; ws-min.mjs is a loopback-only client.
  const ws = connect(webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.once("open", r);
    ws.once("error", j);
  });
  let id = 0;
  const pending = new Map();
  const events = [];
  ws.on("message", (data) => {
    const m = JSON.parse(data);
    if (m.id && pending.has(m.id)) {
      const { resolve, reject } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
    } else if (m.method) {
      events.push(m);
    }
  });
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const msg = { id: ++id, method, params };
      if (sessionId) msg.sessionId = sessionId;
      pending.set(msg.id, { resolve, reject });
      ws.send(JSON.stringify(msg));
    });
  return { ws, send, events };
}

const { ws, send, events } = await session();

// One fresh target per viewport: a resize-only run can read a stale layout.
async function withTarget(vp, fn) {
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await send("Target.attachToTarget", {
    targetId,
    flatten: true,
  });
  const call = (m, p = {}) => send(m, p, sessionId);
  await call("Page.enable");
  await call("Runtime.enable");
  await call("Log.enable");
  await call("Emulation.setDeviceMetricsOverride", {
    width: vp.width,
    height: vp.height,
    deviceScaleFactor: 1,
    mobile: vp.width < 500,
  });
  const before = events.length;
  await call("Page.navigate", { url });
  await sleep(1200); // placement re-runs on resize and document.fonts.ready
  const evalJs = async (expression) => {
    const r = await call("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    if (r.exceptionDetails)
      throw new Error(r.exceptionDetails.text + " " + expression.slice(0, 60));
    return r.result.value;
  };
  const pageErrors = () =>
    events
      .slice(before)
      .filter(
        (e) =>
          e.sessionId === sessionId &&
          ((e.method === "Log.entryAdded" && e.params.entry.level === "error") ||
            e.method === "Runtime.exceptionThrown")
      )
      .map((e) =>
        e.method === "Log.entryAdded"
          ? `log: ${e.params.entry.text}`
          : `exception: ${e.params.exceptionDetails?.text}`
      );
  try {
    await fn({ evalJs, pageErrors });
  } finally {
    await send("Target.closeTarget", { targetId });
  }
}

const MEASURE = `(() => {
  const pins = [...document.querySelectorAll('.pin')];
  const dots = [...document.querySelectorAll('.dot')];
  const leads = document.getElementById('leads');
  const wide = getComputedStyle(leads).display !== 'none';
  const stage = document.getElementById('stage');
  const anchorMisses = pins.filter(p => !stage.querySelector(p.dataset.anchor)).length;
  // Overlap and off-page only mean something for laid-out labels: in narrow
  // mode a pin is display:none until tapped, so it measures 0x0.
  const boxes = wide ? pins.map(p => {
    const r = p.getBoundingClientRect();
    return { side: p.parentElement.id, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }) : [];
  let overlaps = 0;
  for (const side of ['pin-left','pin-right']) {
    const col = boxes.filter(b => b.side === side).sort((a,b) => a.top - b.top);
    for (let i = 1; i < col.length; i++) if (col[i].top < col[i-1].bottom - 0.5) overlaps++;
  }
  return {
    wide,
    pinCount: pins.length,
    dotCount: dots.length,
    leadCount: leads.querySelectorAll('line').length,
    anchorMisses, overlaps,
    offPage: boxes.filter(b => b.left < 0 || b.right > window.innerWidth).length,
    hScroll: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
    // Same rule as the post-tap count: a narrow-mode tooltip is position:fixed
    // and reports offsetParent === null even when it is on screen, so
    // offsetParent would read 0 for a label that IS wrongly visible.
    // The footer ran up underneath the label columns, because an absolutely
    // positioned label gives its column no height. Nothing above caught it:
    // the labels did not overlap EACH OTHER and were not off-page.
    footerOverlap: (() => {
      const f = document.querySelector('footer');
      if (!f || !wide) return 0;
      const fr = f.getBoundingClientRect();
      return boxes.filter(b => b.bottom > fr.top + 0.5 && b.top < fr.bottom - 0.5).length;
    })(),
    // The off-board footnote sits between the label columns and the footer,
    // so the footer check above cannot see it. An unmeasured block there is
    // how a column with no height hides: the labels land on top of the prose
    // and the footer still clears.
    offBoardOverlap: (() => {
      const o = document.querySelector('.off-board');
      if (!o || !wide) return 0;
      const or = o.getBoundingClientRect();
      return boxes.filter(b => b.bottom > or.top + 0.5 && b.top < or.bottom - 0.5).length;
    })(),
    offBoardHeight: (() => {
      const o = document.querySelector('.off-board');
      return o ? o.getBoundingClientRect().height : -1;
    })(),
    visibleLabels: pins.filter(p => {
      const s = getComputedStyle(p);
      return s.display !== 'none' && s.visibility !== 'hidden'
        && Number(s.opacity) > 0 && p.getBoundingClientRect().height > 1;
    }).length,
  };
})()`;

for (const vp of VIEWPORTS) {
  await withTarget(vp, async ({ evalJs, pageErrors }) => {
    const m = await evalJs(MEASURE);

    m.pinCount > 0
      ? ok(vp.name, `${m.pinCount} pins rendered`)
      : fail(vp.name, "no pins rendered — data or template emitted nothing");

    m.dotCount === m.pinCount
      ? ok(vp.name, `one dot per pin (${m.dotCount})`)
      : fail(
          vp.name,
          `${m.dotCount} dots for ${m.pinCount} pins — the suppress-everything bug`
        );

    m.anchorMisses === 0
      ? ok(vp.name, "every pin resolves its anchor")
      : fail(
          vp.name,
          `${m.anchorMisses} pins anchored to nothing — generator and mockup diverged`
        );

    m.overlaps === 0
      ? ok(vp.name, "no two labels overlap")
      : fail(vp.name, `${m.overlaps} overlapping label pairs — stacker regressed`);

    m.offPage === 0
      ? ok(vp.name, "nothing off-page")
      : fail(vp.name, `${m.offPage} labels off-page — column hung off the stage`);

    !m.hScroll
      ? ok(vp.name, "no horizontal page scroll")
      : fail(vp.name, "page scrolls horizontally");

    m.footerOverlap === 0
      ? ok(vp.name, "footer clears the label columns")
      : fail(
          vp.name,
          `${m.footerOverlap} labels overlap the footer — a column has no height`
        );

    // The footnote is rendered only when off_board has entries. When it is
    // there it must carry real height and no label may sit on it.
    if (m.offBoardHeight === -1) {
      ok(vp.name, "no off-board footnote on this page");
    } else {
      m.offBoardHeight > 1
        ? ok(vp.name, `off-board footnote has height (${m.offBoardHeight.toFixed(0)}px)`)
        : fail(vp.name, "off-board footnote rendered with no height");
      m.offBoardOverlap === 0
        ? ok(vp.name, "no label overlaps the off-board footnote")
        : fail(
            vp.name,
            `${m.offBoardOverlap} labels overlap the off-board footnote`
          );
    }

    // A tab switch must move nothing below it (the pane-height jump).
    const spread = await evalJs(`(async () => {
      const tabs = [...document.querySelectorAll('.tab')];
      const probe = document.getElementById('composer-input');
      if (!tabs.length || !probe) return -1;
      const tops = [];
      for (const t of tabs) {
        t.click();
        await new Promise(r => setTimeout(r, 120));
        tops.push(probe.getBoundingClientRect().top);
      }
      tabs[0].click();
      await new Promise(r => setTimeout(r, 150));
      return Math.max(...tops) - Math.min(...tops);
    })()`);
    spread >= 0 && spread < 2
      ? ok(vp.name, `tab switch moves nothing (spread ${spread.toFixed(1)}px)`)
      : fail(
          vp.name,
          `tab switch moved a fixed control ${spread.toFixed(1)}px — pane-height jump`
        );

    if (m.wide) {
      m.leadCount === m.pinCount
        ? ok(vp.name, `one leader line per pin (${m.leadCount})`)
        : fail(vp.name, `${m.leadCount} leader lines for ${m.pinCount} pins`);
    } else {
      // The list-fallback regression: labels stay hidden until a dot is tapped.
      m.visibleLabels === 0
        ? ok(vp.name, "no labels visible before a tap")
        : fail(
            vp.name,
            `${m.visibleLabels} labels visible with no tap — the list fallback is back`
          );

      // Measure the rendered box, not the marker class. Counting `.pin.shown`
      // passed with the CSS rule misspelled `.pin.open` — the class was still
      // added, nothing was visible, and the state-word collision (the exact
      // failure non-negotiable 6 names) went unseen.
      //
      // Do NOT test `offsetParent !== null` here. A narrow-mode tooltip is
      // position:fixed, and a fixed element reports offsetParent === null by
      // spec, so that check fails on a correct page. Height is the honest
      // signal: display:none measures 0, display:grid measures ~128px.
      // Return -1 rather than throwing when there is no dot. A crash here
      // aborts the whole run, so the suppress-everything bug would hide every
      // later viewport's result behind its own stack trace.
      const shown = await evalJs(`(async () => {
        const d = document.querySelector('.dot');
        if (!d) return -1;
        d.click();
        await new Promise(r => setTimeout(r, 150));
        return [...document.querySelectorAll('.pin')]
          .filter(p => {
            const s = getComputedStyle(p);
            return s.display !== 'none' && s.visibility !== 'hidden'
              && Number(s.opacity) > 0 && p.getBoundingClientRect().height > 1;
          }).length;
      })()`);
      shown === 1
        ? ok(vp.name, "exactly one label visible after tapping a dot")
        : fail(
            vp.name,
            shown === -1
              ? "no dot to tap — nothing to open a label with"
              : `${shown} labels visible after one tap, want 1`
          );
    }

    const errs = pageErrors();
    errs.length === 0
      ? ok(vp.name, "no page errors")
      : fail(vp.name, `page errors: ${errs.join(" | ")}`);
  });
}

ws.close();
if (child) {
  try {
    process.kill(-child.pid);
  } catch {}
}
if (server) server.close();

if (failures) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nall assertions passed");
process.exit(0);
