import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Circle,
  CircleAlert,
  Copy,
  Laptop,
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
import { TeamesLogo, TeamesWordmark } from "@/components/enterprise/TeamesBrand";
import { SkillDetailModal } from "@/components/enterprise/SkillDetailModal";
import { Markdown } from "@/components/Markdown";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  api,
  streamEnterpriseChat,
  type CronJob,
  type EnterpriseAgent,
  type EnterpriseBuilderTraceItem,
  type EnterpriseLocalDevice,
  type EnterpriseLocalDeviceCode,
  type EnterpriseUser,
  type SessionInfo,
  type SessionMessage,
  type SkillDetail,
  type SkillInfo,
  type ToolsetInfo,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type PortalMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  trace?: EnterpriseBuilderTraceItem[];
};

type StoredSession = {
  token: string;
  user: EnterpriseUser;
  agents: EnterpriseAgent[];
  selectedAgentId?: string;
  sessionIds?: Record<string, string>;
};

type PortalView = "chat" | "cron" | "skills" | "tools" | "local";

const STORAGE_KEY = "hermes.enterprise.portal";

function formatTime(value?: string | null): string {
  if (!value) return "Never";
  return new Date(value).toLocaleString();
}

function formatShortTime(value?: number | null): string {
  if (!value) return "";
  const date = new Date(value * 1000);
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function skillIdentity(skill: Pick<SkillInfo, "name" | "source">): string {
  return `${skill.source || "builtin"}:${skill.name}`;
}

function matchesText(query: string, ...parts: Array<string | number | null | undefined>): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  return parts
    .filter((part) => part !== null && part !== undefined)
    .join(" ")
    .toLowerCase()
    .includes(needle);
}

function portalMessagesFromSession(messages: SessionMessage[], sessionId: string): PortalMessage[] {
  return messages
    .filter((message) => (message.role === "user" || message.role === "assistant") && message.content)
    .map((message, index) => ({
      id: `${sessionId}-${index}`,
      role: message.role === "user" ? "user" : "assistant",
      content: message.content || "",
      trace: [],
    }));
}

export default function EnterprisePortalPage() {
  const [session, setSession] = useState<StoredSession | null>(() => loadStoredSession());
  const [inviteCode, setInviteCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("code") || "";
  });
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [redeeming, setRedeeming] = useState(false);
  const [sending, setSending] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<PortalMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<PortalView>("chat");
  const [chatSessions, setChatSessions] = useState<SessionInfo[]>([]);
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false);
  const [loadingChatSessionId, setLoadingChatSessionId] = useState("");
  const [chatHistoryVersion, setChatHistoryVersion] = useState(0);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [toolsets, setToolsets] = useState<ToolsetInfo[]>([]);
  const [skillSearch, setSkillSearch] = useState("");
  const [toolSearch, setToolSearch] = useState("");
  const [localDevices, setLocalDevices] = useState<EnterpriseLocalDevice[]>([]);
  const [localCode, setLocalCode] = useState<EnterpriseLocalDeviceCode | null>(null);
  const [panelLoading, setPanelLoading] = useState(false);
  const [cronName, setCronName] = useState("");
  const [cronPrompt, setCronPrompt] = useState("");
  const [cronSchedule, setCronSchedule] = useState("");
  const [localDeviceLabel, setLocalDeviceLabel] = useState("");
  const [creatingCron, setCreatingCron] = useState(false);
  const [creatingLocalCode, setCreatingLocalCode] = useState(false);
  const [connectingLocalBrowser, setConnectingLocalBrowser] = useState(false);
  const [busyItem, setBusyItem] = useState<string | null>(null);
  const [expandedSkill, setExpandedSkill] = useState("");
  const [loadingSkill, setLoadingSkill] = useState("");
  const [skillDetails, setSkillDetails] = useState<Record<string, SkillDetail>>({});
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoLoadedSessionRef = useRef("");
  const notifiedCronRunsRef = useRef<Record<string, string>>({});
  const localConnectParams = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      callback: params.get("local_callback") || "",
      state: params.get("local_state") || "",
      name: params.get("local_name") || "",
    };
  }, []);
  const isLocalBrowserConnect = Boolean(
    localConnectParams.callback && localConnectParams.state,
  );
  const isInviteMode = Boolean(inviteCode.trim());

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
  const selectedSkill = useMemo(
    () => skills.find((skill) => skillIdentity(skill) === expandedSkill) || null,
    [expandedSkill, skills],
  );
  const filteredSkills = useMemo(
    () =>
      skills.filter((skill) =>
        matchesText(
          skillSearch,
          skill.name,
          skill.description,
          skill.category,
          skill.source,
          skill.skill_dir,
        ),
      ),
    [skills, skillSearch],
  );
  const filteredToolsets = useMemo(
    () =>
      toolsets.filter((toolset) =>
        matchesText(
          toolSearch,
          toolset.name,
          toolset.label,
          toolset.description,
          toolset.enabled ? "available" : "off",
          toolset.configured ? "configured" : "not configured",
          ...(toolset.tools || []),
        ),
      ),
    [toolsets, toolSearch],
  );

  useEffect(() => {
    setExpandedSkill("");
    setSkillDetails({});
    setSkillSearch("");
    setToolSearch("");
  }, [selectedAgent?.id]);

  useEffect(() => {
    if (!session?.token || !selectedAgent) {
      setChatSessions([]);
      return;
    }
    let cancelled = false;
    setChatHistoryLoading(true);
    api
      .getEnterprisePortalChatSessions(session.token, selectedAgent.id, 20)
      .then((result) => {
        if (!cancelled) setChatSessions(result.sessions || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setChatHistoryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.token, selectedAgent?.id, chatHistoryVersion]);

  useEffect(() => {
    if (!session || !selectedAgent || messages.length > 0 || sending) return;
    const activeSessionId = session.sessionIds?.[selectedAgent.id];
    if (!activeSessionId || autoLoadedSessionRef.current === activeSessionId) return;
    const activeSession = chatSessions.find((item) => item.id === activeSessionId);
    if (!activeSession) return;
    autoLoadedSessionRef.current = activeSessionId;
    void openChatSession(activeSession);
  }, [session, selectedAgent, chatSessions, messages.length, sending]);

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

  function updateAssistantMessage(id: string, updater: (message: PortalMessage) => PortalMessage) {
    setMessages((current) => current.map((message) => (message.id === id ? updater(message) : message)));
  }

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
          : view === "tools"
            ? api.getEnterprisePortalToolsets(session.token, selectedAgent.id).then((result) => {
                if (!cancelled) setToolsets(result.toolsets || []);
              })
            : api.getEnterprisePortalLocalDevices(session.token, selectedAgent.id).then((result) => {
                if (!cancelled) setLocalDevices(result.devices || []);
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

  useEffect(() => {
    if (!session?.token || !selectedAgent) return;
    let cancelled = false;

    async function refreshCronJobs(notify: boolean) {
      if (!session?.token || !selectedAgent) return;
      try {
        const result = await api.getEnterprisePortalCronJobs(session.token, selectedAgent.id);
        if (cancelled) return;
        const jobs = result.jobs || [];
        setCronJobs(jobs);
        const seen = notifiedCronRunsRef.current;
        for (const job of jobs) {
          if (!job.last_run_at) continue;
          const marker = `${job.id}:${job.last_run_at}`;
          if (!notify) {
            seen[job.id] = marker;
            continue;
          }
          if (seen[job.id] === marker) continue;
          seen[job.id] = marker;
          if (job.last_status === "ok") {
            setMessages((current) => [
              ...current,
              {
                id: crypto.randomUUID(),
                role: "assistant",
                content:
                  job.latest_output ||
                  `Reminder completed: ${job.name || job.prompt.slice(0, 48)}`,
              },
            ]);
          } else if (job.last_status === "error") {
            setError(job.last_error || `Cron job failed: ${job.name || job.id}`);
          }
        }
      } catch {
        // Keep chat usable if polling fails; explicit panel loads still surface errors.
      }
    }

    void refreshCronJobs(false);
    const interval = window.setInterval(() => {
      void refreshCronJobs(true);
    }, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [session?.token, selectedAgent?.id]);

  async function authenticatePortal(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setRedeeming(true);
    try {
      const result = isInviteMode
        ? await api.redeemEnterpriseInvite({
            code: inviteCode.trim(),
            email: email.trim() || undefined,
            name: name.trim() || undefined,
            password,
          })
        : await api.loginEnterprisePortal({
            email: email.trim(),
            password,
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
    const assistantId = crypto.randomUUID();
    setInput("");
    setError(null);
    setMessages((current) => [
      ...current,
      userMessage,
      { id: assistantId, role: "assistant", content: "", trace: [] },
    ]);
    setSending(true);

    try {
      await streamEnterpriseChat(
        {
          token: session.token,
          message: userMessage.content,
          session_id: session.sessionIds?.[selectedAgent.id],
          agent_id: selectedAgent.id,
        },
        {
          onDelta: (delta) => {
            updateAssistantMessage(assistantId, (message) => ({
              ...message,
              content: `${message.content}${delta}`,
            }));
          },
          onTrace: (trace) => {
            updateAssistantMessage(assistantId, (message) => ({
              ...message,
              trace: [...(message.trace || []), trace],
            }));
          },
          onFinal: (result) => {
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
            updateAssistantMessage(assistantId, (message) => ({
              ...message,
              content: result.final_response || message.content || "(No response)",
              trace: result.trace || message.trace || [],
            }));
            setChatHistoryVersion((current) => current + 1);
          },
          onError: (detail) => {
            setError(detail);
            updateAssistantMessage(assistantId, (message) => ({
              ...message,
              content: message.content || `Chat failed: ${detail}`,
            }));
          },
        },
      );
    } catch (err) {
      const messageText = err instanceof Error ? err.message : String(err);
      setError(messageText);
      updateAssistantMessage(assistantId, (message) => ({
        ...message,
        content: message.content || `Chat failed: ${messageText}`,
      }));
    } finally {
      setSending(false);
    }
  }

  function logout() {
    clearStoredSession();
    setSession(null);
    setMessages([]);
    setChatSessions([]);
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

  async function openChatSession(chatSession: SessionInfo) {
    if (!session || !selectedAgent || loadingChatSessionId) return;
    setLoadingChatSessionId(chatSession.id);
    setError(null);
    try {
      const result = await api.getEnterprisePortalChatMessages(
        session.token,
        chatSession.id,
        selectedAgent.id,
      );
      const nextSession = {
        ...session,
        sessionIds: {
          ...(session.sessionIds || {}),
          [selectedAgent.id]: result.session_id,
        },
      };
      saveStoredSession(nextSession);
      setSession(nextSession);
      setMessages(portalMessagesFromSession(result.messages || [], result.session_id));
      setView("chat");
      setInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingChatSessionId("");
    }
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

  async function openSkill(skill: SkillInfo) {
    if (!session || !selectedAgent) return;
    const key = skillIdentity(skill);
    if (expandedSkill === key) {
      setExpandedSkill("");
      return;
    }
    setExpandedSkill(key);
    if (skillDetails[key]) return;
    setLoadingSkill(key);
    setError(null);
    try {
      const detail = await api.getEnterprisePortalSkillDetail(
        session.token,
        skill.name,
        selectedAgent.id,
      );
      setSkillDetails((current) => ({ ...current, [key]: detail }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingSkill("");
    }
  }

  async function createLocalDeviceCode(event: FormEvent) {
    event.preventDefault();
    if (!session || !selectedAgent) return;
    setCreatingLocalCode(true);
    setError(null);
    try {
      const code = await api.createEnterprisePortalLocalDeviceCode({
        token: session.token,
        agent_id: selectedAgent.id,
        label: localDeviceLabel.trim() || undefined,
        expires_minutes: 30,
      });
      setLocalCode(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingLocalCode(false);
    }
  }

  async function copyLocalJoinCommand() {
    if (!localCode) return;
    await navigator.clipboard.writeText(
      `hermes enterprise local join ${localCode.code} --server ${window.location.origin}`,
    );
  }

  async function connectLocalBrowser() {
    if (!session || !selectedAgent || !isLocalBrowserConnect) return;
    setConnectingLocalBrowser(true);
    setError(null);
    try {
      const code = await api.createEnterprisePortalLocalDeviceCode({
        token: session.token,
        agent_id: selectedAgent.id,
        label: localConnectParams.name || localDeviceLabel.trim() || undefined,
        expires_minutes: 10,
      });
      const callback = new URL(localConnectParams.callback);
      if (
        !["http:", "https:"].includes(callback.protocol) ||
        !["127.0.0.1", "localhost", "::1"].includes(callback.hostname)
      ) {
        throw new Error("Local callback must be a localhost URL");
      }
      callback.searchParams.set("code", code.code);
      callback.searchParams.set("state", localConnectParams.state);
      window.location.href = callback.toString();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnectingLocalBrowser(false);
    }
  }

  return (
    <main
      className={cn(
        "relative z-2 flex h-dvh min-h-0 w-full flex-col bg-background px-4 py-4 text-midground sm:px-6 lg:px-8",
        session ? "overflow-hidden" : "overflow-y-auto",
      )}
    >
      <SkillDetailModal
        skill={selectedSkill}
        detail={expandedSkill ? skillDetails[expandedSkill] : undefined}
        loading={Boolean(expandedSkill && loadingSkill === expandedSkill)}
        onClose={() => setExpandedSkill("")}
      />

      {!session ? (
        <section className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 items-center justify-center gap-14 py-8 lg:grid-cols-[minmax(0,520px)_minmax(420px,480px)]">
          <div className="hidden min-w-0 lg:flex lg:flex-col">
            <TeamesWordmark compact />
            <div className="mt-16 max-w-[520px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium normal-case text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5" />
                {isInviteMode ? "Invitation required" : "Secure workspace"}
              </div>
              <h1 className="mt-5 max-w-[500px] text-[2.75rem] font-semibold leading-[1.12] tracking-normal text-midground">
                {isInviteMode ? "Join your organization's agent workspace" : "Sign in to your agent workspace"}
              </h1>
              <p className="mt-4 max-w-lg text-base normal-case leading-7 text-muted-foreground">
                {isInviteMode
                  ? "Use your invite to access the business agents, skills, tools, and scheduled work assigned by your administrator."
                  : "Use the email and password you set when accepting your workspace invitation."}
              </p>
              <div className="mt-8 grid gap-3 text-sm normal-case text-muted-foreground">
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  Chat with business agents approved for your account
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  Keep your workspace data scoped to your organization
                </div>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  {isLocalBrowserConnect
                    ? "Connect this computer after accepting the invite"
                    : "Manage your assigned tools, skills, and reminders"}
                </div>
              </div>
            </div>
          </div>

          <form
            onSubmit={authenticatePortal}
            className="mx-auto w-full max-w-[480px] rounded-lg border border-border bg-card/95 p-6 shadow-sm sm:p-7"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="lg:hidden">
                  <TeamesWordmark compact />
                </div>
                <Typography className="mt-6 text-2xl font-semibold leading-tight tracking-[-0.02em] text-midground lg:mt-0">
                  {isInviteMode ? "Accept invitation" : "Welcome back"}
                </Typography>
                <p className="mt-2 text-sm normal-case leading-6 text-muted-foreground">
                  {!isInviteMode
                    ? "Sign in to continue to your assigned business agents."
                    : isLocalBrowserConnect
                    ? "Join first, then approve connecting this computer as your local Teames agent."
                    : "Confirm your invite code and account details to continue."}
                </p>
              </div>
              <TeamesLogo className="hidden h-11 w-11 sm:inline-flex" />
            </div>

            <div className="mt-6 space-y-4">
              {isInviteMode && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium normal-case text-muted-foreground">
                    Invitation code
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
              )}
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium normal-case text-muted-foreground">
                  Email
                </span>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  autoComplete="email"
                  placeholder="you@company.com"
                  required
                  className="normal-case"
                />
              </label>
              {isInviteMode && (
                <label className="block">
                  <span className="mb-1.5 block text-xs font-medium normal-case text-muted-foreground">
                    Display name
                  </span>
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                    placeholder="Your name"
                    className="normal-case"
                  />
                </label>
              )}
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium normal-case text-muted-foreground">
                  Password
                </span>
                <Input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  autoComplete={isInviteMode ? "new-password" : "current-password"}
                  placeholder={isInviteMode ? "Create a password" : "Your password"}
                  required
                  minLength={6}
                  className="normal-case"
                />
              </label>
            </div>
            {error && (
              <p className="mt-4 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs normal-case text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" className="mt-6 w-full" disabled={redeeming}>
              {redeeming && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isInviteMode ? (isLocalBrowserConnect ? "Join and continue" : "Join workspace") : "Sign in"}
            </Button>
          </form>
        </section>
      ) : (
        <>
          <header className="mx-auto flex w-full max-w-6xl shrink-0 items-center justify-between gap-4 rounded-lg border border-border bg-white/85 px-4 py-3 shadow-sm">
            <div className="flex min-w-0 items-center gap-3">
              <TeamesLogo className="h-12 w-12" />
              <div className="min-w-0">
                <div className="truncate text-base font-semibold normal-case leading-tight text-midground">
                  Welcome back{displayName ? `, ${displayName}` : ""}
                </div>
                <div className="mt-1 truncate text-sm normal-case text-muted-foreground">
                  Choose an agent, continue recent chats, and manage your assigned tools.
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={startNewChat}>
                <RotateCcw className="h-3.5 w-3.5" />
                New chat
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={logout}>
                <LogOut className="h-3.5 w-3.5" />
                Sign out
              </Button>
            </div>
          </header>

          {isLocalBrowserConnect && (
            <section className="mx-auto mt-4 flex w-full max-w-5xl shrink-0 items-center justify-between gap-3 border border-border bg-card/70 p-3">
              <div className="min-w-0 font-courier text-xs normal-case text-muted-foreground">
                Connect this browser's local Teames agent to{" "}
                <span className="text-midground">{selectedAgent?.name || "this business agent"}</span>.
              </div>
              <Button
                type="button"
                onClick={connectLocalBrowser}
                disabled={connectingLocalBrowser || !selectedAgent}
              >
                {connectingLocalBrowser ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Laptop className="h-3.5 w-3.5" />}
                Connect This Computer
              </Button>
            </section>
          )}

          <section className="mx-auto grid min-h-0 w-full max-w-6xl flex-1 gap-4 pt-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-white/75 p-3 shadow-sm">
            <div className="mb-4 px-1">
              <div className="text-xs font-semibold normal-case text-muted-foreground">
                Agent
              </div>
              {session.agents.length > 1 ? (
                <select
                  value={selectedAgent?.id || ""}
                  onChange={(event) => selectAgent(event.target.value)}
                  className="mt-2 h-10 w-full rounded-md border border-border bg-white px-3 text-sm font-medium normal-case text-midground outline-none focus-visible:border-midground focus-visible:ring-1 focus-visible:ring-midground/30"
                >
                  {session.agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="mt-2 truncate rounded-md border border-border bg-background/40 px-3 py-2 text-sm font-medium normal-case text-midground">
                  {selectedAgent?.name || "Business agent"}
                </div>
              )}
            </div>
            <div className="mb-3 px-1">
              <div className="text-xs font-semibold normal-case text-muted-foreground">
                Modules
              </div>
            </div>
            <nav className="grid gap-1" aria-label="Portal modules">
            {[
              { key: "chat" as const, label: "Chat", icon: Send },
              { key: "cron" as const, label: "Cron", icon: Clock },
              { key: "skills" as const, label: "Skills", icon: Package },
              { key: "tools" as const, label: "Tools", icon: Wrench },
              { key: "local" as const, label: "Remote connection", icon: Laptop },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setView(item.key)}
                  className={cn(
                    "flex h-10 items-center gap-2 rounded-md border px-3 text-left text-xs font-medium normal-case transition-colors",
                    view === item.key
                      ? "border-midground bg-white text-midground shadow-sm"
                      : "border-transparent bg-transparent text-muted-foreground hover:text-midground",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
            </nav>
            <div className="mt-4 min-h-0 flex-1 border-t border-border pt-3">
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <div className="text-xs font-semibold normal-case text-midground">
                  Recent chats
                </div>
                {chatHistoryLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <div className="max-h-full space-y-1 overflow-y-auto pr-1">
                {!chatHistoryLoading && chatSessions.length === 0 && (
                  <div className="px-1 py-2 text-xs normal-case text-muted-foreground">
                    No chat history yet.
                  </div>
                )}
                {chatSessions.map((chatSession) => {
                  const activeSessionId = selectedAgent ? session.sessionIds?.[selectedAgent.id] : "";
                  const isActive = activeSessionId === chatSession.id;
                  return (
                    <button
                      key={chatSession.id}
                      type="button"
                      onClick={() => openChatSession(chatSession)}
                      disabled={Boolean(loadingChatSessionId)}
                      className={cn(
                        "w-full rounded-md border px-2.5 py-2 text-left text-xs normal-case transition-colors",
                        isActive
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
            </div>
            {error && (
              <div className="mt-4 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 font-courier text-xs normal-case text-amber-900">
                Sync issue: {error.startsWith("500:") ? "Some workspace data is unavailable." : error}
              </div>
            )}
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card/75 shadow-sm">
            <div className="shrink-0 border-b border-border px-4 py-3">
              <div className="text-sm font-semibold normal-case text-midground">
                {view === "chat"
                  ? "Chat"
                  : view === "cron"
                    ? "Cron"
                    : view === "skills"
                      ? "Skills"
                      : view === "tools"
                        ? "Tools"
                        : "Remote connection"}
              </div>
            </div>

          {view === "chat" && (
            <div
              ref={scrollRef}
              className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4"
            >
              {messages.length === 0 ? (
                <div className="flex h-full items-center justify-center">
                  <p className="max-w-sm text-center font-courier text-sm normal-case text-muted-foreground">
                    Start a conversation with {selectedAgent?.name || "your business agent"}.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {messages.map((message, index) => {
                    const isLatestAssistant =
                      sending && message.role === "assistant" && index === messages.length - 1;
                    const hasTrace = Boolean(message.trace && message.trace.length > 0);
                    return (
                    <div
                      key={message.id}
                      className={cn(
                        "max-w-[min(760px,92%)] border border-border px-3 py-2 font-courier text-sm leading-relaxed normal-case",
                        message.role === "user"
                          ? "ml-auto bg-foreground/10 text-midground"
                          : "mr-auto bg-background/60 text-midground",
                      )}
                    >
                      {message.role === "assistant" && hasTrace && (
                        <TraceList trace={message.trace || []} />
                      )}
                      {message.content ? (
                        <div className={cn("break-words", message.role === "assistant" && hasTrace ? "mt-3" : "")}>
                          <Markdown content={message.content} streaming={isLatestAssistant} />
                        </div>
                      ) : isLatestAssistant ? (
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Thinking
                        </div>
                      ) : null}
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {view === "cron" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
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
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              {panelLoading && <PanelLoading />}
              {!panelLoading && skills.length === 0 && <EmptyPanel text="No skills are available." />}
              {!panelLoading && skills.length > 0 && (
                <Input
                  value={skillSearch}
                  onChange={(event) => setSkillSearch(event.target.value)}
                  placeholder="Search skills..."
                  className="mb-3 normal-case"
                />
              )}
              {!panelLoading && skills.length > 0 && filteredSkills.length === 0 && (
                <EmptyPanel text="No skills match your search." />
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {filteredSkills.map((skill) => {
                  const key = skillIdentity(skill);
                  return (
                    <div key={key} className="border border-border bg-background/50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-mondwest text-sm uppercase text-midground">
                            {skill.name}
                          </div>
                          <div className="mt-1 font-courier text-xs normal-case text-muted-foreground">
                            {skill.category || "general"}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={loadingSkill === key}
                            onClick={() => openSkill(skill)}
                          >
                            {loadingSkill === key ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <BookOpen className="h-3.5 w-3.5" />
                            )}
                            Open
                          </Button>
                          <Button
                            type="button"
                            variant={skill.enabled ? "default" : "outline"}
                            size="sm"
                            disabled={busyItem === skill.name || skill.source === "agent_custom"}
                            onClick={() => toggleSkill(skill)}
                          >
                            {busyItem === skill.name && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {skill.source === "agent_custom" ? "Business" : skill.enabled ? "Enabled" : "Enable"}
                          </Button>
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-3 font-courier text-xs normal-case text-muted-foreground">
                        {skill.description}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {view === "tools" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              {panelLoading && <PanelLoading />}
              {!panelLoading && toolsets.length === 0 && <EmptyPanel text="No toolsets are available." />}
              {!panelLoading && toolsets.length > 0 && (
                <Input
                  value={toolSearch}
                  onChange={(event) => setToolSearch(event.target.value)}
                  placeholder="Search tools..."
                  className="mb-3 normal-case"
                />
              )}
              {!panelLoading && toolsets.length > 0 && filteredToolsets.length === 0 && (
                <EmptyPanel text="No tools match your search." />
              )}
              <div className="grid gap-3 md:grid-cols-2">
                {filteredToolsets.map((toolset) => (
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

          {view === "local" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
              <form onSubmit={createLocalDeviceCode} className="grid gap-3 border-b border-border pb-4 sm:grid-cols-[minmax(0,1fr)_auto]">
                <Input
                  value={localDeviceLabel}
                  onChange={(event) => setLocalDeviceLabel(event.target.value)}
                  placeholder="Local device label"
                  className="normal-case"
                />
                <Button type="submit" disabled={creatingLocalCode || !selectedAgent}>
                  {creatingLocalCode ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Laptop className="h-3.5 w-3.5" />}
                  Connect Local Agent
                </Button>
              </form>

              {localCode && (
                <div className="mt-4 border border-border bg-background/50 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="font-courier text-xs normal-case text-muted-foreground">
                      Run this on the local machine
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={copyLocalJoinCommand}>
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </Button>
                  </div>
                  <code className="block overflow-x-auto whitespace-nowrap border border-border bg-black/30 px-2 py-2 font-courier text-xs normal-case text-midground">
                    hermes enterprise local join {localCode.code} --server {window.location.origin}
                  </code>
                  <p className="mt-2 font-courier text-xs normal-case text-muted-foreground">
                    Expires: {formatTime(new Date(localCode.expires_at * 1000).toISOString())}
                  </p>
                </div>
              )}

              <div className="mt-4 space-y-3">
                {panelLoading && <PanelLoading />}
                {!panelLoading && localDevices.length === 0 && <EmptyPanel text="No local agents connected for this business agent." />}
                {localDevices.map((device) => (
                  <div key={device.id} className="border border-border bg-background/50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-mondwest text-sm uppercase text-midground">
                          {device.name}
                        </div>
                        <div className="mt-1 font-courier text-xs normal-case text-muted-foreground">
                          {device.agent_name || device.agent_id}
                        </div>
                      </div>
                      <span className="border border-success/50 px-2 py-1 font-courier text-xs normal-case text-success">
                        Active
                      </span>
                    </div>
                    <div className="mt-2 font-courier text-xs normal-case text-muted-foreground">
                      User email: {device.user_email || "-"} · Device code: {device.id}
                    </div>
                    <div className="mt-1 font-courier text-xs normal-case text-muted-foreground">
                      Last seen: {formatTime(device.last_seen_at ? new Date(device.last_seen_at * 1000).toISOString() : null)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === "chat" && <form onSubmit={sendMessage} className="flex shrink-0 gap-2 border-t border-border p-3">
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
        </section>
        </>
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

function TraceList({ trace }: { trace: EnterpriseBuilderTraceItem[] }) {
  return (
    <div className="border-b border-border/70 pb-2">
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

function EmptyPanel({ text }: { text: string }) {
  return (
    <div className="flex min-h-32 items-center justify-center border border-border/60 bg-background/30 p-4 text-center font-courier text-sm normal-case text-muted-foreground">
      {text}
    </div>
  );
}
