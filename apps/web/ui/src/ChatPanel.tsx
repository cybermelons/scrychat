import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import type { AppConfig, ChartSpec, CompareSpec, SlideSpec, ChatEvent, ChatFile, ChatMessage, ChatSegment, ChatSummary } from "./types";
import { parseChartSpec } from "./chart-core";
import { compareVerdict, parseCompareSpec } from "./compare-core";
import { parseSlideSpec, parseContractRefusal } from "./slides-core";
import {
  ATTACH_MAX_COUNT,
  base64FromDataUrl,
  checkFile,
  toRequestImages,
  type PendingImage,
} from "./attach-core";
import { PRESENT_PROMPT } from "./present-prompt-core";
import { renderMarkdown } from "./markdown";
import { SettingsDrawer } from "./SettingsDrawer";
import { OtherDecks, type BrowseTarget } from "./Browse";
import "./chat.css";

const LAST_CHAT_KEY = "scrychat.lastChat";
const SHOW_IN_DECK_KEY = "scrychat.showInDeck";

function toolChipLabel(name: string, input: unknown): string {
  const short = name.replace(/^mcp__scrychat__/, "");
  if (input && typeof input === "object") {
    const obj = input as Record<string, unknown>;
    const arg = obj.query ?? obj.name ?? obj.deck ?? obj.card ?? null;
    if (typeof arg === "string" && arg.length > 0) {
      return `${short} ${arg.length > 48 ? arg.slice(0, 48) + "…" : arg}`;
    }
  }
  return short;
}

// Legacy chat files store {text, tools[]} instead of ordered segments. Map
// them to [tools..., text] so old chats still render top-to-bottom.
function segmentsForMessage(m: { text: string; tools?: { name: string; input: unknown }[]; segments?: ChatSegment[] }): ChatSegment[] {
  if (m.segments) return m.segments;
  const segs: ChatSegment[] = (m.tools ?? []).map((t) => ({ type: "tool" as const, name: t.name, input: t.input }));
  if (m.text) segs.push({ type: "text", text: m.text });
  return segs;
}

/*
 * MIRROR of TOOL_RESULT_MAX_CHARS in ../../src/truncate-core.ts (ui/ cannot
 * import from src/: tsconfig.build.json sets rootDir=src), the same
 * arrangement as attach-core.ts mirroring image-core.ts.
 *
 * #70: this cap used to be applied server-side when the result was captured,
 * which cut the STORED json mid-record and so silently disabled parseSlideSpec
 * / parseChartSpec and hid card names from the grounding check. Results now
 * arrive whole and the cap applies here, at the only place the raw result is
 * shown to a human. Keep it on this side of the boundary.
 */
const POPOVER_MAX_CHARS = 2048;

/** Bound the per-chip DOM attribute; the popover re-formats what it gets. */
function truncateForAttr(result: string): string {
  return result.length > POPOVER_MAX_CHARS
    ? `${result.slice(0, POPOVER_MAX_CHARS)}…`
    : result;
}

function prettyResult(result: string): string {
  let text: string;
  try {
    text = JSON.stringify(JSON.parse(result), null, 2);
  } catch {
    text = result;
  }
  // Cap AFTER formatting: pretty-printing expands the string, so capping the
  // raw json first would still hand the <pre> an oversized block.
  return text.length > POPOVER_MAX_CHARS ? `${text.slice(0, POPOVER_MAX_CHARS)}…` : text;
}

// Tool chip result status: pulse while awaiting (result undefined), else
// settle — red tint if the result JSON carries an "error" key or isError
// truthy, otherwise a plain settled state. Falls back to string sniffing if
// the result isn't valid JSON (e.g. plain-text error messages).
function toolResultStatus(result: string | undefined): "pending" | "error" | "ok" {
  if (result === undefined) return "pending";
  try {
    const parsed = JSON.parse(result);
    if (parsed && typeof parsed === "object") {
      if ((parsed as Record<string, unknown>).isError) return "error";
      if ("error" in (parsed as Record<string, unknown>)) return "error";
    }
    return "ok";
  } catch {
    return /error/i.test(result) ? "error" : "ok";
  }
}

// Labels and caption are React text children only: never innerHTML, never
// renderMarkdown (that would expand [[Card]] tokens from untrusted text).
// The only spec-derived value reaching style is a clamped integer 0..100.
function Chart({ spec }: { spec: ChartSpec }) {
  const max = Math.max(1, ...spec.data.map((d) => d.y));
  return (
    <div className="sim-chart">
      <div className="curve">
        {spec.data.map((d, i) => {
          const pct = Math.min(100, Math.max(0, Math.round((d.y / max) * 100)));
          return (
            <div className="curve-col" key={i}>
              <div className="curve-val">{Math.round(d.y * 100) / 100}</div>
              <div className="curve-bar-track">
                <div className="curve-bar" style={{ height: `${pct}%` }} />
              </div>
              <div className="curve-key">{d.x}</div>
            </div>
          );
        })}
      </div>
      <div className="sim-chart-axis">
        {spec.y} by {spec.x}
      </div>
      {spec.caption && <div className="sim-chart-caption">{spec.caption}</div>}
    </div>
  );
}

// Labels are React text children only (untrusted, see Chart). The shared
// conditions are shown once because both builds faced them: that is what makes
// the comparison honest. A delta inside the noise floor dims neither row.
function CompareTable({ spec }: { spec: CompareSpec }) {
  const { fasterIndex, magnitude } = compareVerdict(spec);
  return (
    <div id="sim-compare">
      {spec.builds.map((b, i) => (
        <span
          className={`cmp-row${fasterIndex !== null && fasterIndex !== i ? " dim" : ""}`}
          key={i}
        >
          {b.label} <b>T{b.turnsToOnline.toFixed(1)}</b>
        </span>
      ))}
      {fasterIndex === null ? (
        <span className="cmp-note">difference of {magnitude.toFixed(2)} turns is within simulation noise</span>
      ) : (
        <span className="cmp-note">
          {spec.builds[fasterIndex].label} is {magnitude.toFixed(1)} turns faster
        </span>
      )}
      <span className="cmp-note">
        seed {spec.seed} · {spec.iterations} games · {spec.maxTurns} turns · online = {spec.onlineThreshold} spells
      </span>
    </div>
  );
}

/**
 * Model-authored slide markup (#56), rendered into an iframe with an EMPTY
 * sandbox attribute.
 *
 * `sandbox=""` -- not omitted, and not `sandbox="allow-scripts"` -- is the
 * security boundary: it gives the frame an opaque origin with scripts, forms,
 * popups and top-level navigation all disabled, so the markup cannot reach
 * this document, its cookies or its storage even though it is same-document
 * in the React tree. Do not add an allow-* token here; `allow-scripts` alone
 * would let injected markup run JS in the user's browser.
 *
 * `html` has already passed checkSlideHtml, which covers what the sandbox
 * does not: outbound subresource requests and meta-refresh.
 */
function SlideFrame({ html }: { html: string }) {
  return (
    <iframe
      className="slide-frame"
      sandbox=""
      referrerPolicy="no-referrer"
      title="Slide"
      srcDoc={html}
    />
  );
}

// Title, text and chart are React text children / the Chart component only. The
// selected index is local state; slides are never reordered or mutated.
function SlideStrip({ spec }: { spec: SlideSpec }) {
  const [sel, setSel] = useState(0);
  const slide = spec.slides[Math.min(sel, spec.slides.length - 1)];
  return (
    <div id="slide-strip">
      {spec.slides.map((s, i) => (
        <button
          type="button"
          className={`slide${s === slide ? " on" : ""}`}
          key={i}
          onClick={() => setSel(i)}
        >
          {s.title}
        </button>
      ))}
      <div className="slide-body">
        {slide.text && <div className="slide-text">{slide.text}</div>}
        {slide.html && <SlideFrame html={slide.html} />}
        {slide.chart && <Chart spec={slide.chart} />}
      </div>
    </div>
  );
}

// [[group:LABEL|A; B]] tokens are lifted out of the prose and rendered as a
// .module of .cardchip rows. Oracle text / cost are not in the transcript, so
// the chips carry the name only. ponytail: a group inside a list item or table
// cell splits that block; fine for how the model emits them (own paragraph).
const GROUP_RE = /\[\[group:([^|\]]+)\|([^\]]+)\]\]/g;
type Part = { text: string } | { label: string; names: string[] };
function splitGroups(text: string): Part[] {
  const parts: Part[] = [];
  let last = 0;
  for (const m of text.matchAll(GROUP_RE)) {
    parts.push({ text: text.slice(last, m.index) });
    parts.push({
      label: m[1].trim(),
      names: m[2].split(";").map((n) => n.trim()).filter(Boolean),
    });
    last = m.index! + m[0].length;
  }
  parts.push({ text: text.slice(last) });
  return parts.filter((p) => !("text" in p) || p.text.trim() !== "");
}

function Module({ head, children }: { head: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="module">
      <div className="modhead">{head}</div>
      <div className="modbody">{children}</div>
    </div>
  );
}

function GroupModule({
  label,
  names,
  deckCardNames,
  showInDeck,
  deck,
}: {
  label: string;
  names: string[];
  deckCardNames: Set<string>;
  showInDeck: boolean;
  deck: string;
}) {
  const [sideNote, setSideNote] = useState<Record<string, string>>({});
  const addSide = (name: string) => {
    const note = (m: string) => setSideNote((p) => ({ ...p, [name]: m }));
    if (!deck) return note("no deck selected");
    fetch(`/api/decks/${encodeURIComponent(deck)}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cards: [{ name }], board: "side" }),
    })
      .then(async (r) => {
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error ?? `HTTP ${r.status}`);
        note(b.rejected?.[0]?.reason ?? "✓ Sideboard");
      })
      .catch((e: Error) => note(e.message));
  };
  return (
    <div className="module">
      <div className="modhead">
        {names.length} cards ·{" "}
        <span className="card-group" data-group-label={label} data-group-names={names.join(";")}>
          {label} &#9662;
        </span>
      </div>
      {names.map((name) => {
        const inDeck = showInDeck && deckCardNames.has(name.toLowerCase());
        return (
          <div className="cardchip" key={name}>
            <div className="chiptop">
              <span className="chipname" data-card-name={name}>
                {name}
                {inDeck && <span className="in-deck-badge">✓</span>}
              </span>
            </div>
            <div className="chipacts">
              <button
                type="button"
                className={`mini add${inDeck ? " added" : ""}`}
                data-add-card={name}
                title={inDeck ? "click to remove from deck" : undefined}
              >
                {inDeck ? "✓ In deck" : "＋ Add to deck"}
              </button>
              <button type="button" className="mini" onClick={() => addSide(name)}>
                {sideNote[name] ?? "＋ Sideboard"}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AssistantBody({
  msg,
  deckCardNames,
  showInDeck,
  deck,
  vote,
  onVote,
}: {
  msg: ChatMessage;
  deckCardNames: Set<string>;
  showInDeck: boolean;
  deck: string;
  vote: number;
  onVote: (v: 1 | -1) => void;
}) {
  return (
    <>
      {msg.segments.map((seg, i) =>
        seg.type === "text" ? (
          <Fragment key={i}>
            {splitGroups(seg.text).map((part, j) =>
              "text" in part ? (
                <div className="amsg" key={j}>
                  <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(part.text) }} />
                </div>
              ) : (
                <GroupModule
                  key={j}
                  label={part.label}
                  names={part.names}
                  deckCardNames={deckCardNames}
                  showInDeck={showInDeck}
                  deck={deck}
                />
              )
            )}
          </Fragment>
        ) : (
          <div className="amsg tool-chip-row" key={i}>
            <span
              className={`mini sc-chip sc-chip-tool sc-chip-tool-${toolResultStatus(seg.result)}`}
              // Capped: this is a DOM attribute on every chip and its only
              // reader is the hover popover (a human). The components below
              // read seg.result directly, so they still get the whole thing.
              data-result={seg.result ? truncateForAttr(seg.result) : ""}
            >
              ⚙ {toolChipLabel(seg.name, seg.input)}
            </span>
            {seg.name.replace(/^mcp__scrychat__/, "") === "goldfish_deck" && (() => {
              const spec = parseChartSpec(seg.result);
              return spec ? <Module head="Goldfish"><Chart spec={spec} /></Module> : null;
            })()}
            {seg.name.replace(/^mcp__scrychat__/, "") === "goldfish_compare" && (() => {
              const spec = parseCompareSpec(seg.result);
              return spec ? <Module head="Compare"><CompareTable spec={spec} /></Module> : null;
            })()}
            {seg.name.replace(/^mcp__scrychat__/, "") === "deck_present" && (() => {
              const spec = parseSlideSpec(seg.result);
              if (spec) return <Module head="Slides"><SlideStrip spec={spec} /></Module>;
              const refused = parseContractRefusal(seg.result);
              return refused ? (
                <Module head="Contract not met">
                  <ul>{refused.map((v, k) => <li key={k}>{v}</li>)}</ul>
                </Module>
              ) : null;
            })()}
          </div>
        )
      )}
      <div className="amsg">
        {msg.interrupted && <span className="msg-interrupted">stopped</span>}
        <div className="feedback">
          <span>Helpful?</span>
          <button type="button" className={`mini${vote === 1 ? " active" : ""}`} aria-pressed={vote === 1} onClick={() => onVote(1)}>▲</button>
          <button type="button" className={`mini${vote === -1 ? " active" : ""}`} aria-pressed={vote === -1} onClick={() => onVote(-1)}>▼</button>
        </div>
      </div>
    </>
  );
}

export function ChatPanel({
  selected,
  deckCardNames,
  config,
  onConfigChange,
  settingsOpen,
  onOpenSettings,
  onCloseSettings,
  onSelectDeck,
  onOpenBrowse,
}: {
  selected: string;
  deckCardNames: Set<string>;
  config: AppConfig | null;
  onConfigChange: (config: AppConfig) => void;
  settingsOpen: boolean;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onSelectDeck?: (name: string) => void;
  onOpenBrowse?: (t: BrowseTarget) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [tab, setTab] = useState<"chat" | "cards" | "history">("chat");
  const [histView, setHistView] = useState<"edits" | "chats">("edits");
  const [edits, setEdits] = useState<{ at: string; action: string }[]>([]);
  const [tipsOpen, setTipsOpen] = useState(false);
  const tipsRef = useRef<HTMLSpanElement>(null);
  const [historyScope, setHistoryScope] = useState<"all" | "deck">("all");
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [deckChats, setDeckChats] = useState<ChatSummary[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  // Per-message vote keyed by message index (messages carry no stable id).
  const [feedback, setFeedback] = useState<Record<string, number>>({});
  const cardsSearchRef = useRef<HTMLInputElement>(null);
  const vote = (idx: number, v: 1 | -1) => {
    const id = chatIdRef.current;
    if (!id) return;
    const key = String(idx);
    const prev = feedback[key] ?? 0;
    const next = prev === v ? 0 : v;
    setFeedback((f) => ({ ...f, [key]: next }));
    fetch(`/api/chats/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ feedback: { [key]: next } }),
    })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
      })
      .catch((e) => {
        console.error("feedback save failed", e);
        setFeedback((f) => ({ ...f, [key]: prev }));
      });
  };
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatsRefreshFailed, setChatsRefreshFailed] = useState(false);
  const [deckChatsRefreshFailed, setDeckChatsRefreshFailed] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const chatIdRef = useRef<string | null>(null);
  const lastUserMessageRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Attached images for the NEXT turn only. Cleared after send -- the server
  // never stores them and the transcript keeps no copy, so an image is
  // in-memory for exactly one request.
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([]);
  // Stick-to-bottom only while the user is already near the bottom; set by
  // onScroll, read (not reacted to) by the [messages] auto-scroll effect
  // below so we don't force-scroll away from a message the user scrolled
  // up to read.
  const stickToBottomRef = useRef(true);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const deckCardNamesRef = useRef(deckCardNames);
  deckCardNamesRef.current = deckCardNames;

  // In-deck indicator preference: persisted, defaults ON.
  const [showInDeck, setShowInDeck] = useState<boolean>(() => {
    const stored = localStorage.getItem(SHOW_IN_DECK_KEY);
    return stored === null ? true : stored === "true";
  });
  useEffect(() => {
    localStorage.setItem(SHOW_IN_DECK_KEY, String(showInDeck));
  }, [showInDeck]);

  // Hover popovers: tool-result (over a chip) and card preview (over a
  // card-ref/card-embed span). Positioned via fixed coords from the mouse
  // event; content resolved lazily (card images fetched + cached).
  const [toolPopover, setToolPopover] = useState<{ x: number; y: number; text: string } | null>(null);
  const [cardPopover, setCardPopover] = useState<{ x: number; y: number; url: string | null; name: string } | null>(null);
  const cardImageCache = useRef(new Map<string, string | null>());

  // Group-chip gallery popover: opened on hover/click of a .card-group chip.
  // Anchored under the chip (fixed coords), horizontally scroll-snapped.
  const [groupPopover, setGroupPopover] = useState<{
    x: number;
    y: number;
    label: string;
    names: string[];
    images: Record<string, string | null>;
    loading: boolean;
  } | null>(null);
  const groupImageCache = useRef(new Map<string, string | null>());
  const groupCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Transient hint/rejection chip near a click ("no deck selected", server
  // rejection reason). Auto-dismisses after a few seconds.
  const [hint, setHint] = useState<{ x: number; y: number; text: string } | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showHint = useCallback((x: number, y: number, text: string) => {
    setHint({ x, y, text });
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHint(null), 3000);
  }, []);

  // Undo chip for card removal via click-to-toggle (toggleDeckCard DELETE
  // branch). Timer resets on each new removal; a single chip covers the
  // latest one.
  const [cardUndo, setCardUndo] = useState<{ deck: string; name: string; tags: string[]; count: number } | null>(null);
  const cardUndoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Inline rename (replaces window.prompt) and inline delete-confirm
  // (replaces window.confirm) for the current chat.
  const [renamingChat, setRenamingChat] = useState(false);
  const [renameChatValue, setRenameChatValue] = useState("");
  const [renameChatBusy, setRenameChatBusy] = useState(false);
  const [confirmingDeleteChat, setConfirmingDeleteChat] = useState(false);
  const renameTriggerRef = useRef<HTMLButtonElement | null>(null);

  // Settings drawer (gear icon in header): Escape-close + focus-return to
  // the gear button is handled inside SettingsDrawer itself.
  const settingsTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stickToBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const onChatScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  }, []);

  const refreshChats = useCallback(() => {
    return fetch("/api/chats")
      .then((r) => r.json())
      .then((list: ChatSummary[]) => {
        setChats(list);
        setChatsRefreshFailed(false);
        return list;
      })
      .catch(() => setChatsRefreshFailed(true));
  }, []);

  const loadChat = useCallback((id: string) => {
    setChatError(null);
    setLoadingChat(true);
    stickToBottomRef.current = true; // open the newly-loaded chat scrolled to bottom
    return fetch(`/api/chats/${encodeURIComponent(id)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ChatFile>;
      })
      .then((file) => {
        chatIdRef.current = id;
        setChatId(id);
        sessionIdRef.current = null; // resume is driven server-side by the chat file now
        setFeedback((file as { feedback?: Record<string, number> }).feedback ?? {});
        setMessages(
          file.messages.map((m) => ({
            role: m.role,
            text: m.text,
            tools: m.tools ?? [],
            segments: segmentsForMessage(m),
          }))
        );
        localStorage.setItem(LAST_CHAT_KEY, id);
      })
      .catch((e: Error) => setChatError(e.message))
      .finally(() => setLoadingChat(false));
  }, []);

  const startNewChat = useCallback(() => {
    chatIdRef.current = null;
    setChatId(null);
    sessionIdRef.current = null;
    setMessages([]);
    setError(null);
    stickToBottomRef.current = true;
    localStorage.removeItem(LAST_CHAT_KEY);
  }, []);

  const deleteChat = useCallback(() => {
    const id = chatIdRef.current;
    if (!id) return;
    setChatError(null);
    setConfirmingDeleteChat(false);
    fetch(`/api/chats/${encodeURIComponent(id)}`, { method: "DELETE" })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        startNewChat();
        refreshChats();
      })
      .catch((e: Error) => setChatError(e.message));
  }, [startNewChat, refreshChats]);

  const openRenameChat = useCallback(() => {
    const id = chatIdRef.current;
    if (!id) return;
    const current = chats.find((c) => c.id === id)?.title ?? "";
    setRenameChatValue(current);
    setRenamingChat(true);
  }, [chats]);

  const cancelRenameChat = useCallback(() => {
    setRenamingChat(false);
    // Deferred past the state-flush re-render (same hazard as DeckPanel's
    // closeTagEditor/cancelGroupRename): calling .focus() synchronously here
    // can lose focus if the trigger button re-renders in response to
    // renamingChat flipping to false.
    setTimeout(() => renameTriggerRef.current?.focus(), 0);
  }, []);

  const saveRenameChat = useCallback(() => {
    const id = chatIdRef.current;
    if (!id) return;
    const title = renameChatValue.trim();
    if (!title) {
      cancelRenameChat();
      return;
    }
    setChatError(null);
    setRenameChatBusy(true);
    fetch(`/api/chats/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    })
      .then(async (r) => {
        if (!r.ok) {
          const body = await r.json().catch(() => ({}));
          throw new Error(body.error ?? `HTTP ${r.status}`);
        }
        setRenamingChat(false);
        setTimeout(() => renameTriggerRef.current?.focus(), 0);
        void refreshChats();
      })
      .catch((e: Error) => setChatError(e.message))
      .finally(() => setRenameChatBusy(false));
  }, [renameChatValue, refreshChats, cancelRenameChat]);

  // On mount: load chat list, restore last-open chat.
  useEffect(() => {
    refreshChats();
    const last = localStorage.getItem(LAST_CHAT_KEY);
    if (last) void loadChat(last);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the selected deck changes, refresh the "about <deck>" group.
  // Does not switch the open chat.
  useEffect(() => {
    if (!selected) {
      setDeckChats([]);
      return;
    }
    fetch(`/api/chats?deck=${encodeURIComponent(selected)}`)
      .then((r) => r.json())
      .then((list: ChatSummary[]) => {
        setDeckChats(list);
        setDeckChatsRefreshFailed(false);
      })
      .catch(() => setDeckChatsRefreshFailed(true));
  }, [selected]);

  const updateLastAssistant = useCallback(
    (fn: (m: ChatMessage) => ChatMessage) => {
      setMessages((msgs) => {
        const copy = [...msgs];
        for (let i = copy.length - 1; i >= 0; i--) {
          if (copy[i].role === "assistant") {
            copy[i] = fn(copy[i]);
            break;
          }
        }
        return copy;
      });
    },
    []
  );

  const removePendingImage = useCallback((idx: number) => {
    setPendingImages((prev) => {
      const gone = prev[idx];
      if (gone) URL.revokeObjectURL(gone.previewUrl);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const clearPendingImages = useCallback(() => {
    setPendingImages((prev) => {
      for (const p of prev) URL.revokeObjectURL(p.previewUrl);
      return [];
    });
  }, []);

  const onFilesPicked = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Read the current count from state inside the setter rather than closing
    // over it: two picks in quick succession would otherwise both see the old
    // length and together exceed ATTACH_MAX_COUNT.
    const accepted: PendingImage[] = [];
    let attached = pendingImages.length;
    for (const file of Array.from(files)) {
      const why = checkFile(file, attached);
      if (why) {
        setError(`${file.name}: ${why}`);
        continue;
      }
      const dataUrl = await new Promise<string | null>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl === null ? null : base64FromDataUrl(dataUrl);
      if (base64 === null) {
        setError(`${file.name}: could not read file`);
        continue;
      }
      accepted.push({
        previewUrl: URL.createObjectURL(file),
        mediaType: file.type,
        base64,
        bytes: file.size,
        name: file.name,
      });
      attached += 1;
    }
    if (accepted.length > 0) setPendingImages((prev) => [...prev, ...accepted]);
    // Clear the input so picking the same file twice still fires onChange.
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [pendingImages.length]);

  const send = useCallback(async (override?: string) => {
    const message = (override ?? input).trim();
    if (!message || streaming) return;
    // Snapshot before the await: the pick handler can add to pendingImages
    // while the request is in flight, and those belong to the NEXT turn.
    const turnImages = pendingImages;
    lastUserMessageRef.current = message;
    if (override === undefined) setInput("");
    if (turnImages.length > 0) clearPendingImages();
    setError(null);
    setStreaming(true);
    setMessages((m) => [
      ...m,
      { role: "user", text: message, tools: [], segments: [{ type: "text", text: message }] },
      { role: "assistant", text: "", tools: [], segments: [] },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          activeDeck: selected || undefined,
          ...(turnImages.length > 0 ? { images: toRequestImages(turnImages) } : {}),
          ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
          ...(chatIdRef.current ? { chatId: chatIdRef.current } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        // Image rejections carry a precise {error} body ("image 0: too
        // large"); a 413 from the body parser is an HTML page, so parse
        // defensively and fall back to the status.
        const detail = await res
          .json()
          .then((b: { error?: string }) => (typeof b.error === "string" ? b.error : null))
          .catch(() => null);
        throw new Error(detail ?? `HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // Chat this stream belongs to. For a resumed chat it's known up front;
      // for a brand-new chat the server assigns it mid-stream via the
      // "chat" event below. Used to drop late events (e.g. the chip
      // post-pass's segments-update, which can arrive after the user has
      // already switched/started another chat) that would otherwise
      // clobber the wrong chat's last assistant message.
      let owningChatId: string | null = chatIdRef.current;

      const handleEvent = (ev: ChatEvent) => {
        // Drop late events from a prior chat's still-draining stream: once
        // the user has switched/started another chat, chatIdRef.current no
        // longer matches the chat this stream belongs to. The "chat" event
        // itself is exempt (it's what establishes owningChatId for a
        // brand-new chat — both are null until then, so null===null passes
        // and the very next event to arrive is always "chat" first).
        if (ev.type !== "chat" && chatIdRef.current !== owningChatId) return;
        if (ev.type === "chat") {
          owningChatId = ev.chatId;
          chatIdRef.current = ev.chatId;
          setChatId(ev.chatId);
          localStorage.setItem(LAST_CHAT_KEY, ev.chatId);
        } else if (ev.type === "text-delta") {
          updateLastAssistant((m) => {
            const segments = [...m.segments];
            const last = segments[segments.length - 1];
            if (last && last.type === "text") {
              segments[segments.length - 1] = { ...last, text: last.text + ev.text };
            } else {
              segments.push({ type: "text", text: ev.text });
            }
            return { ...m, text: m.text + ev.text, segments };
          });
        } else if (ev.type === "tool-use") {
          updateLastAssistant((m) => ({
            ...m,
            tools: [...m.tools, { name: ev.name, input: ev.input }],
            segments: [...m.segments, { type: "tool", name: ev.name, input: ev.input }],
          }));
        } else if (ev.type === "tool-result") {
          updateLastAssistant((m) => {
            const segments = [...m.segments];
            const seg = segments[ev.toolIndex];
            if (seg && seg.type === "tool") {
              segments[ev.toolIndex] = { ...seg, result: ev.result };
            }
            return { ...m, segments };
          });
        } else if (ev.type === "done") {
          if (ev.sessionId) sessionIdRef.current = ev.sessionId;
          if (ev.error) setError(ev.error);
          else if (ev.isError && ev.result) setError(String(ev.result));
          if (ev.interrupted) updateLastAssistant((m) => ({ ...m, interrupted: true }));
        } else if (ev.type === "segments-update") {
          // Late event from the server's post-stream chip pass; the
          // top-of-function gate above already dropped it if stale.
          updateLastAssistant((m) => ({
            ...m,
            segments: ev.segments,
            text: ev.segments.filter((s) => s.type === "text").map((s) => (s as { text: string }).text).join(""),
          }));
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        // SSE frames are separated by blank lines
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          for (const line of frame.split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              handleEvent(JSON.parse(line.slice(6)) as ChatEvent);
            } catch {
              /* skip malformed frame */
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStreaming(false);
      // drop trailing empty assistant bubble if nothing arrived
      setMessages((msgs) => {
        const last = msgs[msgs.length - 1];
        if (last?.role === "assistant" && !last.text && last.tools.length === 0) {
          return msgs.slice(0, -1);
        }
        return msgs;
      });
      void refreshChats();
      // Refocus the textarea now that streaming has ended. Deferred a tick
      // so the `disabled` attribute (cleared by setStreaming(false) above)
      // has actually been removed from the DOM before we try to focus it.
      setTimeout(() => textareaRef.current?.focus(), 0);
    }
  }, [input, streaming, updateLastAssistant, selected, refreshChats, pendingImages, clearPendingImages]);

  // Cards-pane search: no card-search endpoint exists, so hand the query to the chat agent.
  const searchCards = () => {
    const el = cardsSearchRef.current;
    const q = el?.value.trim();
    if (!el || !q || streaming) return;
    setTab("chat");
    el.value = "";
    void send(`Search Scryfall for: ${q}`);
  };

  const retry = useCallback(() => {
    const last = lastUserMessageRef.current;
    if (!last || streaming) return;
    setError(null);
    void send(last);
  }, [send, streaming]);

  const stop = useCallback(() => {
    const id = chatIdRef.current;
    if (!id) return;
    void fetch(`/api/chats/${encodeURIComponent(id)}/stop`, { method: "POST" }).catch(() => void 0);
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  // Event delegation on the message container: hover a tool chip -> result
  // popover; hover a card-ref/card-embed span -> card image popover (fetched
  // via /api/card-image, cached client-side). Avoids per-element React
  // handlers for content that's injected via dangerouslySetInnerHTML.
  const resolveCardImage = useCallback((name: string): Promise<string | null> => {
    const cache = cardImageCache.current;
    if (cache.has(name)) return Promise.resolve(cache.get(name) ?? null);
    return fetch(`/api/card-image?name=${encodeURIComponent(name)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { image?: string } | null) => {
        const url = body?.image ?? null;
        cache.set(name, url);
        return url;
      })
      .catch(() => {
        cache.set(name, null);
        return null;
      });
  }, []);

  // Batch-resolve a set of names via /api/card-images, filling groupImageCache
  // and returning a {name: url|null} map for exactly the requested names.
  const resolveCardImages = useCallback((names: string[]): Promise<Record<string, string | null>> => {
    const cache = groupImageCache.current;
    const missing = names.filter((n) => !cache.has(n));
    const fetchMissing = missing.length
      ? fetch(`/api/card-images?names=${encodeURIComponent(missing.join(";"))}`)
          .then((r) => (r.ok ? r.json() : {}))
          .then((body: Record<string, string | null>) => {
            for (const n of missing) cache.set(n, body[n] ?? null);
          })
          .catch(() => {
            for (const n of missing) cache.set(n, null);
          })
      : Promise.resolve();
    return fetchMissing.then(() => {
      const out: Record<string, string | null> = {};
      for (const n of names) out[n] = cache.get(n) ?? null;
      return out;
    });
  }, []);

  const openGroupPopover = useCallback(
    (groupEl: HTMLElement, x: number, y: number) => {
      const label = groupEl.getAttribute("data-group-label") ?? "";
      const namesRaw = groupEl.getAttribute("data-group-names") ?? "";
      const names = namesRaw.split(";").filter(Boolean);
      setGroupPopover({ x, y, label, names, images: {}, loading: true });
      void resolveCardImages(names).then((images) => {
        setGroupPopover((p) => (p && p.label === label ? { ...p, images, loading: false } : p));
      });
    },
    [resolveCardImages]
  );

  const cancelGroupClose = useCallback(() => {
    if (groupCloseTimer.current) {
      clearTimeout(groupCloseTimer.current);
      groupCloseTimer.current = null;
    }
  }, []);
  const scheduleGroupClose = useCallback(() => {
    cancelGroupClose();
    groupCloseTimer.current = setTimeout(() => setGroupPopover(null), 180);
  }, [cancelGroupClose]);

  useEffect(() => () => cancelGroupClose(), [cancelGroupClose]);

  // Global Escape: peel ONE layer per press, topmost-first, matching
  // DeckPanel's pattern — check the highest-priority open layer and `return`
  // immediately after closing it, so a press never closes more than one
  // layer at once. Order: any open popover group first, then
  // confirmingDeleteChat, then renamingChat. Group-rename input in DeckPanel
  // and this panel's own rename input handle Escape themselves
  // (stopPropagation not required since each closes its own state here too,
  // idempotently).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (toolPopover) {
        setToolPopover(null);
        return;
      }
      if (cardPopover) {
        setCardPopover(null);
        return;
      }
      if (groupPopover) {
        cancelGroupClose();
        setGroupPopover(null);
        return;
      }
      if (confirmingDeleteChat) {
        setConfirmingDeleteChat(false);
        return;
      }
      if (renamingChat) {
        cancelRenameChat();
        return;
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [toolPopover, cardPopover, groupPopover, confirmingDeleteChat, renamingChat, cancelGroupClose, cancelRenameChat]);

  const onScrollMouseOver = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;

      const chip = target.closest<HTMLElement>(".sc-chip-tool");
      if (chip) {
        const resultText = chip.getAttribute("data-result");
        if (resultText) {
          setToolPopover({ x: e.clientX, y: e.clientY, text: prettyResult(resultText) });
        }
        return;
      }

      const groupEl = target.closest<HTMLElement>(".card-group");
      if (groupEl) {
        cancelGroupClose();
        const rect = groupEl.getBoundingClientRect();
        openGroupPopover(groupEl, rect.left, rect.bottom + 4);
        return;
      }

      // Skip .card-embed-img: it already renders its thumbnail inline
      // (see the auto-load effect below) — hovering it shows the same
      // image full-size, which reuses the popover for consistency.
      const cardEl = target.closest<HTMLElement>(".card-ref, .card-embed-img, .card-embed, .chipname[data-card-name]");
      if (cardEl) {
        const name = cardEl.getAttribute("data-card-name");
        if (!name) return;
        const cached = cardImageCache.current.get(name);
        if (cached !== undefined) {
          if (cached) setCardPopover({ x: e.clientX, y: e.clientY, url: cached, name });
          return;
        }
        setCardPopover({ x: e.clientX, y: e.clientY, url: null, name });
        void resolveCardImage(name).then((url) => {
          setCardPopover((p) => (p && p.name === name ? { ...p, url } : p));
        });
      }
    },
    [resolveCardImage, openGroupPopover, cancelGroupClose]
  );

  // Embedded card images (![[Name]]) render as an <img data-card-name> with
  // no src; once the message container's HTML is (re)painted, resolve each
  // one's thumbnail once via the same cache/endpoint as hover previews.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const imgs = el.querySelectorAll<HTMLImageElement>(".card-embed-img:not([src])");
    imgs.forEach((img) => {
      const name = img.getAttribute("data-card-name");
      if (!name) return;
      void resolveCardImage(name).then((url) => {
        if (url) img.src = url;
        else img.closest(".card-embed")?.classList.add("card-embed-missing");
      });
    });
  }, [messages, resolveCardImage]);

  const onScrollMouseMove = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest(".sc-chip-tool")) {
      setToolPopover((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p));
    } else if (target.closest(".card-ref, .card-embed-img, .card-embed")) {
      setCardPopover((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p));
    }
  }, []);

  const onScrollMouseOut = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const related = e.relatedTarget as HTMLElement | null;
    if (target.closest(".sc-chip-tool") && !related?.closest(".sc-chip-tool")) {
      setToolPopover(null);
    }
    if (
      target.closest(".card-ref, .card-embed-img, .card-embed") &&
      !related?.closest(".card-ref, .card-embed-img, .card-embed")
    ) {
      setCardPopover(null);
    }
    if (target.closest(".card-group") && !related?.closest(".card-group, .card-group-popover")) {
      scheduleGroupClose();
    }
  }, [scheduleGroupClose]);

  const armCardUndo = useCallback((deck: string, name: string, tags: string[], count: number) => {
    if (cardUndoTimerRef.current) clearTimeout(cardUndoTimerRef.current);
    setCardUndo({ deck, name, tags, count });
    cardUndoTimerRef.current = setTimeout(() => setCardUndo(null), 4000);
  }, []);

  const undoCardRemove = useCallback(() => {
    if (!cardUndo) return;
    if (cardUndoTimerRef.current) clearTimeout(cardUndoTimerRef.current);
    const { deck, name, tags, count } = cardUndo;
    setCardUndo(null);
    void fetch(`/api/decks/${encodeURIComponent(deck)}/cards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ cards: [{ name, tags, count }] }),
    }).catch(() => void 0);
    // Deck panel reloads via its own deck-events watch.
  }, [cardUndo]);

  useEffect(() => {
    return () => {
      if (cardUndoTimerRef.current) clearTimeout(cardUndoTimerRef.current);
    };
  }, []);

  // Click-to-toggle: clicking a card-ref, card-embed, or gallery card toggles
  // its membership in the selected deck. Dismisses hover popovers so a click
  // doesn't leave a stuck preview. No deck selected / server rejection ->
  // transient hint chip near the click point. Removing a card arms a 4s
  // "Removed <name> — Undo" chip; tags are captured via a cheap GET of the
  // deck (the DELETE response doesn't echo them back) before the DELETE.
  const toggleDeckCard = useCallback(
    (name: string, x: number, y: number) => {
      const deck = selectedRef.current;
      if (!deck) {
        showHint(x, y, "no deck selected");
        return;
      }
      const inDeck = deckCardNamesRef.current.has(name.toLowerCase());
      if (inDeck) {
        void fetch(`/api/decks/${encodeURIComponent(deck)}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((body: { deck?: { cards: { name: string; tags?: string[]; count?: number }[] } } | null) => {
            const existing = body?.deck?.cards.find(
              (c) => c.name.toLowerCase() === name.toLowerCase()
            );
            const tags = existing?.tags ?? [];
            const count = existing?.count ?? 1;
            return fetch(`/api/decks/${encodeURIComponent(deck)}/cards`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ cards: [name] }),
            }).then(async (r) => {
              const respBody = await r.json().catch(() => ({}));
              if (!r.ok) throw new Error(respBody.error ?? `HTTP ${r.status}`);
              armCardUndo(deck, existing?.name ?? name, tags, count);
            });
          })
          .catch((err: Error) => showHint(x, y, err.message));
        return;
      }
      void fetch(`/api/decks/${encodeURIComponent(deck)}/cards`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cards: [{ name }] }),
      })
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) {
            throw new Error(body.error ?? `HTTP ${r.status}`);
          }
          if (Array.isArray(body.rejected) && body.rejected.length > 0) {
            showHint(x, y, body.rejected[0].reason ?? "rejected");
          }
          // Deck panel reloads via its own deck-events watch; badges refresh
          // from the deckCardNames prop once that reload lands.
        })
        .catch((err: Error) => showHint(x, y, err.message));
    },
    [showHint, armCardUndo]
  );

  const onScrollClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;

      const addBtn = target.closest<HTMLElement>("[data-add-card]");
      if (addBtn) {
        const name = addBtn.getAttribute("data-add-card");
        if (name) toggleDeckCard(name, e.clientX, e.clientY);
        return;
      }

      const groupEl = target.closest<HTMLElement>(".card-group");
      if (groupEl) {
        // Click (re)opens the gallery popover at this chip's position.
        cancelGroupClose();
        openGroupPopover(groupEl, e.clientX, e.clientY);
        return;
      }

      const galleryCard = target.closest<HTMLElement>(".card-gallery-item");
      if (galleryCard) {
        const name = galleryCard.getAttribute("data-card-name");
        if (name) toggleDeckCard(name, e.clientX, e.clientY);
        cancelGroupClose();
        setGroupPopover(null);
        return;
      }

      const cardEl = target.closest<HTMLElement>(".card-ref, .card-embed-img, .card-embed");
      if (cardEl) {
        const name = cardEl.getAttribute("data-card-name");
        setCardPopover(null);
        if (name) toggleDeckCard(name, e.clientX, e.clientY);
      }
    },
    [toggleDeckCard, openGroupPopover, cancelGroupClose]
  );

  // In-deck badges: after every render of message content (or when the
  // active deck's card set or the indicator pref changes), walk card
  // ref/embed/gallery elements and toggle a small checkmark badge based on
  // membership in deckCardNames. Runs as a DOM pass (not React state) since
  // the content is injected via dangerouslySetInnerHTML.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const cardEls = el.querySelectorAll<HTMLElement>(".card-ref, .card-embed, .card-gallery-item");
    cardEls.forEach((cardEl) => {
      const name = cardEl.getAttribute("data-card-name");
      let badge = cardEl.querySelector<HTMLElement>(".in-deck-badge");
      const inDeck = showInDeck && !!name && deckCardNames.has(name.toLowerCase());
      if (inDeck && !badge) {
        badge = document.createElement("span");
        badge.className = "in-deck-badge";
        badge.textContent = "✓";
        cardEl.appendChild(badge);
      } else if (!inDeck && badge) {
        badge.remove();
      }
    });
  }, [messages, deckCardNames, showInDeck, groupPopover]);

  useEffect(() => {
    if (!selected) {
      setEdits([]);
      return;
    }
    let live = true;
    fetch(`/api/decks/${encodeURIComponent(selected)}/history`)
      .then((r) => (r.ok ? r.json() : { entries: [] }))
      .then((d: { entries?: { at: string; action: string }[] }) => live && setEdits(d.entries ?? []))
      .catch(() => live && setEdits([]));
    const san = (v: string) => v.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    const es = new EventSource("/api/deck-events");
    es.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data) as { type?: string; deck?: string; entry?: { at: string; action: string } };
        if (m.type === "history" && m.entry && m.deck && san(m.deck) === san(selected)) {
          setEdits((prev) => [m.entry!, ...prev]);
        }
      } catch {
        /* ignore malformed events */
      }
    };
    return () => {
      live = false;
      es.close();
    };
  }, [selected]);

  useEffect(() => {
    if (!tipsOpen) return;
    const down = (e: MouseEvent) => {
      if (!tipsRef.current?.contains(e.target as Node)) setTipsOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setTipsOpen(false);
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [tipsOpen]);

  const historyList = historyScope === "deck" && selected ? deckChats : chats;
  const pane = (name: typeof tab) => `chatpane${tab === name ? " on" : ""}`;

  return (
    <aside className="chat" id="chatcol">
      <div className="tabs" id="top-bar">
        <button type="button" className={`tab${tab === "chat" ? " active" : ""}`} id="tab-chat" onClick={() => setTab("chat")}>
          Chat
        </button>
        <button type="button" className={`tab${tab === "cards" ? " active" : ""}`} id="tab-cards" onClick={() => setTab("cards")}>
          Cards
        </button>
        <button type="button" className={`tab${tab === "history" ? " active" : ""}`} id="tab-history" onClick={() => setTab("history")}>
          History
        </button>
        <button
          type="button"
          className="tab tab-gear settings-drawer-toggle"
          ref={settingsTriggerRef}
          onClick={onOpenSettings}
          aria-label="Open settings"
          title="Settings"
        >
          ⚙
        </button>
      </div>
      <SettingsDrawer
        open={settingsOpen}
        onClose={onCloseSettings}
        config={config}
        onConfigChange={onConfigChange}
        triggerRef={settingsTriggerRef}
        showInDeck={showInDeck}
        onShowInDeckChange={setShowInDeck}
      />
      <div className="chatpanes">
        <div className={pane("chat")} id="pane-chat">
          <div
            id="chat-log"
            className="msgs"
            ref={scrollRef}
            onScroll={onChatScroll}
            onMouseOver={onScrollMouseOver}
            onMouseMove={onScrollMouseMove}
            onMouseOut={onScrollMouseOut}
            onClick={onScrollClick}
          >
            {chatError && (
              <div className="sc-chip sc-chip-error sc-chip-dismissible chat-header-error">
                {chatError}
                <button
                  type="button"
                  className="sc-chip-dismiss"
                  onClick={() => setChatError(null)}
                  aria-label="Dismiss error"
                >
                  ×
                </button>
              </div>
            )}
            {(chatsRefreshFailed || deckChatsRefreshFailed) && (
              <div className="sc-chip sc-chip-muted chat-header-error">couldn't refresh chats</div>
            )}
            {!chatsRefreshFailed && chats.length === 0 && (
              <div className="sc-chip sc-chip-muted chat-header-error">no chats yet — start one below</div>
            )}
            {loadingChat && (
              <div className="chat-skeleton" aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <div className={`skeleton-msg${i % 2 === 0 ? " skeleton-msg-user" : ""}`} key={i}>
                    <div className="skeleton-block skeleton-shimmer" style={{ height: 16 }} />
                  </div>
                ))}
              </div>
            )}
            {!loadingChat && messages.length === 0 && (
              <div className="hint">
                <span>✦</span>
                <span>Discover cards for your deck — ask for a function, not a name.</span>
              </div>
            )}
            {!loadingChat &&
              messages.map((m, i) =>
                m.role === "user" ? (
                  <div className="umsg" key={i}>{m.text}</div>
                ) : (
                  <Fragment key={i}>
                    <AssistantBody msg={m} deckCardNames={deckCardNames} showInDeck={showInDeck} deck={selected} vote={feedback[String(i)] ?? 0} onVote={(v) => vote(i, v)} />
                  </Fragment>
                )
              )}
            {streaming && <div className="sc-chip sc-chip-streaming">thinking…</div>}
            {error && (
              <div className="sc-chip sc-chip-error sc-chip-dismissible">
                error: {error}
                <button type="button" className="sc-chip-retry" onClick={retry} disabled={streaming}>
                  Retry
                </button>
                <button
                  type="button"
                  className="sc-chip-dismiss"
                  onClick={() => setError(null)}
                  aria-label="Dismiss error"
                >
                  ×
                </button>
              </div>
            )}
            {toolPopover && (
              <pre className="tool-result-popover" style={{ left: toolPopover.x + 12, top: toolPopover.y + 12 }}>
                {toolPopover.text}
              </pre>
            )}
            {cardPopover && cardPopover.url && (
              <img
                className="card-preview"
                src={cardPopover.url}
                alt={cardPopover.name}
                style={{
                  left: Math.min(cardPopover.x + 16, window.innerWidth - 260),
                  top: Math.max(8, Math.min(cardPopover.y - 170, window.innerHeight - 350)),
                }}
              />
            )}
            {groupPopover && (
              <div
                className="card-group-popover"
                style={{
                  left: Math.min(groupPopover.x, window.innerWidth - 340),
                  top: Math.min(groupPopover.y, window.innerHeight - 260),
                }}
                onMouseEnter={cancelGroupClose}
                onMouseLeave={scheduleGroupClose}
              >
                <div className="card-group-popover-label">{groupPopover.label}</div>
                <div className="card-gallery">
                  {groupPopover.names.map((name) => {
                    const url = groupPopover.images[name];
                    const inDeck = showInDeck && deckCardNames.has(name.toLowerCase());
                    return (
                      <div className="card-gallery-item" data-card-name={name} key={name}>
                        {url ? (
                          <img className="card-gallery-img" src={url} alt={name} />
                        ) : groupPopover.loading ? (
                          <div className="card-gallery-img card-gallery-loading" />
                        ) : (
                          <div className="card-gallery-img card-gallery-missing" />
                        )}
                        {inDeck && <span className="in-deck-badge">✓</span>}
                        <div className="card-gallery-caption">{name}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {hint && (
              <div className="sc-chip sc-chip-hint" style={{ left: hint.x + 8, top: hint.y + 8 }}>
                {hint.text}
              </div>
            )}
            {cardUndo && (
              <div className="sc-chip sc-chip-hint-inline chat-card-undo">
                Removed {cardUndo.name} from {cardUndo.deck}
                <button type="button" className="sc-chip-retry" onClick={undoCardRemove}>
                  Undo
                </button>
              </div>
            )}
          </div>
        </div>

        <div className={pane("cards")} id="pane-cards">
          <div className="chatpane-body">
            <div className="hint">
              <span>✦</span>
              <span>Search every card by name, type or rules text.</span>
            </div>
            <div className="inputbox">
              <input
                ref={cardsSearchRef}
                className="cards-search-input"
                placeholder="Search cards…"
                aria-label="Search cards"
                onKeyDown={(e) => {
                  if (e.key === "Enter") searchCards();
                }}
              />
              <div className="cfoot">
                <span className="meta">Scryfall syntax</span>
                <button type="button" className="send" onClick={searchCards}>
                  Search
                </button>
              </div>
            </div>
            <OtherDecks
              deck={selected}
              onSelectDeck={(n) => onSelectDeck?.(n)}
              onOpenPrecon={(f) => onOpenBrowse?.({ tab: "precons", precon: f })}
            />
          </div>
        </div>

        <div className={pane("history")} id="pane-history">
          <div className="chatpane-body">
            <div className="history-bar">
              <select
                className="chat-select"
                value={histView}
                onChange={(e) => setHistView(e.target.value as "edits" | "chats")}
                aria-label="History view"
              >
                <option value="edits">Edits</option>
                <option value="chats">Chats</option>
              </select>
            </div>
            {histView === "edits" && (
              <div id="edit-history">
                {edits.length === 0 ? (
                  <div className="empty">
                    <b>No edit history yet</b>
                    Cards you add, cut, or move between mainboard and sideboard will appear here.
                  </div>
                ) : (
                  edits.map((en, i) => (
                    <div className="histitem" key={`${en.at}-${i}`}>
                      <span className="histtitle">{en.action}</span>
                      <span className="meta">{en.at}</span>
                    </div>
                  ))
                )}
              </div>
            )}
            {histView === "chats" && (<>
            <div className="history-bar">
              <select
                className="chat-select"
                value={historyScope}
                onChange={(e) => setHistoryScope(e.target.value as "all" | "deck")}
                aria-label="Chat scope"
              >
                <option value="all">All chats</option>
                <option value="deck" disabled={!selected}>
                  {selected ? `About ${selected}` : "About a deck (none selected)"}
                </option>
              </select>
              <button
                type="button"
                className="mini"
                onClick={() => {
                  startNewChat();
                  setTab("chat");
                }}
              >
                + New Chat
              </button>
            </div>
            {historyList.length === 0 && <div className="hint"><span>No chats here yet.</span></div>}
            {historyList.map((c) => (
              <div className={`histitem${c.id === chatId ? " active" : ""}`} key={c.id}>
                <button
                  type="button"
                  className="histtitle"
                  onClick={() => {
                    void loadChat(c.id);
                    setTab("chat");
                  }}
                >
                  {c.title || "(untitled)"}
                </button>
                {c.id === chatId && (
                  <span className="histacts">
                    {!renamingChat && (
                      <button type="button" className="mini" ref={renameTriggerRef} onClick={openRenameChat}>
                        Rename
                      </button>
                    )}
                    {renamingChat && (
                      <span
                        className="inline-confirm"
                        onKeyDown={(e) => {
                          if (e.key === "Escape") cancelRenameChat();
                        }}
                      >
                        <input
                          className="text-input chat-rename-input"
                          value={renameChatValue}
                          onChange={(e) => setRenameChatValue(e.target.value)}
                          disabled={renameChatBusy}
                          autoFocus
                          aria-label="Rename chat"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") saveRenameChat();
                            if (e.key === "Escape") cancelRenameChat();
                          }}
                        />
                        <button type="button" className="mini" onClick={saveRenameChat} disabled={renameChatBusy}>
                          Save
                        </button>
                        <button type="button" className="mini" onClick={cancelRenameChat} disabled={renameChatBusy}>
                          Cancel
                        </button>
                      </span>
                    )}
                    {!confirmingDeleteChat && (
                      <button type="button" className="mini" onClick={() => setConfirmingDeleteChat(true)}>
                        Delete
                      </button>
                    )}
                    {confirmingDeleteChat && (
                      <span
                        className="inline-confirm"
                        onKeyDown={(e) => {
                          if (e.key === "Escape") setConfirmingDeleteChat(false);
                        }}
                      >
                        <span className="inline-confirm-text">Delete?</span>
                        <button type="button" className="mini" onClick={deleteChat} autoFocus>
                          Yes
                        </button>
                        <button type="button" className="mini" onClick={() => setConfirmingDeleteChat(false)}>
                          No
                        </button>
                      </span>
                    )}
                  </span>
                )}
              </div>
            ))}
            </>)}
          </div>
        </div>
      </div>

      <div className="composer" id="composer">
        {pendingImages.length > 0 && (
          <div className="attach-strip">
            {pendingImages.map((img, i) => (
              <span className="attach-thumb" key={img.previewUrl}>
                <img src={img.previewUrl} alt={img.name} />
                <button
                  type="button"
                  className="attach-remove"
                  title={`remove ${img.name}`}
                  onClick={() => removePendingImage(i)}
                >
                  &times;
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="inputbox">
          <textarea
            ref={textareaRef}
            value={input}
            placeholder={streaming ? "waiting for response…" : "Ask for a function, a cut, a cheaper swap…"}
            disabled={streaming}
            rows={2}
            onFocus={() => setTab("chat")}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="cfoot">
            <span className="cfoot-left">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                multiple
                hidden
                onChange={(e) => void onFilesPicked(e.target.files)}
              />
              <button
                id="attach-btn"
                type="button"
                className="mini"
                title="attach an image"
                disabled={streaming || pendingImages.length >= ATTACH_MAX_COUNT}
                onClick={() => fileInputRef.current?.click()}
              >
                &#128247;
              </button>
              {/*
                The mockup draws Present inside #slide-strip, but a trigger cannot
                live there: SlideStrip only exists once deck_present has already
                returned, so a button in it is reachable only after the thing it
                starts. It goes in the composer instead, where the active deck is
                already in scope -- and is disabled without one, since deck_present
                takes a required deck_name.
              */}
              <button
                id="present-btn"
                type="button"
                className="mini"
                title={selected ? `present ${selected}` : "select a deck to present"}
                disabled={streaming || !selected}
                onClick={() => void send(PRESENT_PROMPT)}
              >
                &#128247;&#8288;Present
              </button>
              <span ref={tipsRef} style={{ position: "relative" }}>
                <button type="button" className="mini" aria-expanded={tipsOpen} onClick={() => setTipsOpen((o) => !o)}>
                  Tips
                </button>
                {tipsOpen && (
                  <div
                    id="tips-popover"
                    role="dialog"
                    aria-label="Prompt tips"
                    style={{
                      position: "absolute",
                      bottom: "100%",
                      left: 0,
                      zIndex: 20,
                      width: 260,
                      padding: "var(--space-3, 12px)",
                      background: "var(--bg-elevated, var(--bg-surface, #222))",
                      border: "1px solid var(--bg-border, #444)",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  >
                    <ul style={{ margin: 0, paddingLeft: 16 }}>
                      <li>[[Card]] links a card name</li>
                      <li>![[Card]] shows the card image</li>
                      <li>Playtest keys: A token, N next turn, D draw, V view, S shuffle, Z undo</li>
                      <li>Esc closes popovers and dialogs</li>
                    </ul>
                  </div>
                )}
              </span>
              <span className="meta" id="deck-chip" title="active deck">
                {selected ? `${selected}${deckCardNames.size > 0 ? ` · ${deckCardNames.size}` : ""}` : "No deck selected"}
              </span>
            </span>
            {streaming ? (
              <button type="button" className="send chat-stop" onClick={stop}>
                Stop
              </button>
            ) : (
              <button
                type="button"
                className="send"
                onClick={() => void send()}
                disabled={input.trim().length === 0}
              >
                Send
              </button>
            )}
          </div>
        </div>
      </div>
    </aside>
  );
}
