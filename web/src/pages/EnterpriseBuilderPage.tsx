import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Bot,
  Circle,
  CircleAlert,
  Loader2,
  MessageSquare,
  Package,
  Send,
  ShieldCheck,
  Ticket,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  api,
  type EnterpriseAgent,
  type EnterpriseBuilderTraceItem,
  type EnterpriseInvite,
  type EnterpriseStatusResponse,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type BuilderMessage = {
  role: "admin" | "builder";
  content: string;
  trace?: EnterpriseBuilderTraceItem[];
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

export default function EnterpriseBuilderPage() {
  const [status, setStatus] = useState<EnterpriseStatusResponse | null>(null);
  const [agents, setAgents] = useState<EnterpriseAgent[]>([]);
  const [invites, setInvites] = useState<EnterpriseInvite[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [messages, setMessages] = useState<BuilderMessage[]>([
    {
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

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || sending) return;

    setInput("");
    setSending(true);
    setError(null);
    setMessages((current) => [...current, { role: "admin", content: message }]);
    try {
      const result = await api.enterpriseBuilderChat({
        message,
        session_id: sessionId || undefined,
      });
      setSessionId(result.session_id);
      setMessages((current) => [
        ...current,
        {
          role: "builder",
          content: result.final_response || "Done.",
          trace: result.trace || [],
        },
      ]);
      if (result.agents) setAgents(result.agents);
      if (result.invites) setInvites(result.invites);
    } catch (err) {
      const messageText = err instanceof Error ? err.message : String(err);
      setError(messageText);
      setMessages((current) => [
        ...current,
        { role: "builder", content: `Builder failed: ${messageText}` },
      ]);
    } finally {
      setSending(false);
    }
  }

  const activeInvites = invites.filter((invite) => inviteState(invite) === "Active");

  return (
    <main className="flex h-[calc(100dvh-5.5rem)] min-h-[560px] min-w-0 flex-col gap-4 overflow-hidden">
      <section className="grid shrink-0 gap-3 md:grid-cols-4">
        <Metric icon={ShieldCheck} label="Tenant" value={status?.tenant?.name || "Enterprise"} />
        <Metric icon={Bot} label="Agents" value={String(agents.filter((agent) => agent.status === "active").length)} />
        <Metric icon={Ticket} label="Invites" value={String(activeInvites.length)} />
        <Metric icon={Package} label="Mode" value="Builder" />
      </section>

      <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="flex min-h-0 flex-col overflow-hidden">
          <CardHeader className="shrink-0">
            <CardTitle className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              Agent Builder Chat
            </CardTitle>
            <CardDescription className="normal-case">
              Native Hermes builder session with default skills and admin-only enterprise tools.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="min-h-0 flex-1 overflow-y-auto border border-border bg-background/40 p-3">
              {loading && (
                <div className="flex items-center gap-2 font-courier text-xs normal-case text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Loading builder context
                </div>
              )}
              <div className="space-y-3">
                {messages.map((item, index) => (
                  <div
                    key={`${item.role}-${index}`}
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
                    <div className="whitespace-pre-wrap break-words">{item.content}</div>
                    {item.trace && item.trace.length > 0 && (
                      <TraceList trace={item.trace} />
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

            {error && (
              <p className="font-courier text-xs normal-case text-destructive">{error}</p>
            )}

            <form onSubmit={sendMessage} className="grid shrink-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
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
          </CardContent>
        </Card>

        <aside className="min-h-0 space-y-4 overflow-y-auto">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="h-4 w-4" />
                Agents
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {agents.slice(0, 8).map((agent) => (
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
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="h-4 w-4" />
                Recent Invites
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {invites.slice(0, 6).map((invite, index) => (
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
            </CardContent>
          </Card>
        </aside>
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
          return (
            <div key={`${item.title}-${index}`} className="flex gap-2 font-courier text-xs normal-case">
              <Icon
                className={cn(
                  "mt-0.5 h-3.5 w-3.5 shrink-0",
                  item.status === "success" && "text-success",
                  item.status === "error" && "text-destructive",
                  item.status !== "success" && item.status !== "error" && "text-muted-foreground",
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

function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 border border-border bg-card/50 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-background/50">
        <Icon className="h-4 w-4 text-muted-foreground" />
      </span>
      <div className="min-w-0">
        <div className="font-courier text-xs normal-case text-muted-foreground">{label}</div>
        <div className="truncate font-mondwest text-lg uppercase text-midground">{value}</div>
      </div>
    </div>
  );
}
