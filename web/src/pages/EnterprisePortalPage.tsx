import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Bot,
  Clock,
  Loader2,
  LogOut,
  Package,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
  Wrench,
} from "lucide-react";
import { Typography } from "@nous-research/ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  api,
  type CronJob,
  type EnterpriseAgent,
  type EnterpriseUser,
  type SkillInfo,
  type ToolsetInfo,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type PortalMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type StoredSession = {
  token: string;
  user: EnterpriseUser;
  agents: EnterpriseAgent[];
  selectedAgentId?: string;
  sessionIds?: Record<string, string>;
};

type PortalView = "chat" | "cron" | "skills" | "tools";

const STORAGE_KEY = "hermes.enterprise.portal";

function formatTime(value?: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function loadStoredSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.token || !parsed?.user) return null;
    const agents = Array.isArray(parsed.agents) ? parsed.agents : [];
    const sessionIds =
      parsed.sessionIds && typeof parsed.sessionIds === "object"
        ? parsed.sessionIds
        : {};
    return {
      token: parsed.token,
      user: parsed.user,
      agents,
      selectedAgentId:
        parsed.selectedAgentId || (agents[0] ? agents[0].id : undefined),
      sessionIds,
    };
  } catch {
    return null;
  }
}

function saveStoredSession(session: StoredSession): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function clearStoredSession(): void {
  window.localStorage.removeItem(STORAGE_KEY);
}

export default function EnterprisePortalPage() {
  const [session, setSession] = useState<StoredSession | null>(() => loadStoredSession());
  const [inviteCode, setInviteCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("code") || "";
  });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<PortalView>("chat");
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [toolsets, setToolsets] = useState<ToolsetInfo[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [cronName, setCronName] = useState("");
  const [cronPrompt, setCronPrompt] = useState("");
  const [cronSchedule, setCronSchedule] = useState("");
  const [creatingCron, setCreatingCron] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const displayName = useMemo(() => {
    if (!session) return "";
    return session.user.name || session.user.email || "User";
  }, [session]);

  const selectedAgent = useMemo(() => {
    if (!session) return null;
    return (
      session.agents.find((agent) => agent.id === session.selectedAgentId) ||
      session.agents[0] ||
      null
    );
  }, [session]);

  useEffect(() => {
    if (!session?.token) return;
    let cancelled = false;
    api
      .getEnterpriseMe(session.token)
      .then((profile) => {
        if (cancelled) return;
        const nextAgents = profile.agents || [];
        const nextSelectedAgentId = nextAgents.some(
          (agent) => agent.id === session.selectedAgentId,
        )
          ? session.selectedAgentId
          : nextAgents[0]?.id;
        const nextSession = {
          ...session,
          user: profile.user,
          agents: nextAgents,
          selectedAgentId: nextSelectedAgentId,
        };
        saveStoredSession(nextSession);
        setSession(nextSession);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session?.token]);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, sending]);

  useEffect(() => {
    if (!session?.token || !selectedAgent || view === "chat") return;
    let cancelled = false;
    setPanelLoading(true);
    const load =
      view === "cron"
        ? api.getEnterprisePortalCronJobs(session.token, selectedAgent.id).then((result) => {
            if (!cancelled) setCronJobs(result.jobs || []);
          })
        : view === "skills"
          ? api.getEnterprisePortalSkills(session.token, selectedAgent.id).then((result) => {
              if (!cancelled) setSkills(result.skills || []);
            })
          : api.getEnterprisePortalToolsets(session.token, selectedAgent.id).then((result) => {
              if (!cancelled) setToolsets(result.toolsets || []);
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
  }, [session?.token, selectedAgent?.id, view]);

  async function redeemInvite(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setRedeeming(true);
    try {
      const result = await api.redeemEnterpriseInvite({
        code: inviteCode.trim(),
        email: email.trim() || undefined,
        name: name.trim() || undefined,
      });
      const nextSession = {
        token: result.api_key,
        user: result.user,
        agents: result.agents || [],
        selectedAgentId: result.agents?.[0]?.id,
        sessionIds: {},
      };
      saveStoredSession(nextSession);
      setSession(nextSession);
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRedeeming(false);
    }
  }

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    if (!session || !input.trim() || sending) return;
    if (!selectedAgent) {
      setError("No business agent is available for this user.");
      return;
    }

    const userMessage: PortalMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    };
    setInput("");
    setError(null);
    setMessages((current) => [...current, userMessage]);
    setSending(true);

    try {
      const result = await api.enterpriseChat({
        token: session.token,
        message: userMessage.content,
        session_id: session.sessionIds?.[selectedAgent.id],
        agent_id: selectedAgent.id,
      });
      const nextAgentId = result.agent?.id || selectedAgent.id;
      const nextSession = {
        ...session,
        agents: result.agents || session.agents,
        selectedAgentId: nextAgentId,
        sessionIds: {
          ...(session.sessionIds || {}),
          [nextAgentId]: result.session_id,
        },
        user: result.user || session.user,
      };
      saveStoredSession(nextSession);
      setSession(nextSession);
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: result.final_response || "(No response)",
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  function logout() {
    clearStoredSession();
    setSession(null);
    setMessages([]);
    setInput("");
    setError(null);
  }

  function startNewChat() {
    if (!session) return;
    const nextSessionIds = { ...(session.sessionIds || {}) };
    if (selectedAgent) {
      delete nextSessionIds[selectedAgent.id];
    }
    const nextSession = { ...session, sessionIds: nextSessionIds };
    saveStoredSession(nextSession);
    setSession(nextSession);
    setMessages([]);
    setInput("");
    setError(null);
  }

  function selectAgent(agentId: string) {
    if (!session || agentId === session.selectedAgentId) return;
    const exists = session.agents.some((agent) => agent.id === agentId);
    if (!exists) return;
    const nextSession = { ...session, selectedAgentId: agentId };
    saveStoredSession(nextSession);
    setSession(nextSession);
    setMessages([]);
    setInput("");
    setError(null);
  }

  async function createCronJob(event: FormEvent) {
    event.preventDefault();
    if (!session || !selectedAgent || !cronPrompt.trim() || !cronSchedule.trim()) return;
    setCreatingCron(true);
    setError(null);
    try {
      const job = await api.createEnterprisePortalCronJob({
        token: session.token,
        agent_id: selectedAgent.id,
        name: cronName.trim() || undefined,
        prompt: cronPrompt.trim(),
        schedule: cronSchedule.trim(),
      });
      setCronJobs((current) => [job, ...current]);
      setCronName("");
      setCronPrompt("");
      setCronSchedule("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingCron(false);
    }
  }

  async function pauseOrResumeCron(job: CronJob) {
    if (!session) return;
    setBusyItem(job.id);
    setError(null);
    try {
      const next =
        job.state === "paused"
          ? await api.resumeEnterprisePortalCronJob(session.token, job.id)
          : await api.pauseEnterprisePortalCronJob(session.token, job.id);
      setCronJobs((current) => current.map((item) => (item.id === job.id ? next : item)));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyItem(null);
    }
  }

  async function deleteCronJob(job: CronJob) {
    if (!session) return;
    setBusyItem(job.id);
    setError(null);
    try {
      await api.deleteEnterprisePortalCronJob(session.token, job.id);
      setCronJobs((current) => current.filter((item) => item.id !== job.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyItem(null);
    }
  }

  async function toggleSkill(skill: SkillInfo) {
    if (!session || !selectedAgent) return;
    setBusyItem(skill.name);
    setError(null);
    try {
      await api.toggleEnterprisePortalSkill({
        token: session.token,
        agent_id: selectedAgent.id,
        name: skill.name,
        enabled: !skill.enabled,
      });
      setSkills((current) =>
        current.map((item) =>
          item.name === skill.name ? { ...item, enabled: !skill.enabled } : item,
        ),
      );
      const nextSessionIds = { ...(session.sessionIds || {}) };
      delete nextSessionIds[selectedAgent.id];
      const nextSession = { ...session, sessionIds: nextSessionIds };
      saveStoredSession(nextSession);
      setSession(nextSession);
      setMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyItem(null);
    }
  }

  return (
    <main className="relative z-2 flex h-dvh min-h-0 w-full flex-col overflow-hidden px-4 py-4 text-midground sm:px-6 lg:px-8">
      <header className="mx-auto flex w-full max-w-5xl shrink-0 items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center border border-border bg-card">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <Typography className="font-bold text-[1rem] leading-none tracking-[0.08em]">
              Hermes Enterprise
            </Typography>
            <p className="mt-1 truncate font-courier text-xs normal-case text-muted-foreground">
              {session
                ? selectedAgent
                  ? `${displayName} - ${selectedAgent.name}`
                  : displayName
                : "Invite-only workspace access"}
            </p>
          </div>
        </div>

        {session && (
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
            {session.agents.length > 1 && (
              <label className="flex h-9 items-center gap-2 border border-border bg-card px-2 font-courier text-xs normal-case text-muted-foreground">
                <Bot className="h-3.5 w-3.5" />
                <select
                  value={selectedAgent?.id || ""}
                  onChange={(event) => selectAgent(event.target.value)}
                  className="max-w-[180px] bg-transparent text-midground outline-none"
                >
                  {session.agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <Button type="button" variant="outline" size="sm" onClick={startNewChat}>
              <RotateCcw className="h-3.5 w-3.5" />
              New chat
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={logout}>
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
        )}
      </header>

      {!session ? (
        <section className="mx-auto flex w-full max-w-md flex-1 items-center">
          <form
            onSubmit={redeemInvite}
            className="w-full border border-border bg-card/80 p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.02)]"
          >
            <Typography className="font-bold text-[1.15rem] leading-none tracking-[0.08em]">
              Join workspace
            </Typography>
            <div className="mt-5 space-y-3">
              <label className="block">
                <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                  Invite code
                </span>
                <Input
                  value={inviteCode}
                  onChange={(e) => setInviteCode(e.target.value)}
                  autoComplete="one-time-code"
                  placeholder="hmi_..."
                  required
                  className="normal-case"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                  Email
                </span>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  className="normal-case"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                  Name
                </span>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  className="normal-case"
                />
              </label>
            </div>
            {error && (
              <p className="mt-3 font-courier text-xs normal-case text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="mt-5 w-full" disabled={redeeming}>
              {redeeming && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Continue
            </Button>
          </form>
        </section>
      ) : (
        <section className="mx-auto flex min-h-0 w-full max-w-5xl flex-1 flex-col pt-4">
          <nav className="mb-3 grid shrink-0 grid-cols-4 gap-2">
            {[
              { key: "chat" as const, label: "Chat", icon: Send },
              { key: "cron" as const, label: "Cron", icon: Clock },
              { key: "skills" as const, label: "Skills", icon: Package },
              { key: "tools" as const, label: "Tools", icon: Wrench },
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
                      : "border-border bg-card/50 text-muted-foreground hover:text-midground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          {view === "chat" && (
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto border border-border bg-card/50 p-3 sm:p-4"
            >
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="max-w-sm text-center font-courier text-sm normal-case text-muted-foreground">
                    Start a conversation with {selectedAgent?.name || "your business agent"}.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((message) => (
                    <div
                      key={message.id}
                      className={cn(
                        "max-w-[min(760px,92%)] border border-border px-3 py-2 font-courier text-sm leading-relaxed normal-case whitespace-pre-wrap",
                        message.role === "user"
                          ? "ml-auto bg-foreground/10 text-midground"
                          : "mr-auto bg-background/60 text-midground",
                      )}
                    >
                      {message.content}
                    </div>
                  ))}
                  {sending && (
                    <div className="mr-auto flex items-center gap-2 border border-border bg-background/60 px-3 py-2 font-courier text-sm normal-case text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Thinking
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {view === "cron" && (
            <div className="min-h-0 flex-1 overflow-y-auto border border-border bg-card/50 p-3 sm:p-4">
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
                  placeholder="What should this agent do on schedule?"
                  rows={3}
                  className="w-full resize-y border border-border bg-background/40 px-3 py-2 font-courier text-sm normal-case placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30"
                />
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Input
                    value={cronSchedule}
                    onChange={(event) => setCronSchedule(event.target.value)}
                    placeholder="every 30m, 2h, or 0 9 * * *"
                    className="normal-case"
                  />
                  <Button
                    type="submit"
                    disabled={creatingCron || !cronPrompt.trim() || !cronSchedule.trim()}
                  >
                    {creatingCron ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                    Create
                  </Button>
                </div>
              </form>
              <div className="mt-4 space-y-3">
                {panelLoading && <PanelLoading />}
                {!panelLoading && cronJobs.length === 0 && <EmptyPanel text="No cron jobs for this agent." />}
                {cronJobs.map((job) => (
                  <div key={job.id} className="border border-border bg-background/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-mondwest text-sm uppercase text-midground">
                          {job.name || job.prompt.slice(0, 48)}
                        </div>
                        <div className="mt-1 font-courier text-xs normal-case text-muted-foreground">
                          {job.schedule_display || job.schedule?.display} · {job.state}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button type="button" variant="outline" size="icon" disabled={busyItem === job.id} onClick={() => pauseOrResumeCron(job)}>
                          {job.state === "paused" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                        </Button>
                        <Button type="button" variant="outline" size="icon" disabled={busyItem === job.id} onClick={() => deleteCronJob(job)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="mt-2 line-clamp-3 whitespace-pre-wrap font-courier text-xs normal-case text-muted-foreground">
                      {job.prompt}
                    </p>
                    <div className="mt-2 font-courier text-xs normal-case text-muted-foreground">
                      Next: {formatTime(job.next_run_at)} · Last: {formatTime(job.last_run_at)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === "skills" && (
            <div className="min-h-0 flex-1 overflow-y-auto border border-border bg-card/50 p-3 sm:p-4">
              {panelLoading && <PanelLoading />}
              {!panelLoading && skills.length === 0 && <EmptyPanel text="No skills are available." />}
              <div className="grid gap-3 md:grid-cols-2">
                {skills.map((skill) => (
                  <div key={skill.name} className="border border-border bg-background/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-mondwest text-sm uppercase text-midground">
                          {skill.name}
                        </div>
                        <div className="mt-1 font-courier text-xs normal-case text-muted-foreground">
                          {skill.category || "general"}
                        </div>
                      </div>
                      <Button type="button" variant={skill.enabled ? "default" : "outline"} size="sm" disabled={busyItem === skill.name} onClick={() => toggleSkill(skill)}>
                        {busyItem === skill.name && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {skill.enabled ? "Enabled" : "Enable"}
                      </Button>
                    </div>
                    <p className="mt-2 line-clamp-3 font-courier text-xs normal-case text-muted-foreground">
                      {skill.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === "tools" && (
            <div className="min-h-0 flex-1 overflow-y-auto border border-border bg-card/50 p-3 sm:p-4">
              {panelLoading && <PanelLoading />}
              {!panelLoading && toolsets.length === 0 && <EmptyPanel text="No toolsets are available." />}
              <div className="grid gap-3 md:grid-cols-2">
                {toolsets.map((toolset) => (
                  <div key={toolset.name} className="border border-border bg-background/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-mondwest text-sm uppercase text-midground">
                          {toolset.label || toolset.name}
                        </div>
                        <div className="mt-1 font-courier text-xs normal-case text-muted-foreground">
                          {toolset.tools.length} tools
                        </div>
                      </div>
                      <span className={cn("border px-2 py-1 font-courier text-xs normal-case", toolset.enabled ? "border-success/50 text-success" : "border-border text-muted-foreground")}>
                        {toolset.enabled ? "Available" : "Off"}
                      </span>
                    </div>
                    <p className="mt-2 line-clamp-3 font-courier text-xs normal-case text-muted-foreground">
                      {toolset.description}
                    </p>
                    {toolset.tools.length > 0 && (
                      <p className="mt-2 truncate font-courier text-xs normal-case text-muted-foreground">
                        {toolset.tools.slice(0, 8).join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="mt-2 font-courier text-xs normal-case text-destructive">
              {error}
            </p>
          )}

          {view === "chat" && <form onSubmit={sendMessage} className="mt-3 flex shrink-0 gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask your agent..."
              className="h-11 normal-case"
              disabled={sending || !selectedAgent}
            />
            <Button type="submit" size="icon" disabled={sending || !input.trim() || !selectedAgent}>
              {sending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </form>}
        </section>
      )}
    </main>
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

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center border border-border/60 bg-background/30 p-4 text-center font-courier text-sm normal-case text-muted-foreground">
      {text}
    </div>
  );
}
