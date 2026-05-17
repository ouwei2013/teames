import { useEffect, useRef, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Loader2, MessageSquare, Send } from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import {
  api,
  streamEnterpriseAdminChat,
  streamEnterpriseLocalWebChat,
  type EnterpriseBuilderTraceItem,
  type SessionInfo,
  type SessionMessage,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type AdminChatMessage = {
  id: string;
  role: "admin" | "assistant";
  content: string;
  trace?: EnterpriseBuilderTraceItem[];
};

const CHAT_SESSION_STORAGE_PREFIX = "hermes.enterprise.chat.session.";

function formatShortTime(value?: number | null): string {
  if (!value) return "";
  return new Date(value * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function messagesFromSession(messages: SessionMessage[], sessionId: string): AdminChatMessage[] {
  return messages
    .filter((message) => (message.role === "user" || message.role === "assistant") && message.content)
    .map((message, index) => ({
      id: `${sessionId}-${index}`,
      role: message.role === "user" ? "admin" : "assistant",
      content: message.content || "",
      trace: [],
    }));
}

export default function EnterpriseAdminChatPage() {
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [chatMode, setChatMode] = useState<"workspace" | "local">("workspace");
  const [chatContextLoaded, setChatContextLoaded] = useState(false);
  const [sending, setSending] = useState(false);
  const [workingStatus, setWorkingStatus] = useState("Agent is working");
  const [error, setError] = useState<string | null>(null);
  const [chatSessions, setChatSessions] = useState<SessionInfo[]>([]);
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false);
  const [loadingChatSessionId, setLoadingChatSessionId] = useState("");
  const [recentChatsOpen, setRecentChatsOpen] = useState(false);
  const [messages, setMessages] = useState<AdminChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "I am your workspace agent. I can help with this installation, joined workspaces, and assigned business agents.",
      trace: [],
    },
  ]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    void loadChatContext();
  }, []);

  useEffect(() => {
    if (!chatContextLoaded) return;
    void loadChatSessions(chatMode, { restore: true });
  }, [chatMode, chatContextLoaded]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  function updateMessage(
    id: string,
    updater: (message: AdminChatMessage) => AdminChatMessage,
  ) {
    setMessages((current) =>
      current.map((item) => (item.id === id ? updater(item) : item)),
    );
  }

  async function loadChatContext() {
    try {
      const [local, enterprise] = await Promise.all([
        api.getEnterpriseLocalWebStatus(),
        api.getEnterpriseStatus().catch(() => ({ initialized: false })),
      ]);
      setChatMode(local.joined || !enterprise.initialized ? "local" : "workspace");
    } catch {
      setChatMode("local");
    } finally {
      setChatContextLoaded(true);
    }
  }

  function chatSessionStorageKey(mode = chatMode) {
    return `${CHAT_SESSION_STORAGE_PREFIX}${mode}`;
  }

  function rememberChatSession(mode: "workspace" | "local", id: string) {
    if (!id) return;
    window.localStorage.setItem(chatSessionStorageKey(mode), id);
  }

  function forgetChatSession(mode = chatMode) {
    window.localStorage.removeItem(chatSessionStorageKey(mode));
  }

  async function fetchChatSessionMessages(mode: "workspace" | "local", id: string) {
    return mode === "local"
      ? await api.getEnterpriseLocalWebChatMessages(id)
      : await api.getEnterpriseAdminChatMessages(id);
  }

  async function restoreChatSession(mode: "workspace" | "local", sessions: SessionInfo[]) {
    if (sessionId || sending || sessions.length === 0) return;
    const remembered = window.localStorage.getItem(chatSessionStorageKey(mode));
    const target =
      sessions.find((item) => item.id === remembered) ||
      (remembered ? undefined : sessions[0]);
    if (!target) return;

    setLoadingChatSessionId(target.id);
    try {
      const result = await fetchChatSessionMessages(mode, target.id);
      setSessionId(result.session_id);
      rememberChatSession(mode, result.session_id);
      setMessages(messagesFromSession(result.messages || [], result.session_id));
    } catch {
      forgetChatSession(mode);
    } finally {
      setLoadingChatSessionId("");
    }
  }

  async function loadChatSessions(
    mode: "workspace" | "local" = chatMode,
    options: { restore?: boolean } = {},
  ) {
    setChatHistoryLoading(true);
    try {
      const result =
        mode === "local"
          ? await api.getEnterpriseLocalWebChatSessions(30)
          : await api.getEnterpriseAdminChatSessions(30);
      const sessions = result.sessions || [];
      setChatSessions(sessions);
      if (options.restore) {
        await restoreChatSession(mode, sessions);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChatHistoryLoading(false);
    }
  }

  async function openChatSession(chatSession: SessionInfo) {
    if (loadingChatSessionId) return;
    setLoadingChatSessionId(chatSession.id);
    setError(null);
    try {
      const result = await fetchChatSessionMessages(chatMode, chatSession.id);
      setSessionId(result.session_id);
      rememberChatSession(chatMode, result.session_id);
      setMessages(messagesFromSession(result.messages || [], result.session_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingChatSessionId("");
    }
  }

  function startNewChat() {
    setSessionId("");
    forgetChatSession();
    setMessages([]);
  }

  function statusForTrace(trace: EnterpriseBuilderTraceItem): string {
    if (trace.tool === "enterprise_remote") {
      if (trace.status === "running") return "Waiting for remote workspace agent";
      if (trace.status === "success") return "Remote workspace agent replied";
      if (trace.status === "error") return "Remote workspace agent failed";
    }
    if (trace.status === "running") return trace.title;
    if (trace.status === "success" && trace.tool) return trace.title;
    return trace.title || "Agent is working";
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || sending) return;
    const adminId = `admin-${Date.now()}`;
    const assistantId = `assistant-${Date.now()}`;
    setInput("");
    setSending(true);
    setWorkingStatus(chatMode === "local" ? "Preparing local agent" : "Agent is working");
    setError(null);
    setMessages((current) => [
      ...current,
      { id: adminId, role: "admin", content: message },
      { id: assistantId, role: "assistant", content: "", trace: [] },
    ]);
    try {
      const streamChat =
        chatMode === "local" ? streamEnterpriseLocalWebChat : streamEnterpriseAdminChat;
      let pendingDelta = "";
      let deltaFlushTimer: number | null = null;
      const flushPendingDelta = () => {
        if (deltaFlushTimer !== null) {
          window.clearTimeout(deltaFlushTimer);
          deltaFlushTimer = null;
        }
        if (!pendingDelta) return;
        const chunk = pendingDelta;
        pendingDelta = "";
        updateMessage(assistantId, (item) => ({
          ...item,
          content: `${item.content}${chunk}`,
        }));
      };
      await streamChat(
        { message, session_id: sessionId || undefined },
        {
          onDelta: (delta) => {
            pendingDelta += delta;
            if (deltaFlushTimer === null) {
              deltaFlushTimer = window.setTimeout(flushPendingDelta, 80);
            }
          },
          onTrace: (trace) => {
            setWorkingStatus(statusForTrace(trace));
            updateMessage(assistantId, (item) => ({
              ...item,
              trace: [...(item.trace || []), trace],
            }));
          },
          onFinal: (result) => {
            flushPendingDelta();
            setSessionId(result.session_id);
            rememberChatSession(chatMode, result.session_id);
            void loadChatSessions(chatMode);
            updateMessage(assistantId, (item) => ({
              ...item,
              content: result.final_response || item.content || "Done.",
              trace: result.trace || item.trace || [],
            }));
          },
          onError: (detail) => {
            flushPendingDelta();
            setError(detail);
            updateMessage(assistantId, (item) => ({
              ...item,
              content: item.content || `Chat failed: ${detail}`,
            }));
          },
        },
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
      updateMessage(assistantId, (item) => ({
        ...item,
        content: item.content || `Chat failed: ${detail}`,
      }));
    } finally {
      setSending(false);
      setWorkingStatus("Agent is working");
    }
  }

  return (
    <main className="flex h-[calc(100dvh-5.5rem)] min-h-[560px] min-w-0 flex-col gap-3 overflow-hidden text-midground">
      {error && (
        <div className="shrink-0 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm normal-case text-destructive">
          {error}
        </div>
      )}

      <div
        className={cn(
          "grid min-h-0 min-w-0 flex-1 gap-4",
          recentChatsOpen
            ? "lg:grid-cols-[260px_minmax(0,1fr)]"
            : "grid-cols-1",
        )}
      >
        {recentChatsOpen && (
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card/75 p-3 shadow-sm">
              <div className="mb-3 flex items-center justify-between gap-2 px-1">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold normal-case text-midground">
                    Recent chats
                  </div>
                  <div className="mt-0.5 text-xs normal-case text-muted-foreground">
                    {chatSessions.length} saved
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  title="Collapse recent chats"
                  onClick={() => setRecentChatsOpen(false)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
              <Button type="button" variant="outline" size="sm" className="mb-3 justify-start" onClick={startNewChat}>
                New chat
              </Button>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                {!chatHistoryLoading && chatSessions.length === 0 && (
                  <div className="px-1 py-2 text-xs normal-case text-muted-foreground">
                    No chat history yet.
                  </div>
                )}
                {chatSessions.map((chatSession) => {
                  const active = sessionId === chatSession.id;
                  return (
                    <button
                      key={chatSession.id}
                      type="button"
                      onClick={() => openChatSession(chatSession)}
                      disabled={Boolean(loadingChatSessionId)}
                      className={cn(
                        "w-full rounded-md border px-2.5 py-2 text-left text-xs normal-case transition-colors",
                        active
                          ? "border-midground bg-white text-midground"
                          : "border-transparent text-muted-foreground hover:bg-background/60 hover:text-midground",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate font-medium">
                          {chatSession.title || "Chat"}
                        </span>
                        {loadingChatSessionId === chatSession.id && (
                          <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                        )}
                      </div>
                      <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                        <span className="truncate">{chatSession.preview || "No preview"}</span>
                        <span className="shrink-0">{formatShortTime(chatSession.last_active)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
          </aside>
        )}

      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card/75 shadow-sm">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-medium normal-case text-midground">
              <MessageSquare className="h-4 w-4" />
              Agent
            </div>
            <p className="mt-1 text-xs normal-case text-muted-foreground">
              {chatMode === "local"
                ? "Local agent chat. Joined workspace questions can be routed to assigned remote agents."
                : "Workspace management and connected-agent activity appears above each response."}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setRecentChatsOpen((open) => !open)}
            >
              {recentChatsOpen ? (
                <ChevronLeft className="h-3.5 w-3.5" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" />
              )}
              {recentChatsOpen ? "Hide recent" : "Recent chats"}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={startNewChat}
            >
              New chat
            </Button>
          </div>
          </div>
        </div>

        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-3">
          <div className="space-y-3">
            {messages.map((item, index) => (
              <div
                key={item.id}
                className={cn(
                  "max-w-[88%] border border-border px-3 py-2 font-courier text-sm normal-case",
                  item.role === "admin"
                    ? "ml-auto bg-foreground/10 text-midground"
                    : "bg-card/70 text-muted-foreground",
                )}
              >
                <div className="mb-1 text-[11px] uppercase tracking-normal text-muted-foreground">
                  {item.role === "admin" ? "You" : "Agent"}
                </div>
                {item.trace && item.trace.length > 0 && (
                  <AdminTraceList trace={item.trace} />
                )}
                {item.content && (
                  <div className={cn("break-words", item.trace?.length ? "mt-3" : "")}>
                    <Markdown
                      content={item.content}
                      streaming={
                        sending &&
                        item.role === "assistant" &&
                        index === messages.length - 1
                      }
                    />
                  </div>
                )}
              </div>
            ))}
            {messages.length === 0 && (
              <div className="font-courier text-xs normal-case text-muted-foreground">
                Start a new chat.
              </div>
            )}
            {sending && (
              <div className="flex items-center gap-2 font-courier text-xs normal-case text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                {workingStatus}
              </div>
            )}
          </div>
        </div>

        <form
          onSubmit={sendMessage}
          className="grid shrink-0 gap-3 border-t border-border p-3 md:grid-cols-[minmax(0,1fr)_auto]"
        >
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            rows={3}
            placeholder="Ask your agent..."
            className="w-full resize-none border border-border bg-background/40 px-3 py-2 font-courier text-sm normal-case placeholder:text-muted-foreground focus-visible:border-foreground/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30"
          />
          <div className="flex items-end">
            <Button type="submit" disabled={sending || !input.trim()}>
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send
            </Button>
          </div>
        </form>
      </section>
      </div>
    </main>
  );
}

function AdminTraceList({ trace }: { trace: EnterpriseBuilderTraceItem[] }) {
  return (
    <div className="mt-2 border-t border-border/70 pt-2">
      <div className="mb-1 font-courier text-[11px] uppercase tracking-normal text-muted-foreground">
        Activity
      </div>
      <div className="space-y-1">
        {trace.slice(-8).map((item, index) => (
          <div key={`${item.title}-${index}`} className="font-courier text-xs normal-case">
            <span className="text-midground">{item.title}</span>
            {item.detail && <span className="text-muted-foreground"> · {item.detail}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
