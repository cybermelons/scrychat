import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatEvent, ChatFile, ChatMessage, ChatSegment, ChatSummary } from "./types";
import { renderMarkdown } from "./markdown";

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

function prettyResult(result: string): string {
  try {
    return JSON.stringify(JSON.parse(result), null, 2);
  } catch {
    return result;
  }
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

function AssistantBody({ msg }: { msg: ChatMessage }) {
  return (
    <>
      {msg.segments.map((seg, i) =>
        seg.type === "text" ? (
          <div
            className="md"
            key={i}
            dangerouslySetInnerHTML={{ __html: renderMarkdown(seg.text) }}
          />
        ) : (
          <div className="tool-chip-row" key={i}>
            <span
              className={`chip chip-tool chip-tool-${toolResultStatus(seg.result)}`}
              data-result={seg.result ?? ""}
            >
              ⚙ {toolChipLabel(seg.name, seg.input)}
            </span>
          </div>
        )
      )}
      {msg.interrupted && <span className="msg-interrupted">stopped</span>}
    </>
  );
}

export function ChatPanel({
  selected,
  deckCardNames,
  onOpenDeckDrawer,
}: {
  selected: string;
  deckCardNames: Set<string>;
  onOpenDeckDrawer?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingChat, setLoadingChat] = useState(false);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [deckChats, setDeckChats] = useState<ChatSummary[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const chatIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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

  // Transient hint/rejection chip near a click ("no deck selected", server
  // rejection reason). Auto-dismisses after a few seconds.
  const [hint, setHint] = useState<{ x: number; y: number; text: string } | null>(null);
  const hintTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showHint = useCallback((x: number, y: number, text: string) => {
    setHint({ x, y, text });
    if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
    hintTimerRef.current = setTimeout(() => setHint(null), 3000);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const refreshChats = useCallback(() => {
    return fetch("/api/chats")
      .then((r) => r.json())
      .then((list: ChatSummary[]) => {
        setChats(list);
        return list;
      })
      .catch(() => setChats([]));
  }, []);

  const loadChat = useCallback((id: string) => {
    setLoadingChat(true);
    return fetch(`/api/chats/${encodeURIComponent(id)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ChatFile>;
      })
      .then((file) => {
        chatIdRef.current = id;
        setChatId(id);
        sessionIdRef.current = null; // resume is driven server-side by the chat file now
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
      .catch(() => void 0)
      .finally(() => setLoadingChat(false));
  }, []);

  const startNewChat = useCallback(() => {
    chatIdRef.current = null;
    setChatId(null);
    sessionIdRef.current = null;
    setMessages([]);
    setError(null);
    localStorage.removeItem(LAST_CHAT_KEY);
  }, []);

  const deleteChat = useCallback(() => {
    const id = chatIdRef.current;
    if (!id) return;
    if (!window.confirm("Delete this chat? This cannot be undone.")) return;
    fetch(`/api/chats/${encodeURIComponent(id)}`, { method: "DELETE" })
      .then(() => {
        startNewChat();
        refreshChats();
      })
      .catch(() => void 0);
  }, [startNewChat, refreshChats]);

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
      .then((list: ChatSummary[]) => setDeckChats(list))
      .catch(() => setDeckChats([]));
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

  const send = useCallback(async () => {
    const message = input.trim();
    if (!message || streaming) return;
    setInput("");
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
          ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
          ...(chatIdRef.current ? { chatId: chatIdRef.current } : {}),
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      // Chat this stream belongs to. For a resumed chat it's known up front;
      // for a brand-new chat the server assigns it mid-stream via the
      // "chat" event below. Used to drop late events (e.g. the linkify
      // post-pass's segments-update, which can arrive after the user has
      // already switched/started another chat) that would otherwise
      // clobber the wrong chat's last assistant message.
      let owningChatId: string | null = chatIdRef.current;

      const handleEvent = (ev: ChatEvent) => {
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
          // Late event from the server's post-stream linkify pass. If the
          // user has since switched chats, chatIdRef.current no longer
          // matches the chat this stream belongs to — drop it rather than
          // rewriting the wrong chat's last assistant message.
          if (chatIdRef.current !== owningChatId) return;
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
    }
  }, [input, streaming, updateLastAssistant, selected, refreshChats]);

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

  const onScrollMouseOver = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;

      const chip = target.closest<HTMLElement>(".chip-tool");
      if (chip) {
        const resultText = chip.getAttribute("data-result");
        if (resultText) {
          setToolPopover({ x: e.clientX, y: e.clientY, text: prettyResult(resultText) });
        }
        return;
      }

      const groupEl = target.closest<HTMLElement>(".card-group");
      if (groupEl) {
        const rect = groupEl.getBoundingClientRect();
        openGroupPopover(groupEl, rect.left, rect.bottom + 4);
        return;
      }

      // Skip .card-embed-img: it already renders its thumbnail inline
      // (see the auto-load effect below) — hovering it shows the same
      // image full-size, which reuses the popover for consistency.
      const cardEl = target.closest<HTMLElement>(".card-ref, .card-embed-img, .card-embed");
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
    [resolveCardImage, openGroupPopover]
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
    if (target.closest(".chip-tool")) {
      setToolPopover((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p));
    } else if (target.closest(".card-ref, .card-embed-img, .card-embed")) {
      setCardPopover((p) => (p ? { ...p, x: e.clientX, y: e.clientY } : p));
    }
  }, []);

  const onScrollMouseOut = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const related = e.relatedTarget as HTMLElement | null;
    if (target.closest(".chip-tool") && !related?.closest(".chip-tool")) {
      setToolPopover(null);
    }
    if (
      target.closest(".card-ref, .card-embed-img, .card-embed") &&
      !related?.closest(".card-ref, .card-embed-img, .card-embed")
    ) {
      setCardPopover(null);
    }
    if (target.closest(".card-group") && !related?.closest(".card-group, .card-group-popover")) {
      setGroupPopover(null);
    }
  }, []);

  // Click-to-toggle: clicking a card-ref, card-embed, or gallery card toggles
  // its membership in the selected deck. Dismisses hover popovers so a click
  // doesn't leave a stuck preview. No deck selected / server rejection ->
  // transient hint chip near the click point.
  const toggleDeckCard = useCallback(
    (name: string, x: number, y: number) => {
      const deck = selectedRef.current;
      if (!deck) {
        showHint(x, y, "no deck selected");
        return;
      }
      const inDeck = deckCardNamesRef.current.has(name.toLowerCase());
      const req = inDeck
        ? fetch(`/api/decks/${encodeURIComponent(deck)}/cards`, {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cards: [name] }),
          })
        : fetch(`/api/decks/${encodeURIComponent(deck)}/cards`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ cards: [{ name }] }),
          });
      void req
        .then(async (r) => {
          const body = await r.json().catch(() => ({}));
          if (!r.ok) {
            throw new Error(body.error ?? `HTTP ${r.status}`);
          }
          if (!inDeck && Array.isArray(body.rejected) && body.rejected.length > 0) {
            showHint(x, y, body.rejected[0].reason ?? "rejected");
          }
          // Deck panel reloads via its own deck-events watch; badges refresh
          // from the deckCardNames prop once that reload lands.
        })
        .catch((err: Error) => showHint(x, y, err.message));
    },
    [showHint]
  );

  const onScrollClick = useCallback(
    (e: React.MouseEvent) => {
      const target = e.target as HTMLElement;

      const groupEl = target.closest<HTMLElement>(".card-group");
      if (groupEl) {
        // Click (re)opens the gallery popover at this chip's position.
        openGroupPopover(groupEl, e.clientX, e.clientY);
        return;
      }

      const galleryCard = target.closest<HTMLElement>(".card-gallery-item");
      if (galleryCard) {
        const name = galleryCard.getAttribute("data-card-name");
        if (name) toggleDeckCard(name, e.clientX, e.clientY);
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
    [toggleDeckCard, openGroupPopover]
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

  return (
    <main className="chat-panel">
      <div className="chat-panel-header">
        <button
          type="button"
          className="btn btn-ghost btn-small deck-drawer-toggle"
          onClick={onOpenDeckDrawer}
          aria-label="Open deck panel"
          title="Open deck panel"
        >
          ☰
        </button>
        <select
          className="chat-select"
          value={chatId ?? ""}
          onChange={(e) => (e.target.value ? void loadChat(e.target.value) : startNewChat())}
          aria-label="Select chat"
        >
          <option value="">New Chat</option>
          {selected && deckChats.length > 0 && (
            <optgroup label={`about ${selected}`}>
              {deckChats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title || "(untitled)"}
                </option>
              ))}
            </optgroup>
          )}
          <optgroup label={selected && deckChats.length > 0 ? "all chats" : "chats"}>
            {chats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title || "(untitled)"}
              </option>
            ))}
          </optgroup>
        </select>
        <button type="button" className="btn btn-ghost btn-small" onClick={startNewChat}>
          + New Chat
        </button>
        {chatId && (
          <button type="button" className="btn btn-danger btn-small" onClick={deleteChat}>
            Delete
          </button>
        )}
        <button
          type="button"
          className={`btn btn-ghost btn-small in-deck-toggle${showInDeck ? " active" : ""}`}
          onClick={() => setShowInDeck((s) => !s)}
          title="Toggle in-deck checkmarks on card references"
          aria-pressed={showInDeck}
        >
          ✓ in-deck
        </button>
      </div>
      <div
        className="chat-scroll"
        ref={scrollRef}
        onMouseOver={onScrollMouseOver}
        onMouseMove={onScrollMouseMove}
        onMouseOut={onScrollMouseOut}
        onClick={onScrollClick}
      >
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
          <div className="chat-empty">
            <div className="chat-empty-icon" aria-hidden="true">💬</div>
            <p>No messages yet.</p>
            <p className="chat-empty-hint">Ask about your deck — card searches, swaps, quotas, combos.</p>
          </div>
        )}
        {!loadingChat && messages.map((m, i) => (
          <div className={`msg msg-${m.role}`} key={i}>
            {m.role === "user" ? (
              <div className="msg-text">{m.text}</div>
            ) : (
              <AssistantBody msg={m} />
            )}
          </div>
        ))}
        {streaming && <div className="chip chip-streaming">thinking…</div>}
        {error && <div className="chip chip-error">error: {error}</div>}
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
          <div className="chip chip-hint" style={{ left: hint.x + 8, top: hint.y + 8 }}>
            {hint.text}
          </div>
        )}
      </div>
      <div className="chat-input-row">
        {selected && <span className="chip chip-context">context: {selected}</span>}
        <textarea
          className="chat-input"
          value={input}
          placeholder={streaming ? "waiting for response…" : "Message scrychat"}
          disabled={streaming}
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
        />
        {streaming ? (
          <button className="chat-stop" onClick={stop}>
            Stop
          </button>
        ) : (
          <button
            className="chat-send"
            onClick={() => void send()}
            disabled={input.trim().length === 0}
          >
            Send
          </button>
        )}
      </div>
    </main>
  );
}
