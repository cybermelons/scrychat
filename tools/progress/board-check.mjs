import { chromium } from 'playwright-core';
const URL = 'http://100.115.109.103:8140/progress.html';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
const fail = [];
for (const w of [1440, 820, 390]) {
  const p = await b.newPage({ viewport: { width: w, height: 1000 } });
  await p.goto(URL, { waitUntil: 'load' });
  await p.waitForTimeout(700);
  const r = await p.evaluate(() => {
    const dots = [...document.querySelectorAll('.dot')];
    const pins = [...document.querySelectorAll('.pin')];
    const anchors = pins.map(x => x.dataset.anchor).filter(Boolean);
    const missing = anchors.filter(a => !document.querySelector(a));
    const placed = dots.filter(d => {
      const b = d.getBoundingClientRect();
      return b.width > 0 && b.height > 0 && b.top !== 0;
    }).length;
    const zero = [...document.querySelectorAll('[data-anchor]')]
      .map(x => x.dataset.anchor)
      .filter(a => { const el = document.querySelector(a); if (!el) return false;
                     const bb = el.getBoundingClientRect(); return bb.width === 0 && bb.height === 0; });
    // the chat column must be fully inside the stage, not clipped off the edge
    const stage = document.getElementById('stage');
    const chat = document.querySelector('#chatcol');
    let clipped = null;
    if (stage && chat) {
      const sb = stage.getBoundingClientRect(), cb = chat.getBoundingClientRect();
      if (cb.right > sb.right + 2) clipped = Math.round(cb.right - sb.right);
    }
    // The target's stylesheet is embedded in this page and shares class names
    // with the board's own chrome (.meter, .note, .chip, .bar, .dot, .ok,
    // .warn, .bad). Measured: an unscoped mockup `.meter{height:8px}` clipped
    // the board's progress meter to an 8px strip, text invisible, while every
    // dot assertion above still passed. Any board chrome element shorter than
    // the text it contains is that collision.
    const squashed = ['.meter', '.meter-t', '.note', '.links'].flatMap(sel =>
      [...document.querySelectorAll('header ' + sel + ', body > ' + sel)]
        .filter(el => el.scrollHeight > el.getBoundingClientRect().height + 1)
        .map(el => sel + ' ' + Math.round(el.getBoundingClientRect().height)
                 + '<' + el.scrollHeight));
    return { dots: dots.length, pins: pins.length, missing, placed, zero, clipped, squashed,
             overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
             scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth };
  });
  console.log(`w=${w}`, JSON.stringify(r));
  if (r.dots === 0) fail.push(`${w}: no dots rendered`);
  if (r.missing.length) fail.push(`${w}: anchors missing ${r.missing}`);
  if (r.placed === 0) fail.push(`${w}: no dot placed (all at 0)`);
  if (r.zero.length) fail.push(`${w}: zero-size anchors ${r.zero}`);
  if (r.overflowX) fail.push(`${w}: horizontal overflow ${r.scrollW}>${r.innerW}`);
  if (r.clipped) fail.push(`${w}: chat column clipped ${r.clipped}px past the stage`);
  if (r.squashed.length) fail.push(`${w}: board chrome squashed by target CSS ${r.squashed}`);
  await p.screenshot({ path: `board-${w}.png`, fullPage: false });
  await p.close();
}
await b.close();
console.log(fail.length ? 'FAIL\n' + fail.join('\n') : 'PASS');
process.exit(fail.length ? 1 : 0);
