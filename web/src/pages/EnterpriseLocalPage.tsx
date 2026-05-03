import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Bot,
  CheckCircle2,
  Circle,
  CircleAlert,
  Clock,
  ExternalLink,
  Inbox,
  Laptop,
  Loader2,
  Package,
  Pause,
  Play,
  Plus,
  PlugZap,
  Send,
  Server,
  Trash2,
  Wrench,
} from "lucide-react";
import { Typography } from "@nous-research/ui";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  api,
  streamEnterpriseLocalWebChat,
  type CronJob,
  type EnterpriseBuilderTraceItem,
  type EnterpriseLocalRequest,
  type EnterpriseLocalWebStatus,
  type SkillInfo,
  type ToolsetInfo,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type LocalMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: EnterpriseBuilderTraceItem[];
};

type LocalView = "chat" | "requests" | "skills" | "tools" | "cron";

function defaultRemoteServer(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("server") || "http://127.0.0.1:9121";
}

function formatLocalTime(value?: number | null): string {
  if (!value) return "-";
  return new Date(value * 1000).toLocaleString();
}

export default function EnterpriseLocalPage() {
  const [status, setStatus] = useState<EnterpriseLocalWebStatus | null>(null);
  const [remoteServer, setRemoteServer] = useState(defaultRemoteServer);
  const [deviceName, setDeviceName] = useState(() => {
    const hostname = window.navigator.userAgent.includes("Mac") ? "Mac" : "Local machine";
    return `Hermes ${hostname}`;
  });
  const [manualCode, setManualCode] = useState("");
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [view, setView] = useState<LocalView>("chat");
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [toolsets, setToolsets] = useState<ToolsetInfo[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [localRequests, setLocalRequests] = useState<EnterpriseLocalRequest[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [cronName, setCronName] = useState("");
  const [cronPrompt, setCronPrompt] = useState("");
  const [cronSchedule, setCronSchedule] = useState("");
  const [messages, setMessages] = useState<LocalMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content:
        "I am your local Hermes agent. Connect a remote enterprise server to use assigned business agents from this local chat.",
    },
  ]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoAnsweringRef = useRef<Set<string>>(new Set());
  const joined = Boolean(status?.joined);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const callbackError = params.get("error");
    if (callbackError) setError(callbackError);
    void loadStatus();
  }, []);

  useEffect(() => {
    if (view === "chat" || view === "requests") return;
    let cancelled = false;
    setPanelLoading(true);
    const load =
      view === "skills"
        ? api.getSkills().then((items) => {
            if (!cancelled) setSkills(items || []);
          })
        : view === "tools"
          ? api.getToolsets().then((items) => {
              if (!cancelled) setToolsets(items || []);
            })
          : api.getCronJobs().then((items) => {
              if (!cancelled) setCronJobs(items || []);
            });
    load
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setPanelLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  useEffect(() => {
    if (view !== "requests" || !joined) return;
    let cancelled = false;
    async function load() {
      try {
        const result = await api.getEnterpriseLocalWebRequests(20);
        if (!cancelled) setLocalRequests(result.requests || []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }
    void load();
    const timer = window.setInterval(load, 3000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [view, joined]);

  useEffect(() => {
    if (!joined) return;
    let cancelled = false;

    async function pollAndAnswer() {
      try {
        const result = await api.getEnterpriseLocalWebRequests(20);
        const requests = result.requests || [];
        if (!cancelled) setLocalRequests(requests);
        for (const request of requests) {
          const canAnswer =
            (request.status === "pending" || request.status === "delivered") &&
            !request.response;
          if (!canAnswer || autoAnsweringRef.current.has(request.id)) continue;
          autoAnsweringRef.current.add(request.id);
          api
            .answerEnterpriseLocalWebRequest(request.id)
            .then((answered) => {
              if (cancelled) return;
              setLocalRequests((current) =>
                current.map((item) => (item.id === request.id ? answered.request : item)),
              );
            })
            .catch((err) => {
              if (!cancelled) setError(err instanceof Error ? err.message : String(err));
            })
            .finally(() => {
              autoAnsweringRef.current.delete(request.id);
            });
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      }
    }

    void pollAndAnswer();
    const timer = window.setInterval(pollAndAnswer, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [joined]);

  async function loadStatus() {
    setLoading(true);
    try {
      const next = await api.getEnterpriseLocalWebStatus();
      setStatus(next);
      if (next.server) setRemoteServer(next.server);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function connectViaRemotePortal(event: FormEvent) {
    event.preventDefault();
    setConnecting(true);
    setError(null);
    try {
      const result = await api.createEnterpriseLocalWebConnectUrl({
        server: remoteServer.trim(),
        name: deviceName.trim() || undefined,
      });
      window.location.href = result.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setConnecting(false);
    }
  }

  async function joinWithManualCode(event: FormEvent) {
    event.preventDefault();
    const code = manualCode.trim();
    if (!code) return;
    setConnecting(true);
    setError(null);
    try {
      const next = await api.joinEnterpriseLocalWeb({
        server: remoteServer.trim(),
        code,
        name: deviceName.trim() || undefined,
      });
      setStatus(next);
      setManualCode("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }

  function updateAssistantMessage(id: string, updater: (message: LocalMessage) => LocalMessage) {
    setMessages((current) => current.map((item) => (item.id === id ? updater(item) : item)));
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || sending) return;
    const userId = `user-${Date.now()}`;
    const assistantId = `assistant-${Date.now()}`;
    setInput("");
    setSending(true);
    setError(null);
    setMessages((current) => [
      ...current,
      { id: userId, role: "user", content: message },
      { id: assistantId, role: "assistant", content: "", trace: [] },
    ]);
    try {
      await streamEnterpriseLocalWebChat(
        { message, session_id: sessionId || undefined },
        {
          onDelta: (delta) => {
            updateAssistantMessage(assistantId, (item) => ({
              ...item,
              content: `${item.content}${delta}`,
            }));
          },
          onTrace: (trace) => {
            updateAssistantMessage(assistantId, (item) => ({
              ...item,
              trace: [...(item.trace || []), trace],
            }));
          },
          onFinal: (result) => {
            setSessionId(result.session_id);
            if (result.local) setStatus(result.local);
            updateAssistantMessage(assistantId, (item) => ({
              ...item,
              content: result.final_response || item.content || "Done.",
              trace: result.trace || item.trace || [],
            }));
          },
          onError: (detail) => {
            setError(detail);
            updateAssistantMessage(assistantId, (item) => ({
              ...item,
              content: item.content || `Local agent failed: ${detail}`,
            }));
          },
        },
      );
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      setError(detail);
      updateAssistantMessage(assistantId, (item) => ({
        ...item,
        content: item.content || `Local agent failed: ${detail}`,
      }));
    } finally {
      setSending(false);
    }
  }

  async function toggleSkill(skill: SkillInfo) {
    setBusyItem(`skill:${skill.name}`);
    setError(null);
    try {
      await api.toggleSkill(skill.name, !skill.enabled);
      setSkills((current) =>
        current.map((item) =>
          item.name === skill.name ? { ...item, enabled: !skill.enabled } : item,
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyItem(null);
    }
  }

  async function refreshCronJobs() {
    const jobs = await api.getCronJobs();
    setCronJobs(jobs || []);
  }

  async function refreshLocalRequests() {
    const result = await api.getEnterpriseLocalWebRequests(20);
    setLocalRequests(result.requests || []);
  }

  async function answerLocalRequest(request: EnterpriseLocalRequest) {
    setBusyItem(`request:${request.id}`);
    setError(null);
    try {
      const result = await api.answerEnterpriseLocalWebRequest(request.id);
      setLocalRequests((current) =>
        current.map((item) => (item.id === request.id ? result.request : item)),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyItem(null);
    }
  }

  async function createCronJob(event: FormEvent) {
    event.preventDefault();
    if (!cronPrompt.trim() || !cronSchedule.trim()) return;
    setBusyItem("cron:create");
    setError(null);
    try {
      await api.createCronJob({
        name: cronName.trim() || undefined,
        prompt: cronPrompt.trim(),
        schedule: cronSchedule.trim(),
        deliver: "local",
      });
      setCronName("");
      setCronPrompt("");
      setCronSchedule("");
      await refreshCronJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyItem(null);
    }
  }

  async function updateCronJob(job: CronJob, action: "pause" | "resume" | "trigger" | "delete") {
    setBusyItem(`cron:${job.id}:${action}`);
    setError(null);
    try {
      if (action === "pause") await api.pauseCronJob(job.id);
      if (action === "resume") await api.resumeCronJob(job.id);
      if (action === "trigger") await api.triggerCronJob(job.id);
      if (action === "delete") await api.deleteCronJob(job.id);
      await refreshCronJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyItem(null);
    }
  }

  return (
    <main className="relative z-2 flex h-dvh min-h-0 w-full flex-col overflow-hidden px-4 py-4 text-midground sm:px-6 lg:px-8">
      <header className="mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-card">
            <Laptop className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <Typography className="font-bold text-[1rem] leading-none tracking-[0.08em]">
              Hermes Local Agent
            </Typography>
            <p className="mt-1 truncate font-courier text-xs normal-case text-muted-foreground">
              {joined
                ? `${status?.user?.email || status?.user?.name || "Enterprise user"} - ${status?.server}`
                : "Connect this computer to an enterprise workspace"}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={loadStatus} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
          Refresh
        </Button>
      </header>

      <section className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 gap-4 overflow-hidden py-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="min-h-0 overflow-y-auto border border-border bg-card/50 p-4">
          <div className="flex items-center gap-2 font-mondwest text-sm uppercase text-midground">
            <Server className="h-4 w-4" />
            Remote Connection
          </div>
          <form onSubmit={connectViaRemotePortal} className="mt-4 space-y-3">
            <label className="block font-courier text-xs normal-case text-muted-foreground">
              Remote server
              <Input
                value={remoteServer}
                onChange={(event) => setRemoteServer(event.target.value)}
                placeholder="http://127.0.0.1:9121"
                className="mt-1 normal-case"
              />
            </label>
            <label className="block font-courier text-xs normal-case text-muted-foreground">
              Local device name
              <Input
                value={deviceName}
                onChange={(event) => setDeviceName(event.target.value)}
                placeholder="Wei Mac"
                className="mt-1 normal-case"
              />
            </label>
            <Button type="submit" className="w-full" disabled={connecting || !remoteServer.trim()}>
              {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ExternalLink className="h-3.5 w-3.5" />}
              Connect in Browser
            </Button>
          </form>

          <form onSubmit={joinWithManualCode} className="mt-5 border-t border-border pt-4">
            <div className="mb-2 font-courier text-xs normal-case text-muted-foreground">
              Manual fallback
            </div>
            <div className="grid gap-2">
              <Input
                value={manualCode}
                onChange={(event) => setManualCode(event.target.value)}
                placeholder="Device code"
                className="normal-case"
              />
              <Button type="submit" variant="outline" disabled={connecting || !manualCode.trim()}>
                Join with Code
              </Button>
            </div>
          </form>

          {error && (
            <div className="mt-4 border border-destructive/50 bg-destructive/10 p-3 font-courier text-xs normal-case text-destructive">
              {error}
            </div>
          )}

          <div className="mt-5 space-y-3 border-t border-border pt-4 font-courier text-xs normal-case">
            <StatusLine label="Status" value={joined ? "Connected" : "Not connected"} good={joined} />
            <StatusLine label="Device" value={status?.device?.name || status?.device?.id || "-"} />
            <StatusLine label="Default agent" value={status?.agent?.name || status?.default_agent_id || "-"} />
            <StatusLine label="Config" value={status?.config_path || "-"} />
            {status?.remote_error && (
              <div className="break-words text-warning">{status.remote_error}</div>
            )}
          </div>

          <div className="mt-5 border-t border-border pt-4">
            <div className="mb-2 flex items-center gap-2 font-mondwest text-sm uppercase text-midground">
              <Bot className="h-4 w-4" />
              Assigned Agents
            </div>
            <div className="space-y-2">
              {(status?.agents || []).map((agent) => (
                <div key={agent.id} className="border border-border bg-background/40 p-2">
                  <div className="truncate font-mondwest text-sm uppercase text-midground">
                    {agent.name}
                  </div>
                  <div className="mt-1 line-clamp-2 font-courier text-xs normal-case text-muted-foreground">
                    {agent.description || agent.id}
                  </div>
                </div>
              ))}
              {joined && (status?.agents || []).length === 0 && (
                <div className="font-courier text-xs normal-case text-muted-foreground">
                  No business agents assigned.
                </div>
              )}
            </div>
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden border border-border bg-card/50">
          <div className="shrink-0 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 font-mondwest text-sm uppercase text-midground">
              <Bot className="h-4 w-4" />
              Local Workspace
            </div>
            <p className="mt-1 font-courier text-xs normal-case text-muted-foreground">
              This workspace runs against the local Hermes profile.
            </p>
            <nav className="mt-3 grid grid-cols-5 gap-2">
              {[
                { key: "chat" as const, label: "Chat", icon: Send },
                { key: "requests" as const, label: "Requests", icon: Inbox },
                { key: "skills" as const, label: "Skills", icon: Package },
                { key: "tools" as const, label: "Tools", icon: Wrench },
                { key: "cron" as const, label: "Cron", icon: Clock },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setView(item.key)}
                    className={cn(
                      "flex h-9 items-center justify-center gap-2 border px-2 font-courier text-xs normal-case transition-colors",
                      view === item.key
                        ? "border-midground bg-foreground/10 text-midground"
                        : "border-border bg-background/40 text-muted-foreground hover:text-midground",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          </div>

          {view === "chat" && (
          <>
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="space-y-3">
              {messages.map((item, index) => (
                <div
                  key={item.id}
                  className={cn(
                    "max-w-[88%] border border-border px-3 py-2 font-courier text-sm normal-case",
                    item.role === "user"
                      ? "ml-auto bg-foreground/10 text-midground"
                      : "bg-background/50 text-muted-foreground",
                  )}
                >
                  <div className="mb-1 text-[11px] uppercase tracking-normal text-muted-foreground">
                    {item.role === "user" ? "You" : "Local Agent"}
                  </div>
                  {item.trace && item.trace.length > 0 && <TraceList trace={item.trace} />}
                  {item.content && (
                    <div className={cn("break-words", item.trace?.length ? "mt-3" : "")}>
                      <Markdown
                        content={item.content}
                        streaming={sending && item.role === "assistant" && index === messages.length - 1}
                      />
                    </div>
                  )}
                </div>
              ))}
              {sending && (
                <div className="flex items-center gap-2 font-courier text-xs normal-case text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Local agent is working
                </div>
              )}
            </div>
          </div>

          <form onSubmit={sendMessage} className="grid shrink-0 gap-3 border-t border-border p-4 md:grid-cols-[minmax(0,1fr)_auto]">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask locally, or ask me to consult an assigned business agent..."
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

          {view === "requests" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-border pb-3">
                <div>
                  <div className="font-mondwest text-sm uppercase text-midground">Incoming Requests</div>
                  <p className="mt-1 font-courier text-xs normal-case text-muted-foreground">
                    Requests from the remote admin are handled by this local agent.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={refreshLocalRequests} disabled={!joined}>
                  <PlugZap className="h-3.5 w-3.5" />
                  Refresh
                </Button>
              </div>

              {!joined && (
                <div className="font-courier text-xs normal-case text-muted-foreground">
                  Connect to a remote enterprise workspace first.
                </div>
              )}
              {joined && localRequests.length === 0 && (
                <div className="font-courier text-xs normal-case text-muted-foreground">
                  No incoming local-agent requests.
                </div>
              )}
              <div className="space-y-3">
                {localRequests.map((request) => {
                  const canAnswer =
                    (request.status === "pending" || request.status === "delivered") &&
                    !request.response;
                  return (
                    <div key={request.id} className="border border-border bg-background/40 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-mondwest text-sm uppercase text-midground">
                            {request.agent_name || request.device_name || request.id}
                          </div>
                          <div className="mt-1 font-courier text-xs normal-case text-muted-foreground">
                            {request.status} · {formatLocalTime(request.created_at)}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => answerLocalRequest(request)}
                          disabled={!canAnswer || busyItem === `request:${request.id}`}
                        >
                          {busyItem === `request:${request.id}` ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Bot className="h-3.5 w-3.5" />
                          )}
                          Answer
                        </Button>
                      </div>
                      <div className="mt-3 whitespace-pre-wrap font-courier text-sm normal-case text-midground">
                        {request.request}
                      </div>
                      {request.response && (
                        <div className="mt-3 border-t border-border/70 pt-3 font-courier text-sm normal-case text-muted-foreground">
                          <Markdown content={request.response} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === "skills" && (
            <PanelFrame loading={panelLoading} empty={!panelLoading && skills.length === 0} emptyText="No local skills found.">
              {skills.map((skill) => (
                <div key={skill.name} className="border border-border bg-background/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-mondwest text-sm uppercase text-midground">
                        {skill.name}
                      </div>
                      <p className="mt-1 line-clamp-3 font-courier text-xs normal-case text-muted-foreground">
                        {skill.description || skill.category || "Local skill"}
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant={skill.enabled ? "outline" : "default"}
                      size="sm"
                      onClick={() => toggleSkill(skill)}
                      disabled={busyItem === `skill:${skill.name}`}
                    >
                      {busyItem === `skill:${skill.name}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {skill.enabled ? "Disable" : "Enable"}
                    </Button>
                  </div>
                  <div className="mt-2 font-courier text-xs normal-case text-muted-foreground">
                    {skill.category || "uncategorized"} · {skill.source || "local"}
                  </div>
                </div>
              ))}
            </PanelFrame>
          )}

          {view === "tools" && (
            <PanelFrame loading={panelLoading} empty={!panelLoading && toolsets.length === 0} emptyText="No local toolsets found.">
              {toolsets.map((toolset) => (
                <div key={toolset.name} className="border border-border bg-background/40 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate font-mondwest text-sm uppercase text-midground">
                        {toolset.label || toolset.name}
                      </div>
                      <p className="mt-1 line-clamp-3 font-courier text-xs normal-case text-muted-foreground">
                        {toolset.description || toolset.name}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 border px-2 py-1 font-courier text-xs normal-case",
                        toolset.enabled
                          ? "border-success/50 text-success"
                          : "border-border text-muted-foreground",
                      )}
                    >
                      {toolset.enabled ? "Enabled" : "Disabled"}
                    </span>
                  </div>
                  <div className="mt-2 break-words font-courier text-xs normal-case text-muted-foreground">
                    {(toolset.tools || []).slice(0, 16).join(", ") || "No tools"}
                  </div>
                </div>
              ))}
            </PanelFrame>
          )}

          {view === "cron" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <form onSubmit={createCronJob} className="grid gap-3 border-b border-border pb-4">
                <Input
                  value={cronName}
                  onChange={(event) => setCronName(event.target.value)}
                  placeholder="Job name"
                  className="normal-case"
                />
                <textarea
                  value={cronPrompt}
                  onChange={(event) => setCronPrompt(event.target.value)}
                  placeholder="What should the local agent do?"
                  rows={3}
                  className="w-full resize-none border border-border bg-background/40 px-3 py-2 font-courier text-sm normal-case placeholder:text-muted-foreground focus-visible:border-foreground/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30"
                />
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <Input
                    value={cronSchedule}
                    onChange={(event) => setCronSchedule(event.target.value)}
                    placeholder="Schedule, e.g. every day at 9am"
                    className="normal-case"
                  />
                  <Button type="submit" disabled={busyItem === "cron:create" || !cronPrompt.trim() || !cronSchedule.trim()}>
                    {busyItem === "cron:create" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Create
                  </Button>
                </div>
              </form>

              {panelLoading && <PanelLoading />}
              {!panelLoading && cronJobs.length === 0 && (
                <div className="mt-4 font-courier text-xs normal-case text-muted-foreground">
                  No local cron jobs.
                </div>
              )}
              <div className="mt-4 space-y-3">
                {cronJobs.map((job) => {
                  const isPaused = job.state === "paused";
                  return (
                    <div key={job.id} className="border border-border bg-background/40 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-mondwest text-sm uppercase text-midground">
                            {job.name || job.prompt.slice(0, 64)}
                          </div>
                          <p className="mt-1 line-clamp-2 font-courier text-xs normal-case text-muted-foreground">
                            {job.prompt}
                          </p>
                        </div>
                        <span className="shrink-0 border border-border px-2 py-1 font-courier text-xs normal-case text-muted-foreground">
                          {job.state}
                        </span>
                      </div>
                      <div className="mt-2 font-courier text-xs normal-case text-muted-foreground">
                        {job.schedule_display || job.schedule?.display || "No schedule"} · Next {job.next_run_at || "-"}
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateCronJob(job, isPaused ? "resume" : "pause")}
                          disabled={busyItem?.startsWith(`cron:${job.id}:`)}
                        >
                          {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                          {isPaused ? "Resume" : "Pause"}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateCronJob(job, "trigger")}
                          disabled={busyItem?.startsWith(`cron:${job.id}:`)}
                        >
                          <Play className="h-3.5 w-3.5" />
                          Run
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => updateCronJob(job, "delete")}
                          disabled={busyItem?.startsWith(`cron:${job.id}:`)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function PanelFrame({
  loading,
  empty,
  emptyText,
  children,
}: {
  loading: boolean;
  empty: boolean;
  emptyText: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      {loading && <PanelLoading />}
      {empty && (
        <div className="font-courier text-xs normal-case text-muted-foreground">
          {emptyText}
        </div>
      )}
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function PanelLoading() {
  return (
    <div className="flex items-center gap-2 font-courier text-xs normal-case text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      Loading
    </div>
  );
}

function StatusLine({
  label,
  value,
  good,
}: {
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("break-words text-midground", good && "text-success")}>{value}</span>
    </div>
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
