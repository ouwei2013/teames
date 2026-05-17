import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Bot,
  Circle,
  CircleAlert,
  Loader2,
  MessageSquare,
  Send,
  Ticket,
} from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  api,
  streamEnterpriseBuilderChat,
  type EnterpriseAgent,
  type EnterpriseBuilderTraceItem,
  type EnterpriseInvite,
  type EnterpriseStatusResponse,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type BuilderMessage = {
  id: string;
  role: "admin" | "builder";
  content: string;
  trace?: EnterpriseBuilderTraceItem[];
};

type BuilderView = "chat" | "agents" | "invites";

type EnterpriseBuilderPageProps = {
  embedded?: boolean;
};

function formatDate(value?: number | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value * 1000));
}

function inviteState(invite: EnterpriseInvite): string {
  const now = Date.now() / 1000;
  if (invite.revoked_at) return "Revoked";
  if (invite.expires_at && invite.expires_at <= now) return "Expired";
  if (invite.uses >= invite.max_uses) return "Used";
  return "Active";
}

export default function EnterpriseBuilderPage({ embedded = false }: EnterpriseBuilderPageProps) {
  const [status, setStatus] = useState<EnterpriseStatusResponse | null>(null);
  const [agents, setAgents] = useState<EnterpriseAgent[]>([]);
  const [invites, setInvites] = useState<EnterpriseInvite[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<BuilderView>("chat");
  const [messages, setMessages] = useState<BuilderMessage[]>([
    {
      id: "builder-welcome",
      role: "builder",
      content:
        "Tell me what business agent you want to build. I can create the agent, prompts, knowledge, allowed native skills, enterprise skill packages with scripts, and invite links.",
    },
  ]);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, sending]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [statusResult, agentResult, inviteResult] = await Promise.all([
          api.getEnterpriseStatus(),
          api.getEnterpriseAgents(),
          api.getEnterpriseInvites(),
        ]);
        if (cancelled) return;
        setStatus(statusResult);
        setAgents(agentResult.agents || statusResult.agents || []);
        setInvites(inviteResult.invites || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateBuilderMessage(id: string, updater: (message: BuilderMessage) => BuilderMessage) {
    setMessages((current) => current.map((item) => (item.id === id ? updater(item) : item)));
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || sending) return;

    const adminId = `admin-${Date.now()}`;
    const builderId = `builder-${Date.now()}`;
    setInput("");
    setSending(true);
    setError(null);
    setMessages((current) => [
      ...current,
      { id: adminId, role: "admin", content: message },
      { id: builderId, role: "builder", content: "", trace: [] },
    ]);
    try {
      await streamEnterpriseBuilderChat(
        {
          message,
          session_id: sessionId || undefined,
        },
        {
          onDelta: (delta) => {
            updateBuilderMessage(builderId, (item) => ({
              ...item,
              content: `${item.content}${delta}`,
            }));
          },
          onTrace: (trace) => {
            updateBuilderMessage(builderId, (item) => ({
              ...item,
              trace: [...(item.trace || []), trace],
            }));
          },
          onFinal: (result) => {
            setSessionId(result.session_id);
            updateBuilderMessage(builderId, (item) => ({
              ...item,
              content: result.final_response || item.content || "Done.",
              trace: result.trace || item.trace || [],
            }));
            if (result.agents) setAgents(result.agents);
            if (result.invites) setInvites(result.invites);
          },
          onError: (detail) => {
            setError(detail);
            updateBuilderMessage(builderId, (item) => ({
              ...item,
              content: item.content || `Builder failed: ${detail}`,
            }));
          },
        },
      );
    } catch (err) {
      const messageText = err instanceof Error ? err.message : String(err);
      setError(messageText);
      updateBuilderMessage(builderId, (item) => ({
        ...item,
        content: item.content || `Builder failed: ${messageText}`,
      }));
    } finally {
      setSending(false);
    }
  }

  const activeInvites = invites.filter((invite) => inviteState(invite) === "Active");

  return (
    <main
      className={cn(
        "grid min-w-0 gap-4 overflow-hidden lg:grid-cols-[240px_minmax(0,1fr)]",
        embedded ? "h-[720px] min-h-[560px]" : "h-[calc(100dvh-5.5rem)] min-h-[560px]",
      )}
    >
      <aside className="min-h-0 overflow-y-auto rounded-lg border border-border bg-card/75 p-3 shadow-sm">
        <div className="mb-3 px-1">
          <div className="text-sm font-semibold normal-case text-midground">
            Builder
          </div>
          <div className="mt-1 truncate font-courier text-xs normal-case text-muted-foreground">
            {status?.tenant?.name || "Workspace"}
          </div>
        </div>
        <nav className="grid gap-1" aria-label="Builder modules">
          {[
            { key: "chat" as const, label: "Builder chat", icon: MessageSquare, count: "" },
            { key: "agents" as const, label: "Agents", icon: Bot, count: String(agents.length) },
            { key: "invites" as const, label: "Invites", icon: Ticket, count: String(activeInvites.length) },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setView(item.key)}
                className={cn(
                  "flex h-10 items-center justify-between gap-2 rounded-md border px-3 text-left text-xs font-medium normal-case transition-colors",
                  view === item.key
                    ? "border-midground bg-white text-midground shadow-sm"
                    : "border-transparent bg-transparent text-muted-foreground hover:text-midground",
                )}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Icon className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.count && <span className="text-muted-foreground">{item.count}</span>}
              </button>
            );
          })}
        </nav>
        {error && (
          <div className="mt-4 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 font-courier text-xs normal-case text-amber-900">
            Sync issue: {error.startsWith("500:") ? "Builder data is unavailable." : error}
          </div>
        )}
      </aside>

      <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card/75 shadow-sm">
        <div className="shrink-0 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold normal-case text-midground">
            {view === "chat" ? <MessageSquare className="h-4 w-4" /> : view === "agents" ? <Bot className="h-4 w-4" /> : <Ticket className="h-4 w-4" />}
            {view === "chat" ? "Builder chat" : view === "agents" ? "Agents" : "Invites"}
          </div>
          <p className="mt-1 font-courier text-xs normal-case text-muted-foreground">
            {view === "chat"
              ? "Create business agents, prompts, knowledge, skills, scripts, and invite links."
              : view === "agents"
                ? "Business agents created for this workspace."
                : "Recent workspace invitations."}
          </p>
        </div>

        {view === "chat" && (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {loading && (
                <div className="flex items-center gap-2 font-courier text-xs normal-case text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading builder context
                </div>
              )}
              <div className="space-y-3">
                {messages.map((item, index) => (
                  <div
                    key={item.id || `${item.role}-${index}`}
                    className={cn(
                      "max-w-[88%] border border-border px-3 py-2 font-courier text-sm normal-case",
                      item.role === "admin"
                        ? "ml-auto bg-foreground/10 text-midground"
                        : "bg-card/70 text-muted-foreground",
                    )}
                  >
                    <div className="mb-1 text-[11px] uppercase tracking-normal text-muted-foreground">
                      {item.role === "admin" ? "Admin" : "Builder"}
                    </div>
                    {item.trace && item.trace.length > 0 && (
                      <TraceList trace={item.trace} />
                    )}
                    {item.content && (
                      <div className={cn("break-words", item.trace?.length ? "mt-3" : "")}>
                        <Markdown
                          content={item.content}
                          streaming={sending && item.role === "builder" && index === messages.length - 1}
                        />
                      </div>
                    )}
                  </div>
                ))}
                {sending && (
                  <div className="flex items-center gap-2 font-courier text-xs normal-case text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Builder is working
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            <form onSubmit={sendMessage} className="grid shrink-0 gap-3 border-t border-border p-3 md:grid-cols-[minmax(0,1fr)_auto]">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                placeholder="Create a business agent for my company. It should answer customer questions, use our policy notes, create a data-fetch skill for order_history and user tables, and invite one test user..."
                rows={3}
                className="w-full resize-none border border-border bg-background/40 px-3 py-2 font-courier text-sm normal-case placeholder:text-muted-foreground focus-visible:border-foreground/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30"
              />
              <div className="flex items-end">
                <Button type="submit" disabled={sending || !input.trim()}>
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Send
                </Button>
              </div>
            </form>
          </>
        )}

        {view === "agents" && (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="grid gap-3 md:grid-cols-2">
              {agents.map((agent) => (
                <div key={agent.id} className="border border-border bg-background/40 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate font-mondwest text-sm uppercase text-midground">
                      {agent.name}
                    </div>
                    <Badge variant={agent.status === "active" ? "success" : "outline"}>
                      {agent.status}
                    </Badge>
                  </div>
                  <p className="mt-2 line-clamp-3 font-courier text-xs normal-case text-muted-foreground">
                    {agent.description || agent.task_prompt || agent.id}
                  </p>
                </div>
              ))}
              {agents.length === 0 && (
                <div className="font-courier text-xs normal-case text-muted-foreground">
                  No agents yet.
                </div>
              )}
            </div>
          </div>
        )}

        {view === "invites" && (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="grid gap-3 md:grid-cols-2">
              {invites.map((invite, index) => (
                <div key={`${invite.created_at}-${index}`} className="border border-border bg-background/40 p-3 font-courier text-xs normal-case">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-midground">{invite.email || "Any email"}</span>
                    <Badge variant={inviteState(invite) === "Active" ? "success" : "outline"}>
                      {inviteState(invite)}
                    </Badge>
                  </div>
                  <div className="mt-2 text-muted-foreground">
                    {(invite.agent_names || []).join(", ") || "Default Agent"}
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    Created {formatDate(invite.created_at)}
                  </div>
                </div>
              ))}
              {invites.length === 0 && (
                <div className="font-courier text-xs normal-case text-muted-foreground">
                  No invites yet.
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

function TraceList({ trace }: { trace: EnterpriseBuilderTraceItem[] }) {
  return (
    <div className="mt-3 border-t border-border/70 pt-2">
      <div className="mb-2 font-courier text-[11px] uppercase tracking-normal text-muted-foreground">
        Activity
      </div>
      <div className="space-y-2">
        {trace.map((item, index) => {
          const Icon =
            item.status === "success"
              ? CheckCircle2
              : item.status === "error"
                ? CircleAlert
                : Circle;
          const isWarning = item.status === "warning";
          return (
            <div key={`${item.title}-${index}`} className="flex gap-2 font-courier text-xs normal-case">
              <Icon
                className={cn(
                  "mt-0.5 h-3.5 w-3.5 shrink-0",
                  item.status === "success" && "text-success",
                  item.status === "error" && "text-destructive",
                  isWarning && "text-warning",
                  item.status !== "success" && item.status !== "error" && !isWarning && "text-muted-foreground",
                )}
              />
              <div className="min-w-0">
                <div className="text-midground">{item.title}</div>
                {item.detail && (
                  <div className="mt-0.5 break-words text-muted-foreground">{item.detail}</div>
                )}
                {item.result && (
                  <div className="mt-0.5 break-words text-muted-foreground">
                    Result: {item.result}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
