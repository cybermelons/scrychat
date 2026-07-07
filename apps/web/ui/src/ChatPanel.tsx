import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatEvent, ChatFile, ChatMessage, ChatSegment, ChatSummary } from "./types";
import { renderMarkdown } from "./markdown";

const LAST_CHAT_KEY = "scrychat.lastChat";

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
              className={`chip chip-tool${seg.result === undefined ? " chip-streaming" : ""}`}
              data-result={seg.result ?? ""}
            >
              ⚙ {toolChipLabel(seg.name, seg.input)}
            </span>
          </div>
        )
      )}
    </>
  );
}

export function ChatPanel({ selected }: { selected: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);
  const [deckChats, setDeckChats] = useState<ChatSummary[]>([]);
  const [chatId, setChatId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const chatIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Hover popovers: tool-result (over a chip) and card preview (over a
  // card-ref/card-embed span). Positioned via fixed coords from the mouse
  // event; content resolved lazily (card images fetched + cached).
  const [toolPopover, setToolPopover] = useState<{ x: number; y: number; text: string } | null>(null);
  const [cardPopover, setCardPopover] = useState<{ x: number; y: number; url: string | null; name: string } | null>(null);
  const cardImageCache = useRef(new Map<string, string | null>());

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
      .catch(() => void 0);
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

      const handleEvent = (ev: ChatEvent) => {
        if (ev.type === "chat") {
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
    [resolveCardImage]
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
  }, []);

  return (
    <main className="chat-panel">
      <div className="chat-panel-header">
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
      </div>
      <div
        className="chat-scroll"
        ref={scrollRef}
        onMouseOver={onScrollMouseOver}
        onMouseMove={onScrollMouseMove}
        onMouseOut={onScrollMouseOut}
      >
        {messages.length === 0 && (
          <div className="chat-empty">
            Ask about your deck — card searches, swaps, quotas, combos.
          </div>
        )}
        {messages.map((m, i) => (
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
        <button
          className="chat-send"
          onClick={() => void send()}
          disabled={streaming || input.trim().length === 0}
        >
          Send
        </button>
      </div>
    </main>
  );
}
