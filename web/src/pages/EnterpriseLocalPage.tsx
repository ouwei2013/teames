import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Bot,
  CheckCircle2,
  Circle,
  CircleAlert,
  Filter,
  LogOut,
  Loader2,
  Pause,
  Package,
  Play,
  Plus,
  PlugZap,
  Send,
  Server,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  api,
  streamEnterpriseLocalWebChat,
  type CronJob,
  type EnterpriseBuilderTraceItem,
  type EnterpriseLocalRequest,
  type EnterpriseLocalWebStatus,
  type SessionInfo,
  type SessionMessage,
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

type LocalView = "connection" | "chat" | "requests" | "skills" | "tools" | "cron";

function viewFromPath(pathname: string): LocalView | null {
  const last = pathname.replace(/\/$/, "").split("/").pop();
  if (
    last === "connection" ||
    last === "chat" ||
    last === "requests" ||
    last === "skills" ||
    last === "tools" ||
    last === "cron"
  ) {
    return last;
  }
  return null;
}

function defaultRemoteServer(): string {
  const params = new URLSearchParams(window.location.search);
  return params.get("server") || "http://127.0.0.1:9121";
}

function formatLocalTime(value?: number | null): string {
  if (!value) return "-";
  return new Date(value * 1000).toLocaleString();
}

function formatShortTime(value?: number | null): string {
  if (!value) return "";
  return new Date(value * 1000).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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

function localRequestLabel(request: EnterpriseLocalRequest): string {
  return `${request.device_id || "unknown device"} · ${request.user_email || request.user_name || "unknown user"}`;
}

function requestStatusVariant(status?: string | null): "default" | "secondary" | "outline" | "success" | "warning" | "destructive" {
  if (status === "responded") return "success";
  if (status === "rejected") return "warning";
  return "outline";
}

function LocalRequestDetailModal({
  request,
  busy,
  onAnswer,
  onClose,
}: {
  request: EnterpriseLocalRequest | null;
  busy: boolean;
  onAnswer: (request: EnterpriseLocalRequest) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!request) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, request]);

  if (!request) return null;

  const canAnswer = (request.status === "pending" || request.status === "delivered") && !request.response;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/85 p-3 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[88dvh] min-h-0 w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant={requestStatusVariant(request.status)}>{request.status}</Badge>
              <span className="text-xs normal-case text-muted-foreground">
                {formatLocalTime(request.created_at)}
              </span>
            </div>
            <h2 className="truncate text-xl font-semibold normal-case text-midground">
              {localRequestLabel(request)}
            </h2>
            <p className="mt-1 text-sm normal-case text-muted-foreground">
              {request.device_name || "Local device"} · {request.agent_name || request.agent_id || "No agent"}
            </p>
            <div className="mt-3 grid gap-1 text-xs normal-case text-muted-foreground sm:grid-cols-2">
              <span className="truncate">User: {request.user_email || request.user_name || request.user_id || "-"}</span>
              <span className="truncate">Device code: {request.device_id || "-"}</span>
              <span className="truncate">Device: {request.device_name || "-"}</span>
              <span className="truncate">Agent: {request.agent_name || request.agent_id || "-"}</span>
              <span className="truncate sm:col-span-2">Request ID: {request.id}</span>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canAnswer && (
              <Button type="button" size="sm" onClick={() => onAnswer(request)} disabled={busy}>
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Bot className="h-3.5 w-3.5" />}
                Answer
              </Button>
            )}
            <Button type="button" variant="outline" size="icon" onClick={onClose} aria-label="Close request details">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <section className="min-w-0 rounded-lg border border-border bg-background/60 p-4">
              <div className="mb-2 text-xs font-medium normal-case text-muted-foreground">Request</div>
              <div className="whitespace-pre-wrap text-sm normal-case text-midground">{request.request}</div>
            </section>
            <section className="min-w-0 rounded-lg border border-border bg-background/60 p-4">
              <div className="mb-2 text-xs font-medium normal-case text-muted-foreground">Response</div>
              {request.response ? (
                <div className="min-w-0 overflow-x-auto break-words text-sm normal-case">
                  <Markdown content={request.response} />
                </div>
              ) : (
                <div className="text-sm normal-case text-muted-foreground">No response yet.</div>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function localMessagesFromSession(messages: SessionMessage[], sessionId: string): LocalMessage[] {
  return messages
    .filter((message) => (message.role === "user" || message.role === "assistant") && message.content)
    .map((message, index) => ({
      id: `${sessionId}-${index}`,
      role: message.role === "user" ? "user" : "assistant",
      content: message.content || "",
      trace: [],
    }));
}

function prettyCategory(raw?: string | null): string {
  if (!raw) return "General";
  return raw
    .split(/[-_/]/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export default function EnterpriseLocalPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [status, setStatus] = useState<EnterpriseLocalWebStatus | null>(null);
  const [remoteServer, setRemoteServer] = useState(defaultRemoteServer);
  const [deviceName, setDeviceName] = useState(() => {
    const hostname = window.navigator.userAgent.includes("Mac") ? "Mac" : "Local machine";
    return `Teames ${hostname}`;
  });
  const [localEmail, setLocalEmail] = useState("");
  const [localPassword, setLocalPassword] = useState("");
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [view, setView] = useState<LocalView>("connection");
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [toolsets, setToolsets] = useState<ToolsetInfo[]>([]);
  const [cronJobs, setCronJobs] = useState<CronJob[]>([]);
  const [localRequests, setLocalRequests] = useState<EnterpriseLocalRequest[]>([]);
  const [chatSessions, setChatSessions] = useState<SessionInfo[]>([]);
  const [chatHistoryLoading, setChatHistoryLoading] = useState(false);
  const [loadingChatSessionId, setLoadingChatSessionId] = useState("");
  const [requestSearch, setRequestSearch] = useState("");
  const [selectedRequestDetail, setSelectedRequestDetail] = useState<EnterpriseLocalRequest | null>(null);
  const [skillSearch, setSkillSearch] = useState("");
  const [toolSearch, setToolSearch] = useState("");
  const [activeSkillCategory, setActiveSkillCategory] = useState<string | null>(null);
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
        "I am your local Teames agent. I can work on this computer and consult assigned business agents when needed.",
    },
  ]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoAnsweringRef = useRef<Set<string>>(new Set());
  const joined = Boolean(status?.joined);
  const filteredLocalRequests = useMemo(
    () =>
      localRequests.filter((request) =>
        matchesText(
          requestSearch,
          request.id,
          request.status,
          request.device_id,
          request.device_name,
          request.user_email,
          request.user_name,
          request.user_id,
          request.agent_name,
          request.agent_id,
          request.request,
          request.response,
        ),
      ),
    [localRequests, requestSearch],
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
  const skillCategories = useMemo(() => {
    const categories = new Map<string, number>();
    for (const skill of skills) {
      const key = skill.category || "__none__";
      categories.set(key, (categories.get(key) || 0) + 1);
    }
    return [...categories.entries()]
      .sort((a, b) => {
        if (a[0] === "__none__") return -1;
        if (b[0] === "__none__") return 1;
        return a[0].localeCompare(b[0]);
      })
      .map(([key, count]) => ({
        key,
        label: prettyCategory(key === "__none__" ? null : key),
        count,
      }));
  }, [skills]);
  const visibleSkills = useMemo(() => {
    if (skillSearch.trim()) return filteredSkills;
    if (!activeSkillCategory) return filteredSkills;
    return filteredSkills.filter((skill) =>
      activeSkillCategory === "__none__" ? !skill.category : skill.category === activeSkillCategory,
    );
  }, [activeSkillCategory, filteredSkills, skillSearch]);
  const filteredToolsets = useMemo(
    () =>
      toolsets.filter((toolset) =>
        matchesText(
          toolSearch,
          toolset.name,
          toolset.label,
          toolset.description,
          toolset.enabled ? "enabled" : "disabled",
          toolset.configured ? "configured" : "not configured",
          ...(toolset.tools || []),
        ),
      ),
    [toolsets, toolSearch],
  );

  useEffect(() => {
    const nextView = viewFromPath(location.pathname);
    if (nextView) setView(nextView);
  }, [location.pathname]);

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
    if (view === "connection" || view === "chat" || view === "requests") return;
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

  useEffect(() => {
    if (!joined) {
      setChatSessions([]);
      return;
    }
    void loadChatSessions();
  }, [joined]);

  async function loadStatus() {
    setLoading(true);
    try {
      const next = await api.getEnterpriseLocalWebStatus();
      setStatus(next);
      if (next.server) setRemoteServer(next.server);
      if (location.pathname.replace(/\/$/, "") === "/local") {
        navigate(next.joined ? "/local/chat" : "/local/connection", { replace: true });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadChatSessions() {
    setChatHistoryLoading(true);
    try {
      const result = await api.getEnterpriseLocalWebChatSessions(30);
      setChatSessions(result.sessions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setChatHistoryLoading(false);
    }
  }

  async function joinWithCredentials(event: FormEvent) {
    event.preventDefault();
    const email = localEmail.trim();
    if (!email || !localPassword.trim()) return;
    setConnecting(true);
    setError(null);
    try {
      const next = await api.joinEnterpriseLocalWeb({
        server: remoteServer.trim(),
        email,
        name: deviceName.trim() || undefined,
        password: localPassword,
      });
      setStatus(next);
      setLocalEmail("");
      setLocalPassword("");
      navigate("/local/chat");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnecting(false);
    }
  }

  async function disconnectRemote() {
    setConnecting(true);
    setError(null);
    try {
      const next = await api.disconnectEnterpriseLocalWeb();
      setStatus(next);
      navigate("/local/connection");
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
            void loadChatSessions();
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

  async function openChatSession(chatSession: SessionInfo) {
    if (loadingChatSessionId) return;
    setLoadingChatSessionId(chatSession.id);
    setError(null);
    try {
      const result = await api.getEnterpriseLocalWebChatMessages(chatSession.id);
      setSessionId(result.session_id);
      setMessages(localMessagesFromSession(result.messages || [], result.session_id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingChatSessionId("");
    }
  }

  function startNewChat() {
    setSessionId("");
    setMessages([]);
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
      setSelectedRequestDetail((current) =>
        current?.id === request.id ? result.request : current,
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
    <>
      <LocalRequestDetailModal
        request={selectedRequestDetail}
        busy={Boolean(selectedRequestDetail && busyItem === `request:${selectedRequestDetail.id}`)}
        onAnswer={answerLocalRequest}
        onClose={() => setSelectedRequestDetail(null)}
      />
      <main className="relative z-2 flex min-h-[calc(100dvh-7rem)] w-full flex-col overflow-y-auto text-midground lg:min-h-0 lg:flex-1 lg:overflow-hidden">
      <section className="flex w-full flex-1 flex-col gap-3 overflow-visible lg:min-h-0 lg:overflow-hidden">
        <div className="rounded-lg border border-border bg-white/75 px-3 py-2 shadow-sm">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <div className="truncate text-sm font-semibold normal-case leading-tight text-midground">
                  {status?.device?.name || deviceName || "Local device"}
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-1 text-[11px] font-medium normal-case",
                    joined
                      ? "border-emerald-300/70 bg-emerald-50 text-emerald-800"
                      : "border-amber-300/70 bg-amber-50 text-amber-900",
                  )}
                >
                  {joined ? "Online" : "Setup"}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs normal-case text-muted-foreground">
                <span>Remote: {status?.server || remoteServer || "-"}</span>
                <span>User: {status?.user?.email || status?.user?.name || status?.device?.user_id || "-"}</span>
                <span>Device code: {status?.device?.id || "-"}</span>
                <span>Default remote agent: {status?.agent?.name || status?.default_agent_id || "-"}</span>
                <span>Profile: clientlocal</span>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={loadStatus} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                Refresh
              </Button>
              {!joined && (
                <Button type="button" size="sm" onClick={() => navigate("/local/connection")}>
                  Connect
                </Button>
              )}
              {joined && (
                <Button type="button" variant="outline" size="sm" onClick={disconnectRemote} disabled={connecting}>
                  {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <LogOut className="h-3.5 w-3.5" />}
                  Disconnect
                </Button>
              )}
            </div>
          </div>
          {(error || status?.remote_error) && (
            <div className="mt-3 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs normal-case text-amber-900">
              {error
                ? `Sync issue: ${error.startsWith("500:") ? "Some local workspace data is unavailable." : error}`
                : status?.remote_error}
            </div>
          )}
        </div>

        <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border bg-card/75 shadow-sm">
          {view !== "chat" && (
          <div className="shrink-0 border-b border-border px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-semibold normal-case text-midground">
              {view === "connection" ? <Server className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              {view === "connection"
                ? "Remote connection"
                : view === "requests"
                  ? "Requests"
                  : view === "skills"
                    ? "Skills"
                    : view === "tools"
                      ? "Tools"
                      : "Cron"}
            </div>
            <p className="mt-1 text-xs normal-case text-muted-foreground">
              {view === "connection"
                ? "Connect this computer to a remote workspace, or use it as your own local social gateway."
                : "Work locally, with access to this device and assigned remote business agents."}
            </p>
          </div>
          )}

          {view === "connection" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)]">
                <form onSubmit={joinWithCredentials} className="space-y-4 rounded-lg border border-border bg-background/30 p-4">
                  <div>
                    <div className="text-sm font-semibold normal-case text-midground">
                      Connect remote workspace
                    </div>
                    <p className="mt-1 text-xs normal-case text-muted-foreground">
                      Use the email and password registered in the remote portal.
                    </p>
                  </div>
                  <label className="block text-xs font-medium normal-case text-muted-foreground">
                    Remote server
                    <Input
                      value={remoteServer}
                      onChange={(event) => setRemoteServer(event.target.value)}
                      placeholder="http://127.0.0.1:9121"
                      className="mt-1 normal-case"
                    />
                  </label>
                  <label className="block text-xs font-medium normal-case text-muted-foreground">
                    Email
                    <Input
                      value={localEmail}
                      onChange={(event) => setLocalEmail(event.target.value)}
                      type="email"
                      placeholder="you@company.com"
                      autoComplete="email"
                      className="mt-1 normal-case"
                    />
                  </label>
                  <label className="block text-xs font-medium normal-case text-muted-foreground">
                    Password
                    <Input
                      value={localPassword}
                      onChange={(event) => setLocalPassword(event.target.value)}
                      type="password"
                      autoComplete="current-password"
                      placeholder="Workspace password"
                      className="mt-1 normal-case"
                    />
                  </label>
                  <label className="block text-xs font-medium normal-case text-muted-foreground">
                    Local device name
                    <Input
                      value={deviceName}
                      onChange={(event) => setDeviceName(event.target.value)}
                      placeholder="Wei Mac"
                      className="mt-1 normal-case"
                    />
                  </label>
                  <Button
                    type="submit"
                    disabled={connecting || !remoteServer.trim() || !localEmail.trim() || !localPassword.trim()}
                  >
                    {connecting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlugZap className="h-3.5 w-3.5" />}
                    Connect
                  </Button>
                </form>

                <div className="space-y-4">
                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold normal-case text-midground">
                      <Server className="h-4 w-4" />
                      Current Connection
                    </div>
                    <div className="grid gap-2 text-xs normal-case text-muted-foreground sm:grid-cols-2">
                      <div className="truncate">Status: {joined ? "Connected" : "Not connected"}</div>
                      <div className="truncate">Remote: {status?.server || remoteServer || "-"}</div>
                      <div className="truncate">User email: {status?.user?.email || "-"}</div>
                      <div className="truncate">User name: {status?.user?.name || "-"}</div>
                      <div className="truncate">User ID: {status?.user?.id || status?.device?.user_id || "-"}</div>
                      <div className="truncate">Device code: {status?.device?.id || "-"}</div>
                      <div className="truncate">Device name: {status?.device?.name || deviceName || "-"}</div>
                      <div className="truncate">Default agent: {status?.agent?.name || status?.default_agent_id || "-"}</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold normal-case text-midground">
                      <PlugZap className="h-4 w-4" />
                      Local Social Binding
                    </div>
                    <p className="text-xs normal-case text-muted-foreground">
                      Bind your own Telegram, WhatsApp, or other gateway account to this local agent when you want
                      messages from your social app to reach your private local agent first.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" size="sm" onClick={() => navigate("/config")}>
                        Open Config
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => navigate("/logs")}>
                        Gateway Logs
                      </Button>
                    </div>
                    <p className="mt-3 text-[11px] normal-case text-muted-foreground">
                      Workspace QR invites are different: those bind invited users to a server-side bot and a remote
                      business agent.
                    </p>
                  </div>
                  <div className="rounded-lg border border-border bg-background/40 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold normal-case text-midground">
                      <Bot className="h-4 w-4" />
                      Assigned Remote Agents
                    </div>
                    <div className="space-y-2">
                      {(status?.agents || []).map((agent) => (
                        <div key={agent.id} className="border border-border bg-card/50 p-2">
                          <div className="truncate text-sm font-semibold normal-case text-midground">
                            {agent.name}
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs normal-case text-muted-foreground">
                            {agent.description || agent.id}
                          </div>
                        </div>
                      ))}
                      {joined && (status?.agents || []).length === 0 && (
                        <div className="text-xs normal-case text-muted-foreground">
                          No business agents assigned.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === "chat" && (
          <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[300px_minmax(0,1fr)]">
            <aside className="hidden min-h-0 flex-col border-r border-border bg-white/55 p-3 lg:flex">
              <div className="mb-3 flex items-center justify-between gap-2 px-1">
                <div className="text-sm font-semibold normal-case text-midground">Recent chats</div>
                {chatHistoryLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
              </div>
              <Button type="button" variant="outline" size="sm" className="mb-3 justify-start" onClick={startNewChat}>
                New chat
              </Button>
              <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
                {!chatHistoryLoading && chatSessions.length === 0 && (
                  <div className="px-1 py-2 text-xs normal-case text-muted-foreground">
                    No local chat history yet.
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
                          {chatSession.title || "Local chat"}
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

            <div className="flex min-h-0 flex-col">
              <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-4">
                <div className="mx-auto flex min-h-full w-full max-w-5xl flex-col justify-end space-y-3">
                  {messages.map((item, index) => (
                    <div
                      key={item.id}
                      className={cn(
                        "max-w-[min(820px,92%)] rounded-lg border border-border px-3 py-2 text-sm leading-relaxed normal-case",
                        item.role === "user"
                          ? "ml-auto bg-foreground/10 text-midground"
                          : "bg-background/55 text-midground",
                      )}
                    >
                      <div className="mb-1 text-[11px] font-medium normal-case text-muted-foreground">
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
                    <div className="flex items-center gap-2 text-xs normal-case text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Local agent is working
                    </div>
                  )}
                </div>
              </div>

              <form onSubmit={sendMessage} className="shrink-0 border-t border-border p-3">
                <div className="mx-auto grid w-full max-w-5xl gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                  <textarea
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    placeholder="Ask locally, or ask me to consult an assigned business agent..."
                    rows={2}
                    className="max-h-36 min-h-12 w-full resize-none rounded-lg border border-border bg-background/40 px-3 py-2 text-sm normal-case placeholder:text-muted-foreground focus-visible:border-foreground/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30"
                  />
                  <div className="flex items-end">
                    <Button type="submit" size="icon" disabled={sending || !input.trim()}>
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </div>
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
              <Input
                value={requestSearch}
                onChange={(event) => setRequestSearch(event.target.value)}
                placeholder="Search by email, device code, agent, request, or response..."
                className="mb-3 normal-case"
              />
              {joined && (
                <div className="mb-3 grid gap-2 rounded-lg border border-border bg-background/35 p-3 font-courier text-xs normal-case text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                  <div className="truncate">Connected user: {status?.user?.email || status?.user?.name || status?.user?.id || "-"}</div>
                  <div className="truncate">Device code: {status?.device?.id || "-"}</div>
                  <div className="truncate">Device: {status?.device?.name || deviceName || "-"}</div>
                  <div className="truncate">Default agent: {status?.agent?.name || status?.default_agent_id || "-"}</div>
                </div>
              )}

              {!joined && (
                <div className="font-courier text-xs normal-case text-muted-foreground">
                  Connect to a remote workspace first.
                </div>
              )}
              {joined && localRequests.length === 0 && (
                <div className="font-courier text-xs normal-case text-muted-foreground">
                  No incoming local-agent requests.
                </div>
              )}
              {joined && localRequests.length > 0 && filteredLocalRequests.length === 0 && (
                <div className="font-courier text-xs normal-case text-muted-foreground">
                  No requests match your search.
                </div>
              )}
              <div className="overflow-hidden rounded-lg border border-border bg-background/30">
                <div className="border-b border-border px-3 py-2 text-xs font-medium normal-case text-muted-foreground">
                  Recent requests
                </div>
                {filteredLocalRequests.map((request) => {
                  const canAnswer =
                    (request.status === "pending" || request.status === "delivered") &&
                    !request.response;
                  return (
                    <button
                      key={request.id}
                      type="button"
                      onClick={() => setSelectedRequestDetail(request)}
                      className="block w-full border-b border-border/60 px-3 py-3 text-left text-xs normal-case transition-colors last:border-b-0 hover:bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-midground">
                              {localRequestLabel(request)}
                            </span>
                            <Badge variant={requestStatusVariant(request.status)}>
                              {request.status}
                            </Badge>
                          </div>
                          <div className="mt-1 truncate text-muted-foreground">
                            {request.agent_name || request.agent_id || "No agent"} · {formatLocalTime(request.created_at)}
                          </div>
                          <div className="mt-1 truncate text-muted-foreground">
                            Device: {request.device_name || "-"} · Request ID: {request.id}
                          </div>
                        </div>
                        {canAnswer && (
                          <span className="shrink-0 rounded-full border border-border bg-white px-2 py-1 text-[10px] text-muted-foreground">
                            action needed
                          </span>
                        )}
                      </div>
                      <p className="mt-2 line-clamp-2 text-muted-foreground">{request.request}</p>
                      {request.response && (
                        <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-midground">{request.response}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {view === "skills" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {panelLoading && <PanelLoading />}
              {!panelLoading && skills.length === 0 && (
                <div className="font-courier text-xs normal-case text-muted-foreground">No local skills found.</div>
              )}
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                <aside className="sm:w-56 sm:shrink-0">
                  <div className="hidden items-center gap-2 px-2 py-2 sm:flex">
                    <Filter className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs font-medium normal-case text-muted-foreground">Filters</span>
                  </div>
                  <div className="flex gap-1 overflow-x-auto p-2 sm:flex-col sm:overflow-x-visible">
                    <button
                      type="button"
                      onClick={() => {
                        setActiveSkillCategory(null);
                        setSkillSearch("");
                      }}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-medium normal-case transition-colors",
                        !activeSkillCategory && !skillSearch.trim()
                          ? "bg-midground text-white"
                          : "text-muted-foreground hover:bg-foreground/5 hover:text-midground",
                      )}
                    >
                      <Package className="h-3.5 w-3.5" />
                      All ({skills.length})
                    </button>
                  </div>
                  {!skillSearch.trim() && skillCategories.length > 0 && (
                    <div className="hidden border-t border-border/50 px-2 pt-2 sm:block">
                      <div className="pb-1 text-[0.7rem] font-medium normal-case text-muted-foreground/70">
                        Categories
                      </div>
                      <div className="max-h-[calc(100vh-360px)] space-y-px overflow-y-auto">
                        {skillCategories.map((category) => {
                          const active = activeSkillCategory === category.key;
                          return (
                            <button
                              key={category.key}
                              type="button"
                              onClick={() => setActiveSkillCategory(active ? null : category.key)}
                              className={cn(
                                "flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-[11px] normal-case transition-colors",
                                active
                                  ? "bg-foreground/10 text-foreground"
                                  : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground",
                              )}
                            >
                              <span className="flex-1 truncate">{category.label}</span>
                              <span className="text-[10px] tabular-nums text-muted-foreground/60">{category.count}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </aside>

                <div className="min-w-0 flex-1">
                  <Input
                    value={skillSearch}
                    onChange={(event) => setSkillSearch(event.target.value)}
                    placeholder="Search skills..."
                    className="mb-3 normal-case"
                  />
                  <div className="rounded-lg border border-transparent bg-white/60">
                    <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
                      <div className="flex items-center gap-2 text-sm font-semibold normal-case text-midground">
                        <Package className="h-4 w-4" />
                        {activeSkillCategory && !skillSearch.trim()
                          ? prettyCategory(activeSkillCategory === "__none__" ? null : activeSkillCategory)
                          : "All"}
                      </div>
                      <span className="rounded-full border border-border bg-background/60 px-2 py-1 text-[10px] normal-case text-muted-foreground">
                        {visibleSkills.length} skills
                      </span>
                    </div>
                    <div className="p-4">
                      {visibleSkills.length === 0 ? (
                        <div className="py-8 text-center text-sm normal-case text-muted-foreground">
                          No skills match your search.
                        </div>
                      ) : (
                        <div className="grid gap-1">
                          {visibleSkills.map((skill) => (
                            <div key={skill.name} className="group flex items-start gap-3 px-3 py-2.5 transition-colors hover:bg-muted/40">
                              <div className="pt-0.5">
                                <Button
                                  type="button"
                                  variant={skill.enabled ? "outline" : "default"}
                                  size="sm"
                                  onClick={() => toggleSkill(skill)}
                                  disabled={busyItem === `skill:${skill.name}`}
                                >
                                  {busyItem === `skill:${skill.name}` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                  {skill.enabled ? "On" : "Enable"}
                                </Button>
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className={cn("font-mono-ui text-sm", skill.enabled ? "text-foreground" : "text-muted-foreground")}>
                                  {skill.name}
                                </div>
                                <div className="mt-1 line-clamp-2 text-sm normal-case text-muted-foreground">
                                  {skill.description || "No description"}
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {view === "tools" && (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {panelLoading && <PanelLoading />}
              {!panelLoading && toolsets.length === 0 && (
                <div className="font-courier text-xs normal-case text-muted-foreground">No local toolsets found.</div>
              )}
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold normal-case text-midground">
                  <Wrench className="h-4 w-4" />
                  Toolsets
                  <span className="text-xs font-normal text-muted-foreground">{filteredToolsets.length}/{toolsets.length}</span>
                </div>
                <Input
                  value={toolSearch}
                  onChange={(event) => setToolSearch(event.target.value)}
                  placeholder="Search tools..."
                  className="normal-case sm:max-w-sm"
                />
              </div>
              {filteredToolsets.length === 0 && toolsets.length > 0 ? (
                <div className="rounded-lg border border-transparent bg-white/60 py-8 text-center text-sm normal-case text-muted-foreground">
                  No tools match your search.
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {filteredToolsets.map((toolset) => (
                    <div key={toolset.name} className="rounded-lg border border-transparent bg-white/60 p-4 shadow-none">
                      <div className="flex items-start gap-3">
                        <Wrench className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="truncate text-sm font-medium normal-case text-midground">
                              {(toolset.label || toolset.name).replace(/^[\p{Emoji}\s]+/u, "").trim()}
                            </span>
                            <span
                              className={cn(
                                "shrink-0 rounded-full border px-2 py-0.5 text-[10px] normal-case",
                                toolset.enabled
                                  ? "border-success/50 text-success"
                                  : "border-border text-muted-foreground",
                              )}
                            >
                              {toolset.enabled ? "Enabled" : "Disabled"}
                            </span>
                          </div>
                          <p className="mb-2 line-clamp-3 text-xs normal-case text-muted-foreground">
                            {toolset.description || toolset.name}
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {(toolset.tools || []).slice(0, 18).map((tool) => (
                              <span key={tool} className="rounded border border-border bg-background/60 px-1.5 py-0.5 font-mono text-[10px] normal-case text-muted-foreground">
                                {tool}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
    </>
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
