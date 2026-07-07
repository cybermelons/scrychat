import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatEvent, ChatMessage } from "./types";
import { renderMarkdown } from "./markdown";

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
  const sessionIdRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

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
        }),
      });
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const handleEvent = (ev: ChatEvent) => {
        if (ev.type === "text-delta") {
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
    }
  }, [input, streaming, updateLastAssistant, selected]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  return (
    <main className="chat-panel">
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
