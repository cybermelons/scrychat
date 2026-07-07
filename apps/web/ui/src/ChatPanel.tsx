import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatEvent, ChatFile, ChatMessage, ChatSummary } from "./types";
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

function AssistantBody({ msg }: { msg: ChatMessage }) {
  return (
    <>
      {msg.tools.length > 0 && (
        <div className="tool-chips">
          {msg.tools.map((t, i) => (
            <span className="chip chip-tool" key={i} title={JSON.stringify(t.input)}>
              ⚙ {toolChipLabel(t.name, t.input)}
            </span>
          ))}
        </div>
      )}
      {msg.text && (
        <div
          className="md"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.text) }}
        />
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
  const [chatId, setChatId] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const chatIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
          file.messages.map((m) => ({ role: m.role, text: m.text, tools: m.tools ?? [] }))
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
      { role: "user", text: message, tools: [] },
      { role: "assistant", text: "", tools: [] },
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
          updateLastAssistant((m) => ({ ...m, text: m.text + ev.text }));
        } else if (ev.type === "tool-use") {
          updateLastAssistant((m) => ({
            ...m,
            tools: [...m.tools, { name: ev.name, input: ev.input }],
          }));
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
          {chats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title || "(untitled)"}
            </option>
          ))}
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
      <div className="chat-scroll" ref={scrollRef}>
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
