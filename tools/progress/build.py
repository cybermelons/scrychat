#!/usr/bin/env python3
"""The scrychat surface as it should end up, with every work item pinned to the
control it has to produce.

    python3 tools/progress/build.py            # writes docs/progress/index.html
    python3 tools/progress/build.py --check    # exit 1 if the page is stale
    python3 tools/progress/build.py --audit    # compare against the tracker

The board is not a screenshot. mockup.py builds the proposed surface as real
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
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import mockup  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, 'issues.json')
OUT = os.path.join(ROOT, 'docs/progress/index.html')


def check_anchors(issues, surface):
    """Fail on an issue whose anchor is not an id in the mockup."""
    ids = set(re.findall(r'\bid="([^"]+)"', surface))
    missing = [(i['n'], i['anchor']) for i in issues
               if i['anchor'].lstrip('#') not in ids]
    if missing:
        lines = '\n'.join(f'  #{n} anchors to {a}' for n, a in missing)
        raise SystemExit(
            f'these anchors are not in the surface mockup:\n{lines}\n'
            f'Either add the control to tools/progress/mockup.py, or point '
            f'the issue at one that is there. A pin with no anchor would '
            f'float over the background and still look authoritative.')


def links_html(links):
    """The dev, deploy and preview URLs as a header row.

    A link renders as an anchor only when it is actually serving. An entry
    carrying live=false becomes plain text, because an anchor to a 404 is
    worse than a line saying why there is no page yet: the reader clicks it,
    gets nothing, and learns nothing.
    """
    e = html.escape
    if not links:
        return ''
    out = []
    # Fixed order, widest audience first. A key not listed here is a typo or a
    # new link someone forgot to add, and dropping it silently is how a link
    # ends up missing from the board with nothing to show why.
    order = ('deploy', 'dev', 'preview')
    unknown = set(links) - set(order)
    if unknown:
        raise SystemExit(f'links has unknown {sorted(unknown)}: '
                         f'add it to the order in links_html, or fix the key')
    for key in order:
        v = links.get(key)
        if not v:
            continue
        label = e(v.get('label', key))
        if v.get('live', True):
            out.append(f'<span><b>{e(key)}</b>'
                       f'<a href="{e(v["url"])}" target="_blank" '
                       f'rel="noopener">{label}</a></span>')
        else:
            why = e(v.get('blocked', 'not serving yet'))
            out.append(f'<span><b>{e(key)}</b>'
                       f'<span class="dead" title="{why}">{label}</span></span>')
    return f'<div class="links">{"".join(out)}</div>'


def render(data):
    e = html.escape
    issues = data['issues']
    surface = mockup.surface_html()
    check_anchors(issues, surface)

    done = sum(1 for i in issues if i['state'] == 'closed')
    total = len(issues)
    pct = round(100 * done / total) if total else 0

    pins = []
    for i in issues:
        who = f'#{i["n"]}' if i.get('n') else repr(i.get('title', '?'))
        if not i.get('pin', '').strip():
            raise SystemExit(f"issue {who} has no annotation: "
                             f"a pin nobody can read is worse than no pin")
        # Three kinds of pin, and each needs a different link target:
        #   `n`      -> an issue in the tracker
        #   `commit` -> shipped work that was never filed as its own issue, so
        #               the commit that shipped it IS the record
        #   neither  -> nothing to link to; render as a plain element rather
        #               than a dead link to issue "None"
        # A pin must not carry both: two link targets on one element means the
        # badge and the href can disagree about what the pin refers to.
        if i.get('n') and i.get('commit'):
            raise SystemExit(f"issue {who} has both n and commit: "
                             f"pin one record, not two")
        if i.get('n'):
            num = f'{e(i.get("tag", ""))}{i["n"]}'
            href = f'{e(i.get("base", data["base"]))}{i["n"]}'
            cls = f'pin {i["state"]} {i["side"]}'
        elif i.get('commit'):
            sha = i['commit']
            if not (7 <= len(sha) <= 40 and all(c in '0123456789abcdef' for c in sha)):
                raise SystemExit(f"issue {who} has commit {sha!r}: "
                                 f"want a 7-40 char lowercase hex sha")
            num = e(sha[:7])
            href = f'{e(data["commit_base"])}{e(sha)}'
            cls = f'pin shipped {i["state"]} {i["side"]}'
        else:
            num, href, cls = None, None, f'pin unfiled {i["state"]} {i["side"]}'

        if href:
            open_tag = (f'<a class="{cls}" data-anchor="{e(i["anchor"])}" '
                        f'href="{href}" target="_blank" rel="noopener">')
            close_tag = '</a>'
        else:
            open_tag = (f'<div class="{cls}" '
                        f'data-anchor="{e(i["anchor"])}">')
            close_tag = '</div>'
        pins.append((i['side'],
            f'{open_tag}'
            f'<span class="pin-n">{num if num else "&middot;"}</span>'
            f'<span class="pin-t">{e(i["title"])}</span>'
            f'<span class="pin-p">{e(i["pin"])}</span>{close_tag}'))

    return TEMPLATE.format(
        surface=surface,
        links=links_html(data.get('links', {})),
        pins_left='\n  '.join(h for side, h in pins if side == 'left'),
        pins_right='\n  '.join(h for side, h in pins if side == 'right'),
        done=done, total=total, pct=pct, open_count=total - done,
        note=e(data.get('note', '')), base=e(data['base']),
    )


TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>scrychat — the surface, and what is left to build it</title>
<meta name="description" content="The scrychat chat and deck surface as it should end up, with every work item pinned to the control it has to produce.">
<style>
  :root {{
    --bg:#0e0f13; --fg:#e8e8ec; --dim:#a4a6b3; --line:#2a2c36;
    --accent:#c9a227; --card:#171922;
    --open:#c9a227; --closed:#5b8f6a;
    --mana-w:#f4f1e8; --mana-b:#9a86a8;
  }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; background:var(--bg); color:var(--fg);
         font:15px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }}
  a {{ color:var(--accent); }}
  header {{ padding:2.6rem 1rem 1.4rem; text-align:center; }}
  header h1 {{ margin:0; font-size:1.8rem; }}
  header .subtitle {{ color:var(--dim); margin:.6rem auto 1.2rem; max-width:44rem; }}
  .bar2 {{ max-width:28rem; margin:0 auto; height:8px; background:#22242e;
           border-radius:99px; overflow:hidden; }}
  .bar2 i {{ display:block; height:100%; background:var(--closed); }}
  .counts {{ color:var(--dim); font-size:.9rem; margin-top:.55rem; }}
  .legend {{ display:flex; gap:1.2rem; justify-content:center; flex-wrap:wrap;
             color:var(--dim); font-size:.85rem; margin-top:.8rem; }}
  .legend span {{ display:flex; align-items:center; gap:.4rem; }}
  .legend i {{ width:10px; height:10px; border-radius:50%; }}
  .links {{ display:flex; gap:1.2rem; justify-content:center; flex-wrap:wrap;
            font-size:.85rem; margin-top:.6rem; }}
  .links span {{ color:var(--dim); }}
  .links b {{ font-weight:600; text-transform:uppercase; letter-spacing:.04em;
              font-size:.72rem; color:var(--dim); margin-right:.35rem; }}
  .links a {{ color:var(--open); }}
  /* Not an anchor: the target does not exist yet, so it must not look
     clickable. */
  .links .dead {{ color:var(--dim); }}

  /* Three explicit columns: a label column, the surface, a label column.
     Centring the surface and hanging the labels off it with a negative
     offset instead pushes the left column off the left edge of the page,
     where it is unreachable and shows up only as a sideways scrollbar. */
  .board {{ display:grid; grid-template-columns:340px minmax(0,640px) 340px;
            justify-content:center; gap:0 36px;
            max-width:1500px; margin:0 auto; padding:1rem 1rem 4rem; }}
  #stage {{ position:relative; grid-column:2; }}
  /* Each column is its own positioning context, so a label cannot escape
     the page however long it grows. */
  #pin-left {{ position:relative; grid-column:1; }}
  #pin-right {{ position:relative; grid-column:3; }}

  /* ---- the proposed surface ---- */
  #app-shell {{ background:#111; border:1px solid var(--line);
                border-radius:12px; padding:16px; display:grid; gap:14px; }}
  #top-bar {{ display:flex; align-items:center; justify-content:space-between;
              gap:12px; flex-wrap:wrap;
              border-bottom:1px solid var(--line); padding-bottom:12px; }}
  .tb-left, .tb-right {{ display:flex; align-items:center; gap:8px; }}
  #app-title {{ font-weight:600; font-size:1rem; letter-spacing:.01em; }}
  .chip {{ font-size:.74rem; color:var(--dim); background:#191b24;
           border:1px solid var(--line); border-radius:99px; padding:3px 9px; }}
  #export-btn, #settings-btn, #attach-btn, #stop-btn, #send-btn,
  .sbtn, .sug-acts button, .setting button {{
           padding:6px 11px; border-radius:8px; background:#191b24;
           color:var(--fg); border:1px solid var(--line); font-size:.82rem; }}
  .primary {{ background:var(--accent) !important; color:#1a1405 !important;
              border-color:var(--accent) !important; font-weight:600; }}

  /* ---- tabs: every pane stays in the markup so a pin can anchor behind one ---- */
  .tab-heads {{ display:flex; gap:4px; flex-wrap:wrap;
                border-bottom:1px solid var(--line); }}
  .tab {{ padding:7px 12px; font-size:.82rem; background:none; color:var(--dim);
          border:1px solid transparent; border-bottom:none;
          border-radius:7px 7px 0 0; }}
  .tab.on {{ color:var(--fg); background:#191b24; border-color:var(--line);
             margin-bottom:-1px; }}
  /* All panes share one grid cell, so the stack is as tall as the tallest
     pane and a tab switch moves nothing below it. */
  .panes {{ display:grid; }}
  .panes > .pane {{ grid-area:1/1; }}
  .pane {{ padding:10px 2px 0; display:grid; gap:12px; align-content:start; }}
  /* An off pane is hidden but still measurable, so a pin can anchor to a
     control behind another tab. opacity:0 keeps the box; z-index keeps it
     under the pane in front, which is what paints. display:none would
     measure 0x0 and stack every label at the top of the column. */
  .pane.off {{ z-index:-1; opacity:0; pointer-events:none; }}

  /* ---- chat ---- */
  #chat-log {{ display:grid; gap:12px; }}
  .msg {{ padding:10px 12px; border-radius:10px; font-size:.86rem; }}
  .msg.user {{ background:#1d2130; border:1px solid #3c4252; justify-self:end;
               max-width:84%; }}
  .msg.bot {{ background:#15171f; border:1px solid var(--line); display:grid;
              gap:10px; }}
  .bot-p {{ margin:0; font-size:.86rem; line-height:1.55; }}
  #tool-chips {{ display:flex; gap:6px; flex-wrap:wrap; }}
  .tchip {{ font:600 .7rem/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;
            padding:2px 8px; border-radius:99px; border:1px solid var(--line);
            background:#191b24; color:var(--dim); }}
  .tchip.done {{ border-color:#3a5a46; color:#8fbfa0; }}
  .tchip.run {{ border-color:var(--accent); color:var(--accent); }}
  .cardref {{ color:var(--mana-b); text-decoration:underline dotted;
              text-underline-offset:2px; }}
  .cardref.focal {{ color:var(--accent); }}
  #focal-image {{ display:flex; align-items:center; gap:10px; }}
  .fi-box {{ width:92px; height:128px; border-radius:7px; background:#1d2130;
             border:1px solid #3c4252; display:grid; place-items:center;
             color:#6f7280; font-size:.68rem; }}
  .fi-cap {{ color:#6f7280; font-size:.72rem; }}
  #group-chips {{ display:flex; gap:6px; flex-wrap:wrap; }}
  .gchip {{ font-size:.72rem; color:var(--dim); background:#191b24;
            border:1px solid var(--line); border-radius:7px; padding:3px 8px; }}

  /* ---- the sim card: a chart spec rendered, not a model-authored component ---- */
  #sim-card {{ border:1px solid #3c4252; background:#12141c; border-radius:10px;
               padding:11px 12px; display:grid; gap:9px; }}
  .sim-h {{ display:flex; align-items:baseline; justify-content:space-between;
            gap:8px; font-size:.84rem; }}
  #sim-seed {{ color:#6f7280; font:.7rem/1 ui-monospace,SFMono-Regular,Menlo,monospace; }}
  #sim-chart .bars {{ display:flex; align-items:flex-end; gap:5px; height:64px; }}
  #sim-chart .bars i {{ flex:1; background:var(--accent); opacity:.82;
                        border-radius:2px 2px 0 0; }}
  #sim-chart .xaxis {{ display:flex; justify-content:space-between;
                       color:#6f7280; font-size:.66rem; margin-top:3px; }}
  .sim-note {{ margin:0; color:#6f7280; font-size:.72rem; }}
  #sim-compare {{ display:grid; gap:2px; font-size:.76rem; }}
  .cmp-row {{ color:var(--fg); }}
  .cmp-row.dim {{ color:var(--dim); }}
  #slide-strip {{ display:flex; align-items:center; gap:6px; flex-wrap:wrap;
                  border-top:1px solid var(--line); padding-top:9px; }}
  .slide {{ font-size:.74rem; color:var(--dim); background:#191b24;
            border:1px solid var(--line); border-radius:7px; padding:3px 9px; }}
  .slide.on {{ color:var(--fg); border-color:#3c4252; background:#1d2130; }}
  #slide-strip .sbtn {{ margin-left:auto; }}

  #composer {{ display:flex; align-items:center; gap:7px;
               border-top:1px solid var(--line); padding-top:11px; }}
  #composer-input {{ flex:1; min-width:8rem; background:#0c0d12; color:#6f7280;
                     border:1px solid var(--line); border-radius:8px;
                     padding:9px 11px; font-size:.84rem; }}

  /* ---- deck ---- */
  #quota-bars {{ display:grid; gap:6px; }}
  .qrow {{ display:grid; grid-template-columns:5.5rem 1fr 5.5rem;
           align-items:center; gap:9px; font-size:.78rem; }}
  .qn {{ color:var(--dim); }}
  .qbar {{ height:7px; background:#22242e; border-radius:99px; overflow:hidden; }}
  .qbar i {{ display:block; height:100%; background:var(--closed); }}
  .qbar i.under {{ background:var(--accent); }}
  .qv {{ color:var(--dim); text-align:right;
         font:.72rem/1 ui-monospace,SFMono-Regular,Menlo,monospace; }}
  #curve-strip {{ display:flex; align-items:flex-end; gap:10px;
                  font-size:.78rem; }}
  #curve-strip b {{ color:var(--dim); font-weight:600; font-size:.72rem;
                    letter-spacing:.08em; text-transform:uppercase; }}
  .cv {{ display:flex; align-items:flex-end; gap:4px; height:34px; flex:1; }}
  .cv i {{ flex:1; background:#3c4252; border-radius:2px 2px 0 0; }}
  #tag-groups {{ display:grid; gap:10px; }}
  .tgroup {{ border:1px solid var(--line); border-radius:9px; padding:9px 10px;
             background:#15171f; display:grid; gap:7px; }}
  .tg-h {{ font-size:.74rem; letter-spacing:.07em; text-transform:uppercase;
           color:var(--dim); font-weight:600; }}
  .tg-n {{ color:#6f7280; }}
  .tg-cards {{ display:flex; gap:6px; flex-wrap:wrap; }}
  .dcard {{ font-size:.76rem; padding:3px 8px; border-radius:7px;
            background:#191b24; border:1px solid var(--line); }}
  .dcard.owned {{ border-color:#3a5a46; }}
  .dcard.missing {{ border-style:dashed; color:var(--dim); }}

  #suggestions-panel {{ border:1px solid var(--accent); border-radius:10px;
                        padding:11px 12px; background:#14151c; display:grid;
                        gap:9px; }}
  .sg-h {{ display:flex; align-items:baseline; justify-content:space-between;
           gap:8px; font-size:.84rem; }}
  .sg-n {{ color:var(--accent); font-size:.74rem; }}
  .sug {{ border:1px solid var(--line); border-radius:8px; padding:9px 10px;
          background:#15171f; display:grid; gap:7px; }}
  .sug-top {{ display:flex; align-items:center; gap:8px; flex-wrap:wrap; }}
  .sug-kind {{ font:600 .66rem/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;
               text-transform:uppercase; letter-spacing:.06em; padding:1px 7px;
               border-radius:99px; border:1px solid var(--line);
               color:var(--dim); }}
  .sug-kind.swap {{ border-color:#3c4252; color:var(--mana-b); }}
  .sug-kind.add {{ border-color:#3a5a46; color:#8fbfa0; }}
  .sug-cards {{ font-size:.82rem; }}
  .sug-cards .out {{ color:var(--dim); text-decoration:line-through; }}
  .sug-cards .in {{ color:var(--fg); font-weight:600; }}
  .sug-why {{ margin:0; color:var(--dim); font-size:.76rem; line-height:1.45; }}
  .sug-acts {{ display:flex; gap:6px; flex-wrap:wrap; }}
  .sg-foot {{ margin:0; color:#6f7280; font-size:.72rem; }}

  /* ---- settings ---- */
  .pane-grid {{ display:grid; grid-template-columns:1fr 1fr; gap:9px 18px; }}
  .setting {{ display:flex; align-items:center; gap:7px; flex-wrap:wrap;
              font-size:.82rem; }}
  .setting-label {{ color:var(--fg); }}
  .setting-hint {{ flex-basis:100%; color:#6f7280; font-size:.72rem; }}
  .setting select {{ background:#191b24; color:var(--fg); font:inherit;
                     border:1px solid var(--line); border-radius:6px;
                     padding:3px 6px; max-width:11rem; }}
  .setting input[type=range] {{ width:88px; accent-color:var(--accent); }}
  .setting input[type=checkbox] {{ accent-color:var(--accent); }}
  #health-row {{ display:flex; gap:7px; flex-wrap:wrap;
                 border-top:1px solid var(--line); padding-top:10px; }}
  .hpill {{ font:.7rem/1.6 ui-monospace,SFMono-Regular,Menlo,monospace;
            padding:2px 8px; border-radius:99px; border:1px solid var(--line);
            background:#191b24; color:var(--dim); }}
  .hpill.ok {{ border-color:#3a5a46; color:#8fbfa0; }}
  .hpill.warn {{ border-color:var(--accent); color:var(--accent); }}

  /* Nothing on the mockup does anything. A control that looks live and is not
     is worse than one that is visibly inert. */
  #app-shell button, #app-shell summary, #app-shell select,
  #app-shell input {{ cursor:default; }}

  /* ---- pins ---- */
  #leads {{ position:absolute; inset:0; overflow:visible; z-index:3;
            pointer-events:none; }}
  #leads line {{ stroke:var(--open); stroke-width:1; opacity:.4; }}
  #leads line.closed {{ stroke:var(--closed); }}

  .dot {{ position:absolute; width:11px; height:11px; margin:-5.5px 0 0 -5.5px;
          border-radius:50%; background:var(--open); z-index:4;
          pointer-events:none; box-shadow:0 0 0 2px #0e0f13; }}
  .dot.closed {{ background:var(--closed); }}
  /* The control is on a pane that is not in front. The dot is still drawn and
     still sits on the control, but it must not read as a solid claim about
     what is on screen right now. */
  .dot.behind {{ background:transparent; box-shadow:0 0 0 2px #0e0f13,
                 inset 0 0 0 2px var(--open); }}
  .dot.behind.closed {{ box-shadow:0 0 0 2px #0e0f13,
                        inset 0 0 0 2px var(--closed); }}
  #leads line.behind {{ opacity:.16; stroke-dasharray:3 4; }}
  .pin.behind .pin-t::after {{ content:' \\2197'; color:var(--dim);
                               font-size:.8em; }}

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
  /* A commit-pinned item shipped without its own issue, so its badge is a
     sha, not a number. Dimmer and lighter than an issue number, so the eye
     does not read "ef5cc5d" as a tracker reference. */
  .pin.shipped .pin-n {{ opacity:.6; font-weight:400; }}
  /* No record at all: the dot still marks the control, but the badge is a
     dot rather than a number nobody can look up. */
  .pin.unfiled .pin-n {{ opacity:.45; }}

  /* Narrow: the board is still a board. A fallback that hides the dots and
     prints the labels as a list under the mockup is the one shape this page
     must not take. The dots stay on the control; the label becomes a tooltip
     that a tap opens. */
  @media (max-width:1320px) {{
    .board {{ display:block; max-width:680px; }}
    #leads {{ display:none; }}
    #pin-left, #pin-right {{ position:static; }}
    .pin {{ position:fixed; width:min(17rem,74vw); z-index:6;
            display:none; text-align:left !important;
            grid-template-columns:auto 1fr !important;
            background:#171922; border:1px solid #3c4252; border-radius:9px;
            padding:.6rem .7rem; box-shadow:0 8px 24px #000a; }}
    /* .shown, never .pin.open — open is the issue-state class and would
       match every open issue at once. */
    .pin.shown {{ display:grid; }}
    .dot {{ pointer-events:auto; cursor:pointer; width:14px; height:14px;
            margin:-7px 0 0 -7px; }}
  }}
  @media (max-width:560px) {{
    #app-shell {{ padding:11px; gap:11px; }}
    .pane-grid {{ grid-template-columns:1fr; }}
    .qrow {{ grid-template-columns:4.6rem 1fr 4.6rem; }}
  }}
  footer {{ max-width:46rem; margin:0 auto; padding:0 1rem 3rem;
            color:var(--dim); font-size:.82rem; text-align:center; }}
</style>
</head>
<body>
<header>
  <h1>scrychat — the surface, and what is left to build it</h1>
  <p class="subtitle">This is the chat and deck surface as it should end up, not
     as it is today. Every pin marks a control and links to its record: an
     issue number for work still tracked, a commit for work already shipped.</p>
  <div class="bar2"><i style="width:{pct}%"></i></div>
  <p class="counts">{done} closed · {open_count} open · {pct}% of {total}</p>
  {links}
  <div class="legend">
    <span><i style="background:var(--open)"></i> still to build</span>
    <span><i style="background:var(--closed)"></i> done</span>
  </div>
</header>

<div class="board">
  <div id="stage">
    <svg id="leads"></svg>
    {surface}
  </div>
  <div id="pin-left">{pins_left}</div>
  <div id="pin-right">{pins_right}</div>
</div>
<footer>{note} · <a href="{base}">All issues</a></footer>

<script>
// Each pin measures its own anchor, so a control that moves in the mockup
// takes its pin with it. Nothing here is a stored coordinate.
const stage = document.getElementById('stage');
const leads = document.getElementById('leads');
const pins = [...document.querySelectorAll('.pin')];
const MIN_GAP = 8;   // px between two labels before they are pushed apart

function place() {{
  leads.replaceChildren();
  document.querySelectorAll('.dot').forEach((d) => d.remove());
  // Below the breakpoint there is no label column and no leader line, but the
  // dots still belong on the controls: they are the whole board. Compute this
  // once and skip only the column placement and the lines — an early return
  // here suppresses every dot and reads as "I don't see any pins".
  const wide = getComputedStyle(leads).display !== 'none';

  const base = stage.getBoundingClientRect();
  const colLEl = document.getElementById('pin-left');
  const colREl = document.getElementById('pin-right');
  // Clear last run's height before measuring: a column that kept a stale
  // min-height would never shrink, so the footer gap would only ever grow.
  colLEl.style.minHeight = '';
  colREl.style.minHeight = '';
  const colL = colLEl.getBoundingClientRect();
  const colR = colREl.getBoundingClientRect();
  const want = [];
  for (const pin of pins) {{
    const el = stage.querySelector(pin.dataset.anchor);
    // check_anchors in build.py makes this unreachable, so a hit here means
    // the generator and the mockup have come apart.
    if (!el) {{ console.error('no anchor for pin', pin.dataset.anchor); continue; }}
    const r = el.getBoundingClientRect();
    const left = pin.parentElement.id === 'pin-left';
    want.push({{
      pin, left, el,
      // Just outside the box, not on its edge: on a line of text the edge is
      // the first letter, and the dot covers it.
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

  // The labels are absolutely positioned, so each column has no intrinsic
  // height and the footer runs up underneath them. Give every column the
  // height of its own stack so the grid row is as tall as the tallest column
  // and normal flow puts the footer below everything.
  if (wide) {{
    for (const [col, side] of [[colLEl, true], [colREl, false]]) {{
      const mine = want.filter((w) => w.left === side);
      const bottom = mine.length
        ? Math.max(...mine.map((w) => w.ly + w.h)) + base.top - col.getBoundingClientRect().top
        : 0;
      col.style.minHeight = `${{Math.ceil(bottom)}}px`;
    }}
  }} else {{
    colLEl.style.minHeight = '';
    colREl.style.minHeight = '';
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
    // A dot whose control is on a pane that is not in front still has to be
    // drawn (non-negotiable 8), but drawn identically it claims to point at a
    // control the reader cannot see, and on a deck/settings row — which spans
    // the pane — it lands on the pane edge next to every other such dot.
    // Dimming separates "here, now" from "here, behind that tab".
    const offPane = !!w.el.closest('.pane.off');
    dot.className = 'dot' + (w.pin.classList.contains('closed') ? ' closed' : '')
      + (offPane ? ' behind' : '');
    w.pin.classList.toggle('behind', offPane);
    dot.style.left = `${{w.ax}}px`;
    dot.style.top = `${{w.ay}}px`;
    // Narrow mode has no room for a label column, so the dot opens its own
    // label as a tooltip. The dot is the handle; the control under it stays
    // free to look like a control.
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
    const cls = [];
    if (w.pin.classList.contains('closed')) cls.push('closed');
    if (w.el.closest('.pane.off')) cls.push('behind');
    if (cls.length) line.setAttribute('class', cls.join(' '));
    leads.append(line);
  }}
}}

place();
// The labels are text, so their height depends on the width, and the stage
// height depends on the labels. Re-measure on resize and once the fonts land.
addEventListener('resize', place);
if (document.fonts) document.fonts.ready.then(place);

// A tap outside closes the open tooltip. Without this the only way to dismiss
// one is to find its own dot again.
document.addEventListener('click', () => {{
  for (const q of pins) q.classList.remove('shown');
}});

// The tabs are the one live control on the mockup, because a tab that does not
// switch cannot show that the pane fits in the width. An off pane keeps its box
// (opacity:0 and z-index:-1, not display:none), so a pin anchored to a control
// behind another tab still measures and still points at it.
for (const tab of document.querySelectorAll('.tab')) {{
  tab.style.cursor = 'pointer';
  tab.addEventListener('click', () => {{
    const want = tab.dataset.pane;
    for (const t of document.querySelectorAll('.tab')) t.classList.toggle('on', t === tab);
    for (const pane of document.querySelectorAll('.pane')) {{
      pane.classList.toggle('off', pane.id !== want);
    }}
    place();
  }});
}}
</script>
</body>
</html>
"""


def audit(data):
    """Compare the board against the tracker, both directions.

    A board that silently disagrees with the tracker is worse than no board:
    it reads as authoritative. Reports pins whose issue is not in the tracker,
    and pins whose state disagrees with the tracker.

    The tracker holds far more issues than the board pins, and that is correct:
    a board pins the controls one design needs, not every issue in the repo.
    So "in the tracker but not pinned" is only reported for issues the board
    SHOULD carry — ones labelled with `board_label` — and is otherwise silent.

    A foreign issue carries its own `base` and is skipped: it belongs to
    another tracker, so this repo's issue list says nothing about it.
    """
    repo = data['repo']
    try:
        out = subprocess.run(
            ['gh', 'issue', 'list', '--repo', repo, '--state', 'all',
             '--limit', '300', '--json', 'number,title,state,labels'],
            capture_output=True, text=True, timeout=60)
    except FileNotFoundError:
        raise SystemExit('gh is not installed: --audit needs it to read the '
                         'tracker. scrychat is on GitHub, so this uses gh, '
                         'not tea.')
    if out.returncode != 0:
        raise SystemExit(f'gh failed ({out.returncode}): {out.stderr.strip()}\n'
                         f'The board is unchanged; nothing was written.')
    try:
        tracker = {int(i['number']): i for i in json.loads(out.stdout)}
    except (json.JSONDecodeError, KeyError, TypeError) as exc:
        raise SystemExit(f'could not parse gh output: {exc}')

    local = {i['n']: i for i in data['issues']
             if 'base' not in i and i.get('n')}
    foreign = [i['n'] for i in data['issues'] if 'base' in i and i.get('n')]
    # Shipped work that was never filed. It has no tracker number, so the
    # tracker can neither confirm nor contradict it. A commit-pinned item is
    # still unfiled as far as the tracker is concerned.
    shipped = [i['title'] for i in data['issues'] if i.get('commit')]
    unfiled = [i['title'] for i in data['issues']
               if not i.get('n') and not i.get('commit')]
    label = data.get('board_label')

    def labels_of(i):
        return {l.get('name', '') for l in i.get('labels') or []}

    problems = []
    # Only issues carrying the board label are expected on the board. Without
    # a label configured, this direction is skipped rather than reporting
    # every unrelated issue in the repo as a problem.
    if label:
        for n in sorted(set(tracker) - set(local)):
            if label in labels_of(tracker[n]):
                problems.append(f'  #{n} labelled {label!r} but not pinned: '
                                f'{tracker[n].get("title", "")}')
    for n in sorted(set(local) - set(tracker)):
        problems.append(f'  #{n} on the board, not in tracker: '
                        f'{local[n]["title"]}')
    for n in sorted(set(local) & set(tracker)):
        want = tracker[n].get('state', '').lower()
        have = local[n]['state']
        if want and want != have:
            problems.append(f'  #{n} state: board says {have}, '
                            f'tracker says {want}')

    if foreign:
        print(f'skipped {len(foreign)} foreign issue(s): '
              f'{", ".join(f"#{n}" for n in foreign)}')
    if shipped:
        print(f'skipped {len(shipped)} pin(s) pinned to a commit, not an issue')
    if unfiled:
        print(f'skipped {len(unfiled)} unfiled pin(s) with no issue number')
    if not label:
        print('no board_label set: not reporting tracker issues that are '
              'missing from the board.')
    if problems:
        print('board and tracker disagree:')
        print('\n'.join(problems))
        return 1
    print(f'board matches tracker ({len(local)} pinned, {len(tracker)} in tracker)')
    return 0


def check_commits(data):
    """Report any commit-pinned item whose sha no remote branch contains.

    A commit link on the board points at GitHub. A sha that exists only in
    this clone resolves locally and still 404s for every reader, so a pin
    that looks like a citation is a dead link. `git branch -r --contains`
    answers the question the reader actually has: can the remote serve this.

    The `commit` field is the strong path: it validates the shape, then
    rejects a sha git does not know. A sha cited in annotation prose is
    only a secondary net, because an English word can be all hex
    characters ("effaced"), so the scan must ask git before treating a
    word as a citation. The cost is that a TYPO in an annotation sha
    reads as an ordinary word and passes. Put a sha a reader must be
    able to open in `commit`, not in prose.
    """
    pinned = [(i['title'], i['commit'])
              for i in data['issues'] if i.get('commit')]

    # A sha written into an annotation is a citation too, and an unguarded
    # one is how a stale reference survives a rename or a rebase. Scan the
    # prose for anything sha-shaped so the check covers both.
    #
    # An English word can be all hex characters ("effaced", "accede"), so a
    # shape match alone would fail the build on ordinary prose. Ask git
    # whether the word names a commit here, and only then treat it as a
    # citation. A word git does not know is just a word.
    for i in data['issues']:
        for m in re.finditer(r'\b[0-9a-f]{7,40}\b', i.get('pin', '')):
            w = m.group()
            if subprocess.run(['git', 'rev-parse', '--verify', '-q',
                               f'{w}^{{commit}}'],
                              capture_output=True).returncode == 0:
                pinned.append((f"{i['title']} (annotation)", w))

    if not pinned:
        return 0

    missing, unknown = [], []
    for title, sha in pinned:
        r = subprocess.run(['git', 'branch', '-r', '--contains', sha],
                           capture_output=True, text=True)
        if r.returncode:
            # An unknown sha is worse than an unpushed one: it is not even a
            # commit here, so nothing can be said about it.
            unknown.append((title, sha, r.stderr.strip().splitlines()[0]
                            if r.stderr.strip() else 'unknown sha'))
        elif not r.stdout.strip():
            missing.append((title, sha))

    for title, sha, why in unknown:
        print(f'UNKNOWN {sha[:7]}  {title}: {why}')
    for title, sha in missing:
        print(f'UNPUSHED {sha[:7]}  {title}')
    if missing or unknown:
        print(f'\n{len(missing) + len(unknown)} commit pin(s) no reader can '
              f'open. Push the branch, or pin a sha that is on a remote.')
        return 1
    print(f'all {len(pinned)} commit pin(s) are on a remote branch')
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true',
                    help='exit 1 if the written page is stale')
    ap.add_argument('--audit', action='store_true',
                    help='compare the board against the tracker')
    ap.add_argument('--check-commits', action='store_true',
                    help='exit 1 if a commit pin is not on a remote branch')
    args = ap.parse_args()

    with open(DATA) as fh:
        data = json.load(fh)

    if args.audit:
        return audit(data)

    if args.check_commits:
        return check_commits(data)

    page = render(data)

    if args.check:
        if not os.path.exists(OUT):
            print(f'{OUT} does not exist: run build.py')
            return 1
        with open(OUT) as fh:
            if fh.read() != page:
                print(f'{OUT} is stale: run build.py')
                return 1
        print(f'{OUT} is current')
        return 0

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w') as fh:
        fh.write(page)
    issues = data['issues']
    done = sum(1 for i in issues if i['state'] == 'closed')
    print(f'wrote {OUT} ({len(issues)} pins, {done} closed, '
          f'{len(issues) - done} open)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
