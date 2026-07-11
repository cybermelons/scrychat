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
  const [chatError, setChatError] = useState<string | null>(null);
  const [chatsRefreshFailed, setChatsRefreshFailed] = useState(false);
  const [deckChatsRefreshFailed, setDeckChatsRefreshFailed] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const chatIdRef = useRef<string | null>(null);
  const lastUserMessageRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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

  const send = useCallback(async (override?: string) => {
    const message = (override ?? input).trim();
    if (!message || streaming) return;
    lastUserMessageRef.current = message;
    if (override === undefined) setInput("");
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
          // Late event from the server's post-stream linkify pass; the
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
  }, [input, streaming, updateLastAssistant, selected, refreshChats]);

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
        cancelGroupClose();
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
          <option value="">{chats.length === 0 ? "New Chat (no chats yet)" : "New Chat"}</option>
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
        {chatId && !renamingChat && (
          <button
            type="button"
            className="btn btn-ghost btn-small"
            ref={renameTriggerRef}
            onClick={openRenameChat}
          >
            Rename
          </button>
        )}
        {chatId && renamingChat && (
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
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={saveRenameChat}
              disabled={renameChatBusy}
            >
              Save
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={cancelRenameChat}
              disabled={renameChatBusy}
            >
              Cancel
            </button>
          </span>
        )}
        {chatId && !confirmingDeleteChat && (
          <button
            type="button"
            className="btn btn-danger btn-small"
            onClick={() => setConfirmingDeleteChat(true)}
          >
            Delete
          </button>
        )}
        {chatId && confirmingDeleteChat && (
          <span
            className="inline-confirm"
            onKeyDown={(e) => {
              if (e.key === "Escape") setConfirmingDeleteChat(false);
            }}
          >
            <span className="inline-confirm-text">Delete?</span>
            <button type="button" className="btn btn-danger btn-small" onClick={deleteChat} autoFocus>
              Yes
            </button>
            <button
              type="button"
              className="btn btn-ghost btn-small"
              onClick={() => setConfirmingDeleteChat(false)}
            >
              No
            </button>
          </span>
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
      {chatError && (
        <div className="chip chip-error chip-dismissible chat-header-error">
          {chatError}
          <button
            type="button"
            className="chip-dismiss"
            onClick={() => setChatError(null)}
            aria-label="Dismiss error"
          >
            ×
          </button>
        </div>
      )}
      {(chatsRefreshFailed || deckChatsRefreshFailed) && (
        <div className="chip chip-muted chat-header-error">couldn't refresh chats</div>
      )}
      {!chatsRefreshFailed && chats.length === 0 && (
        <div className="chip chip-muted chat-header-error">no chats yet — start one below</div>
      )}
      <div
        className="chat-scroll"
        ref={scrollRef}
        onScroll={onChatScroll}
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
        {error && (
          <div className="chip chip-error chip-dismissible">
            error: {error}
            <button type="button" className="chip-retry" onClick={retry} disabled={streaming}>
              Retry
            </button>
            <button
              type="button"
              className="chip-dismiss"
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
          <div className="chip chip-hint" style={{ left: hint.x + 8, top: hint.y + 8 }}>
            {hint.text}
          </div>
        )}
        {cardUndo && (
          <div className="chip chip-hint-inline chat-card-undo">
            Removed {cardUndo.name} from {cardUndo.deck}
            <button type="button" className="chip-retry" onClick={undoCardRemove}>
              Undo
            </button>
          </div>
        )}
      </div>
      <div className="chat-input-row">
        {selected && <span className="chip chip-context">context: {selected}</span>}
        <textarea
          ref={textareaRef}
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
