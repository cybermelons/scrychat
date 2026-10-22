#!/usr/bin/env python3
"""The scrychat v2 UI as it should end up, with every issue pinned to the
part of it that issue has to produce.

    python3 tools/progress/build.py            # writes docs/site/progress.html
    python3 tools/progress/build.py --check    # exit 1 if the page is stale
    python3 tools/progress/build.py --audit    # compare against the tracker

The board is not a screenshot. mockup.html is the target UI as real
markup, and each pin measures its own anchor in the browser, so a control that
moves takes its pin with it and no coordinate file can go stale.

Every anchor must exist in the mockup. A pin over empty background still looks
authoritative, so a missing anchor fails the build instead.
"""
import argparse
import html
import json
import os
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent.parent
DATA = Path(__file__).resolve().parent / 'issues.json'
OUT = ROOT / 'docs/site/v2.html'
MOCKUP = Path(__file__).resolve().parent / 'mockup.html'
REPO = 'cybermelons/scrychat'


def scope_css(style, root):
    """Prefix every selector in <style> blocks with `root`.

    Keeps @media/@supports wrappers intact and skips @keyframes bodies, whose
    `from`/`to`/`0%` steps are not selectors and must not be prefixed.
    """
    def scope_selector(sel):
        sel = sel.strip()
        if not sel or sel.startswith('@'):
            return sel
        out = []
        for part in sel.split(','):
            part = part.strip()
            if not part:
                continue
            if part.startswith(':root') or part.startswith('html'):
                out.append(root + part.split(' ', 1)[1] if ' ' in part else root)
            elif part.startswith(root):
                out.append(part)
            else:
                out.append(root + ' ' + part)
        return ', '.join(out)

    def scope_block(css):
        res, i, n = [], 0, len(css)
        while i < n:
            brace = css.find('{', i)
            if brace == -1:
                res.append(css[i:])
                break
            sel = css[i:brace]
            # find the matching close brace
            depth, j = 1, brace + 1
            while j < n and depth:
                if css[j] == '{':
                    depth += 1
                elif css[j] == '}':
                    depth -= 1
                j += 1
            body = css[brace + 1:j - 1]
            head = sel.strip()
            if head.startswith('@keyframes') or head.startswith('@font-face'):
                res.append(sel + '{' + body + '}')
            elif head.startswith('@'):
                # nested at-rule: scope the selectors inside it
                res.append(sel + '{' + scope_block(body) + '}')
            else:
                res.append(scope_selector(sel) + '{' + body + '}')
            i = j
        return ''.join(res)

    def one(m):
        return m.group(1) + scope_block(m.group(2)) + m.group(3)

    return re.sub(r'(<style\b[^>]*>)(.*?)(</style>)', one, style, flags=re.S)


def target_html():
    """The target UI: the body of mockup.html, with its own <style> kept.

    The mockup is a standalone page, so strip the document scaffolding and
    hand back what can be embedded in the board.
    """
    raw = MOCKUP.read_text(encoding='utf-8')
    style = '\n'.join(m.group(0) for m in re.finditer(
        r'<style\b[^>]*>.*?</style>', raw, re.S))
    m = re.search(r'<body\b[^>]*>(.*)</body>', raw, re.S)
    body = m.group(1) if m else raw
    # The mockup has no <body>, so `body` is the whole file and still carries
    # the <style> block extracted above. Emitted again inside .target-root it
    # is a second, UNSCOPED copy of every mockup rule, which is what actually
    # clipped the board's progress meter to 8px. Drop it; `style` has it.
    body = re.sub(r'<style\b[^>]*>.*?</style>', '', body, flags=re.S)
    body = re.sub(r'<link\b[^>]*rel="stylesheet"[^>]*>', '', body)
    # the mockup's own annotation UI is not part of the target
    body = re.sub(r'<button[^>]*class="toggle"[^>]*>.*?</button>', '', body, flags=re.S)
    body = re.sub(r'<div class="legend">.*?</div>\s*</div>', '', body, flags=re.S)
    # The mockup has no <body> of its own (it was written for an embedding
    # skeleton), so its `body{...}` rules would style the BOARD's body and its
    # `height:100%` would resolve against nothing. Scope both to the target.
    style = style.replace('html,body{margin:0;height:100%}',
                          '.target-root{margin:0}')
    style = re.sub(r'(?m)^body\{', '.target-root{', style)
    # The mockup's stylesheet is global once embedded, and it shares class
    # names with the board's own chrome (.meter, .note, .chip, .bar, .dot,
    # .ok, .warn, .bad). Measured: the mockup's `.meter{height:8px}` clipped
    # the board's progress meter to an 8px strip with its text hidden by
    # overflow:hidden. Confine every mockup rule to the target subtree so a
    # shared name cannot reach board chrome.
    style = scope_css(style, '.target-root')
    style = style.replace('.workspace{min-height:600px}',
                          '.target-root .workspace{min-height:900px}')
    style = style.replace('display:grid; height:100%;', 'display:grid; height:900px;')
    # The shell is a measured 1440px layout (260/825/1/354). Rendered narrower,
    # its 1fr deck column collapses to a strip of one-word lines. Pin it to the
    # width it was measured at and let the stage scroll instead.
    # Render the shell at the width it was measured at, then scale the whole
    # target down to the stage. A transform keeps getBoundingClientRect()
    # consistent for the pins (they measure the scaled box, which is what the
    # reader sees) and shows the entire three-column layout instead of
    # clipping the chat column off the right edge.
    style += ('\n<style>'
              '.target-root{width:1440px;transform-origin:top left}'
              '.target-root .workspace{width:1440px}'
              '#stage{min-width:0;overflow:hidden}'
              '</style>')
    # A board pin must be able to measure its anchor even when the target's
    # own responsive CSS hides that region. display:none measures 0x0, which
    # stacks every label at the top of the column instead of placing it on its
    # control, so the board keeps those regions laid out but invisible. The
    # standalone mockup is right to use display:none; this override is the
    # board's, and only the board's.
    keep_measurable = '''
<style>
/* board override: hidden-but-measurable, never display:none (see non-negotiable 8) */
@media (max-width:1180px){
  .target-root .navitem span:not(.ico),
  .target-root .navlabel,
  .target-root .logo span:not(.mark),
  .target-root .manatop,
  .target-root .track,
  .target-root .uname,
  .target-root .urank,
  .target-root .newdeck span:not(.ico){
    display:inline !important; opacity:0; pointer-events:none;
  }
}
@media (max-width:820px){
  .target-root .sidebar,
  .target-root .divider,
  .target-root .chat{
    display:block !important; opacity:0; z-index:-1; pointer-events:none;
  }
}
</style>'''
    return (style + keep_measurable
            + '\n<div class="target-root">' + body + '</div>')


def check_anchors(issues, editor):
    """Fail on an issue whose anchor is not an id in the mockup."""
    ids = set(re.findall(r'\bid="([^"]+)"', editor))
    missing = [(i['n'], i['anchor']) for i in issues
               if i['anchor'].lstrip('#') not in ids]
    if missing:
        lines = '\n'.join(f'  #{n} anchors to {a}' for n, a in missing)
        raise SystemExit(
            f'these anchors are not in the editor mockup:\n{lines}\n'
            f'Either add the control to tools/progress/mockup.py, or point '
            f'the issue at one that is there. A pin with no anchor would '
            f'float over the background and still look authoritative.')


def render(data):
    e = html.escape
    issues = data['issues']
    editor = target_html()
    check_anchors(issues, editor)

    # An issue may carry several pins (one per control it has to produce), so
    # progress counts distinct issues, not pins. Counting pins would report
    # 19 units of work where the tracker has 8.
    by_n = {}
    for i in issues:
        by_n.setdefault(i['n'], i['state'])
    done = sum(1 for s in by_n.values() if s == 'closed')
    total = len(by_n)
    pct = round(100 * done / total) if total else 0

    pins = []
    for i in issues:
        if not i.get('pin', '').strip():
            raise SystemExit(f"issue #{i['n']} has no annotation: "
                             f"a pin nobody can read is worse than no pin")
        pins.append((i['side'],
            f'<a class="pin {i["state"]} {i["side"]}" '
            f'data-anchor="{e(i["anchor"])}" '
            f'href="{e(i.get("base", data["base"]))}{i["n"]}" '
            f'target="_blank" rel="noopener">'
            f'<span class="pin-n">{e(i.get("tag", ""))}{i["n"]}</span>'
            f'<span class="pin-t">{e(i["title"])}</span>'
            f'<span class="pin-p">{e(i["pin"])}</span></a>'))

    return TEMPLATE.format(
        editor=editor,
        links=links_html(data.get('links', {})),
        pins_left='\n  '.join(h for side, h in pins if side == 'left'),
        pins_right='\n  '.join(h for side, h in pins if side == 'right'),
        done=done, total=total, pct=pct, open_count=total - done,
        pin_count=len(issues),
        note=e(data.get('note', '')), base=e(data['base']),
    )


def links_html(links):
    """The repo and preview URLs as a header row.

    A link is rendered as an anchor only when it is actually serving. An
    anchor to a 404 is worse than a line of text saying why there is no page
    yet: the reader clicks it, gets nothing, and learns nothing.
    """
    e = html.escape
    if not links:
        return ''
    out = []
    # Fixed order, widest audience first. A key not listed here is a typo or a
    # new link someone forgot to add, and dropping it silently is how a link
    # ends up missing from the board with nothing to show why.
    order = ('deploy', 'dev', 'mockup', 'preview', 'preview_dev')
    unknown = set(links) - set(order)
    if unknown:
        raise SystemExit(f'links has unknown {sorted(unknown)}: '
                         f'add it to the order in links_html, or fix the key')
    for key in order:
        it = links.get(key)
        if not it:
            continue
        # A not-live entry must say why, or the reader sees a bare label and
        # cannot tell whether it is broken or merely unlinked.
        if not it.get('live', True) and not it.get('blocked'):
            raise SystemExit(f'links.{key} is not live and gives no reason: '
                             f'a reader cannot tell broken from unbuilt')
        name = e(it.get('label', key))
        if it.get('live', True):
            row = f'<a href="{e(it["url"])}" target="_blank" rel="noopener">{name}</a>'
        else:
            row = f'<span class="dead">{name}: {e(it.get("blocked", "not live"))}</span>'
        out.append(f'<span><b>{e(key)}</b> {row}</span>')
    return f'<div class="links">{"".join(out)}</div>' if out else ''


TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>scrychat v2 &mdash; goal preview</title>
<style>
  :root {{
    --bg:#0f1117; --fg:#e8eaf0; --dim:#9aa1b4; --line:#2a2f3c;
    --panel:#171922; --accent:#e4b04a; --open:#e4b04a; --closed:#5b8f6a;
  }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--fg);
          font:15px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; }}
  a {{ color:var(--accent); }}
  header {{ max-width:46rem; margin:0 auto; padding:2.2rem 1rem .4rem;
            text-align:center; }}
  h1 {{ margin:0 0 .3rem; font-size:1.45rem; letter-spacing:.2px; }}
  .sub {{ color:var(--dim); font-size:.88rem; }}
  .note {{ max-width:46rem; margin:.9rem auto 0; padding:0 1rem;
           color:var(--dim); font-size:.84rem; }}
  .links {{ display:flex; flex-wrap:wrap; gap:.3rem 1.1rem;
            justify-content:center; margin:.7rem 0 .2rem; font-size:.8rem; }}
  .links b {{ color:var(--dim); font-weight:600; margin-right:.25rem; }}
  .links .dead {{ color:var(--dim); }}
  .meter {{ max-width:22rem; margin:1rem auto .2rem; }}
  .meter-t {{ display:flex; justify-content:space-between;
              font-size:.78rem; color:var(--dim); margin-bottom:.25rem; }}
  .meter-b {{ height:5px; background:#232734; border-radius:3px;
              overflow:hidden; }}
  .meter-f {{ height:100%; width:{pct}%; background:var(--closed); }}

  /* --- the board -----------------------------------------------------
     Three columns: labels, the target, labels. Each label column is its
     own positioning context, so a label cannot escape the page however
     long it grows. */
  .board {{ display:grid; grid-template-columns:300px minmax(0,1100px) 300px;
            justify-content:center; gap:0 28px;
            max-width:1860px; margin:0 auto; padding:1rem 1rem 4rem; }}
  #stage {{ position:relative; grid-column:2; }}
  #pin-left {{ position:relative; grid-column:1; }}
  #pin-right {{ position:relative; grid-column:3; }}

  .dot {{ position:absolute; width:11px; height:11px; margin:-5.5px 0 0 -5.5px;
          border-radius:50%; background:var(--open); z-index:4;
          box-shadow:0 0 0 3px rgba(228,176,74,.22); pointer-events:none; }}
  .dot.closed {{ background:var(--closed);
                 box-shadow:0 0 0 3px rgba(91,143,106,.22); }}
  #leads {{ position:absolute; inset:0; overflow:visible; z-index:3;
            pointer-events:none; }}
  #leads line {{ stroke:var(--open); stroke-width:1; opacity:.4; }}
  #leads line.closed {{ stroke:var(--closed); }}

  .pin {{ position:absolute; width:100%; text-decoration:none; color:inherit;
          display:grid; grid-template-columns:auto 1fr; gap:0 .4rem; }}
  .pin-n {{ font:600 .72rem/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;
            color:var(--dim); }}
  .pin.left {{ text-align:right; }}
  .pin-t {{ font-weight:600; font-size:.84rem; }}
  .pin-p {{ grid-column:1/-1; color:var(--dim); font-size:.76rem;
            line-height:1.4; margin-top:.1rem; }}
  .pin.closed .pin-t {{ color:var(--dim); font-weight:500; }}
  .pin:hover .pin-t {{ color:var(--accent); }}

  /* --- the target: the editor page ----------------------------------- */
  .editor {{ background:var(--panel); border:1px solid var(--line);
             border-radius:11px; padding:10px 12px 13px; }}
  .e-title {{ font-size:.78rem; color:var(--dim); letter-spacing:.3px;
              margin-bottom:9px; }}
  .bar {{ display:flex; align-items:center; gap:7px; flex-wrap:wrap;
          padding:6px 0; }}
  .bar-lbl {{ font-size:.7rem; color:var(--dim); text-transform:uppercase;
              letter-spacing:.5px; min-width:46px; }}
  .t-btn {{ display:inline-grid; place-items:center; width:26px; height:26px;
            border:1px solid var(--line); border-radius:6px; font-size:.7rem;
            background:#1d2130; }}
  .t-time {{ font:.78rem ui-monospace,SFMono-Regular,Menlo,monospace;
             color:var(--dim); }}
  .t-sp {{ flex:1 1 8px; }}
  .chip {{ font-size:.73rem; padding:3px 8px; border-radius:20px;
           border:1px solid var(--line); background:#1d2130; color:var(--fg);
           white-space:nowrap; }}
  .chip.warn {{ border-color:#7a5a2a; color:var(--accent);
                background:#241e14; }}
  .stoggle {{ font-size:.73rem; padding:3px 9px; border-radius:6px;
              border:1px solid var(--c); color:var(--c);
              background:color-mix(in srgb, var(--c) 12%, #1d2130); }}

  /* The timeline. --a is a start bar, --w a width in bars, out of 12. */
  .tl {{ position:relative; margin:8px 0 2px; }}
  .ruler {{ display:grid; grid-template-columns:repeat(12,1fr);
            margin-left:84px; border-bottom:1px solid var(--line);
            padding-bottom:2px; }}
  .tick {{ font:.62rem ui-monospace,SFMono-Regular,Menlo,monospace;
           color:#5c6479; padding-left:3px;
           border-left:1px solid #222736; }}
  .tick.dn {{ color:var(--dim); border-left-color:#39405280; }}
  .lane {{ display:flex; align-items:stretch; gap:0; margin-top:4px; }}
  .lane-h {{ width:84px; flex:0 0 84px; display:flex; align-items:center;
             justify-content:space-between; padding-right:8px; }}
  .lane-n {{ font-size:.72rem; color:var(--c,var(--dim)); font-weight:600; }}
  .ann-n {{ color:var(--dim); text-transform:uppercase; font-size:.63rem;
            letter-spacing:.5px; font-weight:600; }}
  .lane-b {{ font:.65rem ui-monospace,SFMono-Regular,Menlo,monospace;
             color:#5c6479; }}
  .lane-w {{ position:relative; flex:1 1 auto; min-width:0; height:38px;
             background:#13161f; border:1px solid #20242f; border-radius:4px;
             overflow:hidden; }}
  .lane-w svg {{ width:100%; height:100%; display:block; }}
  .lane.ann .lane-w {{ height:22px; background:#141822; }}
  .cseg, .kseg {{ position:absolute; top:2px; bottom:2px;
                  left:calc(var(--a)/12*100%); width:calc(var(--w,1)/12*100%);
                  display:grid; place-items:center;
                  font:.68rem ui-monospace,SFMono-Regular,Menlo,monospace;
                  border-left:1px solid #2d3443; color:var(--fg);
                  }}
  .cseg {{ background:#1b2030; }}
  .cseg.nd {{ color:var(--accent); background:#241e14; }}
  .kseg {{ background:#17241c; color:#8fc9a3; }}
  .kseg.mod {{ left:calc(8/12*100%); width:calc(4/12*100%);
               background:#2a1d26; color:#d79bbd; }}
  .turn {{ position:absolute; top:50%; translate:-50% -50%;
           left:calc(var(--a)/12*100%); font-size:.6rem; color:#6f93b8; }}
  .turn.nd {{ color:var(--accent); }}
  .region {{ position:absolute; inset:4px auto 4px calc(4/12*100%);
             width:calc(4/12*100%); border:1px dashed #3c4252;
             border-radius:3px; background:#ffffff08; }}
  .playhead {{ position:absolute; top:0; bottom:0;
               left:calc(84px + (5.2/12) * (100% - 84px));
               width:1px; background:var(--accent); z-index:2; }}
  .loopband {{ position:absolute; top:0; height:3px;
               left:calc(84px + (4/12) * (100% - 84px));
               width:calc((4/12) * (100% - 84px));
               background:var(--accent); opacity:.5; }}

  .lib {{ display:flex; flex-direction:column; gap:2px; margin-top:2px; }}
  .lib-row {{ display:grid; grid-template-columns:1fr auto auto auto;
              gap:10px; align-items:center; padding:4px 7px;
              background:#13161f; border:1px solid #20242f; border-radius:5px;
              font-size:.74rem; }}
  .lib-row i {{ color:var(--dim); font-style:normal;
                font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
                font-size:.68rem; }}
  .lib-row i.ok {{ color:#6f9c7e; }}
  .lib-row i.bad {{ color:var(--accent); }}
  .lib-row.dim {{ opacity:.6; }}

  .panel {{ margin-top:10px; border:1px solid var(--line); border-radius:8px;
            padding:8px 10px; background:#13161f; }}
  .p-h {{ font-size:.72rem; color:var(--dim); text-transform:uppercase;
          letter-spacing:.5px; margin-bottom:6px; }}
  .p-row {{ display:flex; align-items:center; gap:9px; flex-wrap:wrap;
            padding:3px 0; }}
  .inp {{ flex:1 1 180px; font-size:.73rem; color:#5c6479; padding:4px 8px;
          background:#0f1117; border:1px solid var(--line);
          border-radius:5px; }}
  .ck {{ font-size:.73rem; color:#8fc9a3; }}
  .p-note {{ font-size:.7rem; color:var(--dim); }}

  /* Narrow: the board is still a board. The fallback this replaces hid the
     dots and printed the labels as a list under the mockup, which is the one
     shape this page must not take. The dots stay on their controls; the
     label becomes a tooltip that a tap opens. */
  @media (max-width:1320px) {{
    .board {{ display:block; max-width:720px; }}
    #leads {{ display:none; }}
    #pin-left, #pin-right {{ position:static; }}
    .pin {{ position:fixed; width:min(17rem,74vw); z-index:6;
            display:none; text-align:left !important;
            grid-template-columns:auto 1fr !important;
            background:#171922; border:1px solid #3c4252; border-radius:9px;
            padding:.6rem .7rem; box-shadow:0 8px 24px #000a; }}
    /* .shown, not .open: open is the issue STATE, and a rule written
       .pin.open would match every open issue at once. */
    .pin.shown {{ display:grid; }}
    .dot {{ pointer-events:auto; cursor:pointer; width:14px; height:14px;
            margin:-7px 0 0 -7px; }}
  }}
  footer {{ max-width:46rem; margin:0 auto; padding:0 1rem 3rem;
            color:var(--dim); font-size:.82rem; text-align:center; }}
</style>
</head>
<body>
<header>
  <h1>scrychat v2 &mdash; goal preview</h1>
  <p class="sub">The scrychat v2 UI as the issues propose it. Every pin marks a
     part that still needs building, and links to its issue.</p>
  {links}
  <div class="meter">
    <div class="meter-t"><span>{done} of {total} issues closed</span>
      <span>{open_count} open &middot; {pin_count} pins</span></div>
    <div class="meter-b"><div class="meter-f"></div></div>
  </div>
</header>
<p class="note">{note}</p>

<div class="board">
  <div id="stage">
    <svg id="leads"></svg>
    {editor}
  </div>
  <div id="pin-left">{pins_left}</div>
  <div id="pin-right">{pins_right}</div>
</div>

<footer>Generated by tools/progress/build.py &mdash; do not edit by hand.
  Run <code>build.py --check</code> to see whether it is stale,
  <code>--audit</code> to compare it against the tracker.</footer>

<script>
// The target is authored at 1440px (its measured width). Scale it to whatever
// the stage actually is, so the whole shell stays visible and the pins measure
// the same box the reader sees.
function fitTarget() {{
  const root = document.querySelector('.target-root');
  const stage = document.getElementById('stage');
  if (!root || !stage) return;
  const avail = stage.clientWidth;
  const k = Math.min(1, avail / 1440);
  root.style.transform = k < 1 ? 'scale(' + k + ')' : '';
  // a scaled element still reserves its unscaled height
  root.style.height = (root.scrollHeight * k) + 'px';
}}

// Each pin measures its own anchor, so a control that moves in the mockup
// takes its pin with it. Nothing here is a stored coordinate.
const stage = document.getElementById('stage');
const leads = document.getElementById('leads');
const pins = [...document.querySelectorAll('.pin')];
const MIN_GAP = 8;   // px between two labels before they are pushed apart

function place() {{
  leads.replaceChildren();
  document.querySelectorAll('.dot').forEach((d) => d.remove());
  // Below the breakpoint there is no label column and no leader line, but
  // the dots still belong on the controls: they are the whole board. Only
  // the column placement and the lines are skipped, never the dot loop.
  const wide = getComputedStyle(leads).display !== 'none';

  const base = stage.getBoundingClientRect();
  const colL = document.getElementById('pin-left').getBoundingClientRect();
  const colR = document.getElementById('pin-right').getBoundingClientRect();
  const want = [];
  for (const pin of pins) {{
    const el = stage.querySelector(pin.dataset.anchor);
    // check_anchors in build.py makes this unreachable, so a hit here means
    // the generator and the mockup have come apart.
    if (!el) {{ console.error('no anchor for pin', pin.dataset.anchor); continue; }}
    const r = el.getBoundingClientRect();
    const left = pin.parentElement.id === 'pin-left';
    want.push({{
      pin, left,
      // Just outside the box, not on its edge: on a line of text the edge
      // is the first letter, and the dot covered it.
      ax: (left ? r.left - 7 : r.right + 7) - base.left,
      ay: r.top + r.height / 2 - base.top,
      // Where the leader line meets the label column, in stage coordinates.
      ex: (left ? colL.right : colR.left) - base.left,
      h: pin.offsetHeight,
    }});
  }}

  // A label wants to sit level with its control. Where that would overlap the
  // one above, it moves down just enough to clear it, and the leader line
  // slopes to show which control it belongs to.
  for (const side of [true, false]) {{
    const col = want.filter((w) => w.left === side).sort((a, b) => a.ay - b.ay);
    let floor = -1e9;
    for (const w of col) {{
      w.ly = Math.max(w.ay - w.h / 2, floor);
      floor = w.ly + w.h + MIN_GAP;
    }}
  }}

  const ns = 'http://www.w3.org/2000/svg';
  for (const w of want) {{
    // ly is measured from the stage, but each label is positioned inside its
    // own column, so it is converted into that column's coordinates.
    if (wide) {{
      const col = w.left ? colL : colR;
      w.pin.style.top = `${{w.ly + base.top - col.top}}px`;
    }}

    const dot = document.createElement('span');
    dot.className = 'dot' + (w.pin.classList.contains('closed') ? ' closed' : '');
    dot.style.left = `${{w.ax}}px`;
    dot.style.top = `${{w.ay}}px`;
    // Narrow mode has no room for a label column, so the dot opens its own
    // label as a tooltip. The dot is the handle; the control under it stays
    // free to behave like a control.
    dot.addEventListener('click', (ev) => {{
      ev.stopPropagation();
      const was = w.pin.classList.contains('shown');
      for (const q of pins) q.classList.remove('shown');
      if (was) return;
      w.pin.classList.add('shown');
      // Place it beside the dot, then pull it back inside the page.
      const pad = 10;
      const now = stage.getBoundingClientRect();
      w.pin.style.top = `${{w.ay + now.top + 14}}px`;
      w.pin.style.left = '0px';
      const r = w.pin.getBoundingClientRect();
      let x = w.ax + now.left - r.width / 2;
      x = Math.max(pad, Math.min(x, window.innerWidth - r.width - pad));
      w.pin.style.left = `${{x}}px`;
    }});
    stage.append(dot);

    if (!wide) continue;
    const line = document.createElementNS(ns, 'line');
    line.setAttribute('x1', w.ax);
    line.setAttribute('y1', w.ay);
    line.setAttribute('x2', w.ex);
    line.setAttribute('y2', w.ly + w.h / 2);
    if (w.pin.classList.contains('closed')) line.setAttribute('class', 'closed');
    leads.append(line);
  }}
}}

// Scale first: the pins measure the target, so a pin placed before the
// transform lands would point at the unscaled geometry.
function refresh() {{ fitTarget(); place(); }}

refresh();
// The labels are text, so their height depends on the width, and the stage
// height depends on the labels. Re-measure on resize and once the fonts land.
addEventListener('resize', refresh);
if (document.fonts) document.fonts.ready.then(refresh);

// A tap outside closes the open tooltip. Without this the only way to
// dismiss one is to find its own dot again.
document.addEventListener('click', () => {{
  for (const q of pins) q.classList.remove('shown');
}});
</script>
</body>
</html>
"""


def fetch_tracker():
    """Every issue in the tracker, keyed by number.

    Returns (issues, error). On any failure the dict is empty and the error is
    a one-line reason, because the callers differ: the build falls back to the
    committed state and keeps working offline, while --audit reports it.
    """
    import json as _json
    import subprocess

    live = {}
    page = 1
    while True:
        # tea paginates; a single call quietly truncates at the default limit.
        try:
            out = subprocess.run(
                ['gh', 'issue', 'list', '--repo', REPO,
                 '--state', 'all', '--json', 'number,state,title',
                 '--limit', '200'],
                capture_output=True, text=True, timeout=20)
        except FileNotFoundError:
            return {}, 'gh is not installed'
        except subprocess.TimeoutExpired:
            return {}, 'gh timed out after 20s'
        if out.returncode != 0:
            tail = (out.stderr or out.stdout).strip().splitlines()
            return {}, f'gh failed: {tail[-1] if tail else "no output"}'
        batch = _json.loads(out.stdout or '[]')
        if not batch:
            break
        for it in batch:
            live[int(it['number'])] = {
                'index': int(it['number']),
                # gh says OPEN/CLOSED; the board's vocabulary is open/closed
                'state': str(it['state']).lower(),
                'title': it.get('title', ''),
            }
        break  # gh returns every issue in one call
    return live, None


def apply_tracker_state(issues, live):
    """Overwrite each pin's state with the tracker's, and return what changed.

    The tracker owns issue state; issues.json only carries a fallback for when
    gitea is unreachable. Title is deliberately NOT synced here -- a pin's
    title is prose written for the board, and overwriting it from the tracker
    would undo the wording on every build. --audit still reports title drift.
    """
    changed = []
    for i in issues:
        if 'base' in i:  # foreign issue, tracked in another repo
            continue
        it = live.get(i['n'])
        if it is None:
            continue
        if it['state'] != i['state']:
            changed.append(f"#{i['n']} {i['anchor']} {i['state']} -> {it['state']}")
            i['state'] = it['state']
    return changed


def audit(issues):
    """Compare the board against the tracker, in both directions.

    A board that is only checked one way drifts silently: an issue closed in
    the tracker keeps its open-coloured pin, and an issue filed after the board
    was written never appears at all.
    """
    live, err = fetch_tracker()
    if err:
        return [err]

    problems = []

    # Several pins can share one issue (one per control it has to produce), so
    # the board is reduced to its distinct issues before comparing.
    board = {}
    for i in issues:
        # A foreign issue carries its own base link and is tracked elsewhere.
        if 'base' not in i:
            board.setdefault(i['n'], i)

    for n, i in sorted(board.items()):
        it = live.get(n)
        if it is None:
            problems.append(f'#{n} on the board, not in the tracker: {i["title"]}')
            continue
        if it['state'] != i['state']:
            problems.append(
                f'#{n} is {it["state"]} in the tracker, {i["state"]} on the '
                f'board: {i["title"]}')
        if it['title'] != i['title']:
            problems.append(
                f'#{n} title drifted\n  tracker: {it["title"]}\n  board:   {i["title"]}')

    for n, it in sorted(live.items()):
        if n not in board and it['state'] == 'open':
            problems.append(f'#{n} open in the tracker, no pin: {it["title"]}')

    return problems


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--check', action='store_true',
                    help='exit 1 if the committed page is not what this '
                         'generator would write now')
    ap.add_argument('--audit', action='store_true',
                    help='compare the board against the tracker and exit 1 on '
                         'any drift')
    args = ap.parse_args()

    data = json.loads(DATA.read_text())

    if args.audit:
        problems = audit(data['issues'])
        for p in problems:
            print(p)
        print(f'{len(problems)} problem(s)' if problems else 'board matches tracker')
        return 1 if problems else 0

    # The tracker owns issue state. Only the write path syncs it: --check
    # compares bytes against the committed page, so a live read there would
    # turn someone else closing an issue into a red gate.
    if not args.check:
        live, err = fetch_tracker()
        if err:
            # A gitea outage must not fail the build -- issues.json carries the
            # last known state for exactly this case.
            print(f'tracker unreachable ({err}); using committed state')
        else:
            for line in apply_tracker_state(data['issues'], live):
                print(f'tracker: {line}')

    page = render(data)

    if args.check:
        if not OUT.exists():
            print(f'{OUT} is missing; run build.py')
            return 1
        if OUT.read_text() != page:
            print(f'{OUT} is stale; run build.py')
            return 1
        print(f'{OUT} is up to date')
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(page)
    issues = data['issues']
    n_issues = len({i['n'] for i in issues})
    print(f'wrote {OUT} ({len(page):,} bytes, {len(issues)} pins, '
          f'{n_issues} issues)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
