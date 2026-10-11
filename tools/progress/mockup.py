#!/usr/bin/env python3
"""The scrychat surface as it should end up, as real markup.

Not a screenshot. Every part an issue could own carries an `id`, and the
board's own script measures those ids in the browser, so a control that moves
takes its pin with it and no coordinate is ever stored.

Two panes stacked in one grid cell (chat / deck) plus the settings drawer,
because a pin may anchor to a control on a pane that is not in front. An off
pane keeps its box (opacity:0, z-index:-1 — never display:none, which measures
0x0 and stacks every label at the top of the column).

The SHELL matches the artifact, deliberately (#60). An earlier draft drew a
global top bar over three tab panes. The artifact is a responsive two-panel
layout: DeckPanel beside ChatPanel (`App.tsx`, `className="app"`), the deck
panel becoming a slide-over drawer below ~900px, and settings a modal drawer
behind the gear in the chat header — not a third tab. Measured 2026-10-11:
of 35 anchored controls, 28 already existed in `apps/web/ui/src/**` under a
className, and only `app-shell`/`top-bar`/`deck-chip`/`pane-settings` were
genuinely absent — three of those four only because the mockup had invented a
layout nobody was going to build.

So the header lives inside the chat pane (where `chat-panel-header` really
is) and Export sits on the deck panel (where `DeckPanel` really puts it),
rather than in a bar that does not exist. The tab heads remain as the board's
own way to bring a hidden pane forward for measurement; they stand for the
gear and the ☰ toggle, which is how the artifact reaches those surfaces.

Keeping the mockup honest about the shell is the point of the exercise: a
pin anchored to an invented container can never be closed, and a board that
asks for a layout the project rejected spends its design review on a picture
that describes nothing.
"""


def surface_html() -> str:
    return """
<div id="app-shell">


  <div class="tab-heads">
    <button class="tab on" data-pane="pane-chat">Chat</button>
    <button class="tab" data-pane="pane-deck">Deck &#9776;</button>
    <button class="tab" data-pane="pane-settings">Settings &#9881;</button>
  </div>

  <div class="panes">

    <!-- ---------------- chat ---------------- -->
    <div class="pane" id="pane-chat">

      <div id="top-bar">
        <button id="deck-toggle" title="open deck panel">&#9776;</button>
        <select id="chat-select"><option>New Chat</option></select>
        <span class="chip" id="deck-chip">Teysa Karlov · 99</span>
        <span class="tb-spacer"></span>
        <span id="app-title">scrychat</span>
        <button id="settings-btn" title="settings">&#9881;</button>
      </div>

      <div id="chat-log">

        <div class="msg user" id="msg-user">
          Build me a Teysa aristocrats shell under $150, then goldfish it.
        </div>

        <div class="msg bot">
          <div id="tool-chips">
            <span class="tchip done" id="chip-search">search_cards</span>
            <span class="tchip done" id="chip-alts">find_alternatives</span>
            <span class="tchip done" id="chip-combos">find_combos</span>
            <span class="tchip run" id="chip-goldfish">goldfish_deck</span>
          </div>

          <p class="bot-p">
            Shell is built around
            <a class="cardref focal" id="card-focal">Teysa Karlov</a>
            &mdash; every death trigger twice.
          </p>

          <div id="focal-image">
            <div class="fi-box">card image</div>
            <span class="fi-cap">![[Teysa Karlov]] &mdash; focal, max 2&ndash;3 per reply</span>
          </div>

          <p class="bot-p">
            Sac outlets: <a class="cardref" id="card-hover">Viscera Seer</a>,
            <a class="cardref">Carrion Feeder</a>,
            <a class="cardref">Bastion of Remembrance</a>.
            Owned flags come from your Arena snapshot.
          </p>

          <div id="group-chips">
            <span class="gchip">[[group:sac-outlet]] 8</span>
            <span class="gchip">[[group:token-maker]] 11</span>
            <span class="gchip">[[group:payoff]] 6</span>
          </div>

          <div id="sim-card">
            <div class="sim-h">
              <b>Goldfish</b>
              <span id="sim-seed">seed 0 &middot; 1000 games</span>
            </div>
            <div id="sim-chart">
              <div class="bars">
                <i style="height:14%"></i><i style="height:31%"></i>
                <i style="height:58%"></i><i style="height:81%"></i>
                <i style="height:62%"></i><i style="height:38%"></i>
                <i style="height:21%"></i><i style="height:11%"></i>
              </div>
              <div class="xaxis"><span>T1</span><span>T8</span></div>
            </div>
            <p class="sim-note" id="sim-caveats">
              Per-colour sources, greedy sequencing &mdash; still optimistic.
            </p>
            <div id="sim-compare">
              <span class="cmp-row">this build <b>T4.1</b></span>
              <span class="cmp-row dim">prior build <b>T4.8</b></span>
            </div>
          </div>

          <div id="slide-strip">
            <span class="slide on">Curve</span>
            <span class="slide">Swaps</span>
            <span class="slide">Win con</span>
            <button class="sbtn" id="present-btn">Present</button>
          </div>
        </div>
      </div>

      <div id="composer">
        <button id="attach-btn" title="attach">&#128247;</button>
        <div id="composer-input">Ask, or drop a deck photo&hellip;</div>
        <button id="stop-btn">Stop</button>
        <button id="send-btn" class="primary">Send</button>
      </div>
    </div>

    <!-- ---------------- deck ---------------- -->
    <div class="pane off" id="pane-deck">

      <div id="deck-head">
        <span class="deck-name">Teysa Karlov</span>
        <button id="export-btn">Export</button>
      </div>

      <div id="quota-bars">
        <div class="qrow" id="quota-lands">
          <span class="qn">lands</span>
          <span class="qbar"><i style="width:97%"></i></span>
          <span class="qv">37 / 36&ndash;38</span>
        </div>
        <div class="qrow" id="quota-ramp">
          <span class="qn">ramp</span>
          <span class="qbar"><i style="width:75%" class="under"></i></span>
          <span class="qv">9 / 10&ndash;12</span>
        </div>
        <div class="qrow">
          <span class="qn">draw</span>
          <span class="qbar"><i style="width:91%"></i></span>
          <span class="qv">11 / 10&ndash;12</span>
        </div>
        <div class="qrow">
          <span class="qn">interaction</span>
          <span class="qbar"><i style="width:80%"></i></span>
          <span class="qv">8 / 8&ndash;10</span>
        </div>
      </div>

      <div id="curve-strip">
        <b>Curve</b>
        <span class="cv"><i style="height:30%"></i><i style="height:62%"></i><i
          style="height:100%"></i><i style="height:71%"></i><i
          style="height:44%"></i><i style="height:22%"></i></span>
      </div>

      <div id="tag-groups">
        <div class="tgroup" id="tgroup-sac">
          <div class="tg-h">sac-outlet <span class="tg-n">8</span></div>
          <div class="tg-cards">
            <span class="dcard owned" id="dcard-owned">Viscera Seer</span>
            <span class="dcard owned">Carrion Feeder</span>
            <span class="dcard missing" id="dcard-missing">Bastion of Remembrance</span>
          </div>
        </div>
        <div class="tgroup">
          <div class="tg-h">token-maker <span class="tg-n">11</span></div>
          <div class="tg-cards">
            <span class="dcard owned">Ophiomancer</span>
            <span class="dcard owned">Pitiless Plunderer</span>
            <span class="dcard" id="dcard-tagedit">Requiem Angel &#9998;</span>
          </div>
        </div>
      </div>

      <div id="suggestions-panel">
        <div class="sg-h">
          <b>Proposed by chat</b>
          <span class="sg-n" id="sug-count">3 pending</span>
        </div>

        <div class="sug" id="sug-swap">
          <div class="sug-top">
            <span class="sug-kind swap">swap</span>
            <span class="sug-cards">
              <span class="out">Dictate of Erebos</span>
              &rarr;
              <span class="in">Grave Pact</span>
            </span>
          </div>
          <p class="sug-why" id="sug-why">
            Same effect one mana cheaper; curve is heavy at five.
          </p>
          <div class="sug-acts" id="sug-actions">
            <button class="primary">Accept</button>
            <button>Reject</button>
            <button id="sug-note-btn">Note&hellip;</button>
          </div>
        </div>

        <div class="sug" id="sug-add">
          <div class="sug-top">
            <span class="sug-kind add">add</span>
            <span class="sug-cards"><span class="in">Blood Artist</span></span>
          </div>
          <p class="sug-why">Drain payoff; you have 8 sac outlets and 2 payoffs.</p>
          <div class="sug-acts">
            <button class="primary">Accept</button><button>Reject</button>
          </div>
        </div>

        <p class="sg-foot" id="sug-fence">
          Chat proposes. Nothing here edits the deck until you accept.
        </p>
      </div>
    </div>

    <!-- ---------------- settings ---------------- -->
    <div class="pane off" id="pane-settings">
      <div class="pane-grid">
        <div class="setting" id="set-export">
          <span class="setting-label">Default export</span>
          <select><option>MTGA</option><option>Moxfield</option><option>Plain</option></select>
        </div>
        <div class="setting" id="set-linkify">
          <span class="setting-label">linkifyPass</span>
          <input type="checkbox" checked>
          <span class="setting-hint">Haiku only for ambiguous names</span>
        </div>
        <div class="setting" id="set-quota">
          <span class="setting-label">Quota targets</span>
          <span class="chip">per-deck override</span>
        </div>
        <div class="setting" id="set-seed">
          <span class="setting-label">Goldfish seed</span>
          <input type="number" min="0" max="2147483647" value="20">
          <button>Randomize</button>
          <span class="setting-hint">Fixed seed keeps two runs comparable</span>
        </div>
        <div class="setting" id="set-codeexec">
          <span class="setting-label">Hosted code execution</span>
          <input type="checkbox">
          <span class="setting-hint">Off-host sandbox for ad-hoc analysis</span>
        </div>
        <div class="setting" id="set-collection">
          <span class="setting-label">Arena log folder</span>
          <button>Relink</button>
          <span class="setting-hint">Re-read Player.log on demand</span>
        </div>
      </div>

      <div id="health-row">
        <span class="hpill ok" id="health-mirror">mirror: cards + tags</span>
        <span class="hpill ok">skill: readable</span>
        <span class="hpill warn" id="health-arena">arena: 12d old</span>
        <span class="hpill ok" id="health-hits">local hits: 94%</span>
      </div>
    </div>

  </div>
</div>
"""
