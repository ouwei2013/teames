import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useParams } from "react-router-dom";
import {
  Bot,
  BookOpen,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  KeyRound,
  Laptop,
  Loader2,
  MessageSquare,
  Package,
  RefreshCw,
  Send,
  ShieldCheck,
  Ticket,
  UserPlus,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import { Typography } from "@nous-research/ui";
import { Markdown } from "@/components/Markdown";
import { SkillDetailModal } from "@/components/enterprise/SkillDetailModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectOption } from "@/components/ui/select";
import { Toast } from "@/components/Toast";
import { useToast } from "@/hooks/useToast";
import EnterpriseBuilderPage from "@/pages/EnterpriseBuilderPage";
import {
  api,
  streamEnterpriseAdminChat,
  type EnterpriseAgent,
  type EnterpriseAgentPayload,
  type EnterpriseAgentUser,
  type EnterpriseAgentUserDetail,
  type EnterpriseInvite,
  type EnterpriseInviteCreated,
  type EnterpriseLocalDevice,
  type EnterpriseLocalReportPlan,
  type EnterpriseLocalRequest,
  type EnterpriseLocalWebStatus,
  type EnterpriseSocialInvite,
  type EnterpriseSocialInviteCreated,
  type EnterpriseStatusResponse,
  type EnterpriseTelegramGatewayStatus,
  type EnterpriseUser,
  type EnterpriseWhatsAppPairStatus,
  type SessionInfo,
  type SessionMessage,
  type SkillDetail,
  type SkillInfo,
  type ToolsetInfo,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type InviteRole = "member" | "admin";

type AdminModule = "overview" | "agents" | "access" | "local";
type AgentsSection = "agents" | "build";
type BuildAgentsSection = "configuration" | "chat";
type AgentDetailTab = "prompt" | "skills" | "tools" | "reports" | "users";
type ReportDetailTab = "plans" | "requests";
type AccessDetailTab = "invite" | "social" | "users" | "invites";
type LocalDetailTab = "devices" | "requests";

const ADMIN_MODULES: Array<{
  key: AdminModule;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
}> = [
  {
    key: "overview",
    label: "Overview",
    description: "Workspace health and operating state",
    icon: ShieldCheck,
  },
  {
    key: "agents",
    label: "Agents",
    description: "Prompts, skills, cron, and reports by agent",
    icon: Bot,
  },
  {
    key: "access",
    label: "People & Invites",
    description: "Members, QR links, and workspace access",
    icon: UsersRound,
  },
  {
    key: "local",
    label: "My Agent",
    description: "This user's local devices and request log",
    icon: Laptop,
  },
];

const AGENTS_SECTIONS: Array<{
  key: AgentsSection;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
}> = [
  {
    key: "agents",
    label: "Agents",
    description: "View and manage existing workspace agents",
    icon: Bot,
  },
  {
    key: "build",
    label: "Build Agents",
    description: "Create agents with forms or builder chat",
    icon: MessageSquare,
  },
];

const BUILD_AGENT_SECTIONS: Array<{
  key: BuildAgentsSection;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
}> = [
  {
    key: "configuration",
    label: "Configuration",
    description: "Create an agent by setting prompts, knowledge, skills, and tools",
    icon: Bot,
  },
  {
    key: "chat",
    label: "Builder Chat",
    description: "Describe the agent and let the builder generate workspace assets",
    icon: MessageSquare,
  },
];

const REPORT_DETAIL_TABS: Array<{
  key: ReportDetailTab;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
}> = [
  {
    key: "plans",
    label: "Scheduled Reports",
    description: "Cron plans for local-agent reports",
    icon: CalendarClock,
  },
  {
    key: "requests",
    label: "Local Requests",
    description: "Ad-hoc requests and responses",
    icon: MessageSquare,
  },
];

const ACCESS_DETAIL_TABS: Array<{
  key: AccessDetailTab;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
}> = [
  {
    key: "invite",
    label: "Invite User",
    description: "Create invite codes and choose accessible agents",
    icon: UserPlus,
  },
  {
    key: "users",
    label: "Users",
    description: "Workspace members and roles",
    icon: UsersRound,
  },
  {
    key: "social",
    label: "Social QR",
    description: "QR invites for messaging gateways",
    icon: MessageSquare,
  },
  {
    key: "invites",
    label: "Invites",
    description: "Existing invite state and agent access",
    icon: Ticket,
  },
];

const LOCAL_DETAIL_TABS: Array<{
  key: LocalDetailTab;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
}> = [
  {
    key: "devices",
    label: "Devices",
    description: "Connected local agents and device status",
    icon: Laptop,
  },
  {
    key: "requests",
    label: "Request Log",
    description: "Global local-agent request history",
    icon: MessageSquare,
  },
];

const AGENT_DETAIL_TABS: Array<{
  key: AgentDetailTab;
  label: string;
  description: string;
  icon: typeof ShieldCheck;
}> = [
  {
    key: "prompt",
    label: "Prompt",
    description: "Role, tasks, tone, and knowledge",
    icon: Bot,
  },
  {
    key: "skills",
    label: "Skills",
    description: "Business and built-in skills",
    icon: Package,
  },
  {
    key: "tools",
    label: "Tools",
    description: "Available Hermes toolsets",
    icon: Wrench,
  },
  {
    key: "reports",
    label: "Reports",
    description: "Cron plans and local requests",
    icon: CalendarClock,
  },
  {
    key: "users",
    label: "Users",
    description: "Assigned users and private state",
    icon: UsersRound,
  },
];

function formatDate(value?: number | null): string {
  if (!value) return "Never";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value * 1000));
}

function inviteState(invite: Pick<EnterpriseInvite, "revoked_at" | "expires_at" | "uses" | "max_uses">): {
  label: string;
  variant: "default" | "secondary" | "outline" | "success" | "warning" | "destructive";
} {
  const now = Date.now() / 1000;
  if (invite.revoked_at) return { label: "Revoked", variant: "outline" };
  if (invite.expires_at && invite.expires_at <= now) {
    return { label: "Expired", variant: "warning" };
  }
  if (invite.uses >= invite.max_uses) return { label: "Used", variant: "secondary" };
  return { label: "Active", variant: "success" };
}

type CombinedInviteRow = {
  id: string;
  kind: "email" | "qr";
  status: ReturnType<typeof inviteState>;
  recipient: string;
  agentLabel: string;
  channelLabel: string;
  uses: string;
  expires_at?: number | null;
  created_at: number;
};

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

function skillIdentity(skill: Pick<SkillInfo, "name" | "source">): string {
  return `${skill.source || "builtin"}:${skill.name}`;
}

function localDeviceLabel(device: EnterpriseLocalDevice): string {
  return `${device.id} · ${device.user_email || device.user_id || "unknown user"}`;
}

function localRequestLabel(request: EnterpriseLocalRequest): string {
  return `${request.device_id} · ${request.user_email || request.user_name || "unknown user"}`;
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

function LocalRequestDetailModal({
  request,
  onClose,
}: {
  request: EnterpriseLocalRequest | null;
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

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/85 p-3 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      onMouseDown={onClose}
    >
      <div
        className="flex max-h-[88dvh] w-full max-w-5xl min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border px-4 py-4 sm:px-5">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <Badge variant={request.status === "responded" ? "success" : request.status === "rejected" ? "warning" : "outline"}>
                {request.status}
              </Badge>
              <span className="text-xs normal-case text-muted-foreground">
                {new Date(request.created_at * 1000).toLocaleString()}
              </span>
            </div>
            <h2 className="truncate text-xl font-semibold normal-case text-midground">
              {localRequestLabel(request)}
            </h2>
            <p className="mt-1 text-sm normal-case text-muted-foreground">
              {request.device_name || "Local device"} · {request.agent_name || request.agent_id}
            </p>
            <div className="mt-3 grid gap-1 text-xs normal-case text-muted-foreground sm:grid-cols-2">
              <span className="truncate">User: {request.user_email || request.user_name || request.user_id || "-"}</span>
              <span className="truncate">Device code: {request.device_id || "-"}</span>
              <span className="truncate">Agent: {request.agent_name || request.agent_id || "-"}</span>
              <span className="truncate">Request ID: {request.id}</span>
            </div>
          </div>
          <Button type="button" variant="outline" size="icon" onClick={onClose} aria-label="Close request details">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
            <section className="min-w-0 rounded-lg border border-border bg-background/60 p-4">
              <div className="mb-2 text-xs font-medium normal-case text-muted-foreground">Request</div>
              <div className="whitespace-pre-wrap text-sm normal-case text-midground">
                {request.request}
              </div>
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

function compactText(value?: string | null, max = 180): string {
  const text = (value || "").replace(/\s+/g, " ").trim();
  if (!text) return "No description";
  return text.length > max ? `${text.slice(0, max).trim()}...` : text;
}

export default function EnterpriseAdminPage() {
  const { agentId: routeAgentId, userId: routeUserId } = useParams<{
    agentId?: string;
    userId?: string;
  }>();
  const { toast, showToast } = useToast();
  const [status, setStatus] = useState<EnterpriseStatusResponse | null>(null);
  const [users, setUsers] = useState<EnterpriseUser[]>([]);
  const [agents, setAgents] = useState<EnterpriseAgent[]>([]);
  const [invites, setInvites] = useState<EnterpriseInvite[]>([]);
  const [socialInvites, setSocialInvites] = useState<EnterpriseSocialInvite[]>([]);
  const [localDevices, setLocalDevices] = useState<EnterpriseLocalDevice[]>([]);
  const [localRequests, setLocalRequests] = useState<EnterpriseLocalRequest[]>([]);
  const [localReportPlans, setLocalReportPlans] = useState<EnterpriseLocalReportPlan[]>([]);
  const [localWebStatus, setLocalWebStatus] = useState<EnterpriseLocalWebStatus | null>(null);
  const [agentUsers, setAgentUsers] = useState<EnterpriseAgentUser[]>([]);
  const [selectedAgentUserId, setSelectedAgentUserId] = useState("");
  const [agentUserDetail, setAgentUserDetail] = useState<EnterpriseAgentUserDetail | null>(null);
  const [agentUserDetailOpen, setAgentUserDetailOpen] = useState(false);
  const [expandedAgentUserSessionId, setExpandedAgentUserSessionId] = useState("");
  const [agentUserSessionMessages, setAgentUserSessionMessages] = useState<Record<string, SessionMessage[]>>({});
  const [skillCatalog, setSkillCatalog] = useState<SkillInfo[]>([]);
  const [toolsets, setToolsets] = useState<ToolsetInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAgentUsers, setLoadingAgentUsers] = useState(false);
  const [loadingAgentUserDetail, setLoadingAgentUserDetail] = useState(false);
  const [savingInit, setSavingInit] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [creatingSocialInvite, setCreatingSocialInvite] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminApiKey, setAdminApiKey] = useState("");
  const [latestInvite, setLatestInvite] = useState<EnterpriseInviteCreated | null>(null);
  const [latestSocialInvite, setLatestSocialInvite] = useState<EnterpriseSocialInviteCreated | null>(null);
  const [weixinQrStatus, setWeixinQrStatus] = useState("");
  const [whatsappPair, setWhatsappPair] = useState<EnterpriseWhatsAppPairStatus | null>(null);
  const [pairingWhatsapp, setPairingWhatsapp] = useState(false);
  const [telegramGateway, setTelegramGateway] = useState<EnterpriseTelegramGatewayStatus | null>(null);
  const [telegramBotToken, setTelegramBotToken] = useState("");
  const [savingTelegramBot, setSavingTelegramBot] = useState(false);
  const [refreshingTelegramBot, setRefreshingTelegramBot] = useState(false);
  const knowledgeFileRef = useRef<HTMLInputElement | null>(null);

  const [tenantName, setTenantName] = useState("");
  const [tenantId, setTenantId] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminName, setAdminName] = useState("");

  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("member");
  const [maxUses, setMaxUses] = useState("1");
  const [expiresDays, setExpiresDays] = useState("7");
  const [inviteAgentIds, setInviteAgentIds] = useState<string[]>([]);
  const [socialAgentId, setSocialAgentId] = useState("");
  const [socialPlatform, setSocialPlatform] = useState("weixin");
  const [socialLabel, setSocialLabel] = useState("");
  const [selectedLocalDeviceId, setSelectedLocalDeviceId] = useState("");
  const [localRequestText, setLocalRequestText] = useState("");
  const [sendingLocalRequest, setSendingLocalRequest] = useState(false);
  const [reportPlanName, setReportPlanName] = useState("");
  const [reportPlanSchedule, setReportPlanSchedule] = useState("");
  const [reportPlanRequest, setReportPlanRequest] = useState("");
  const [creatingReportPlan, setCreatingReportPlan] = useState(false);
  const [joiningWorkspace, setJoiningWorkspace] = useState(false);
  const [joinServer, setJoinServer] = useState("http://127.0.0.1:9119");
  const [joinInviteCode, setJoinInviteCode] = useState("");
  const [joinPassword, setJoinPassword] = useState("");
  const [joinDeviceName, setJoinDeviceName] = useState("");
  const [selectedRequestId, setSelectedRequestId] = useState("");
  const [catalogAgentId, setCatalogAgentId] = useState("");
  const [catalogSkillSearch, setCatalogSkillSearch] = useState("");
  const [toolSearch, setToolSearch] = useState("");
  const [loadingCatalog, setLoadingCatalog] = useState(false);
  const [busyCatalogSkill, setBusyCatalogSkill] = useState("");
  const [expandedCatalogSkill, setExpandedCatalogSkill] = useState("");
  const [loadingCatalogSkill, setLoadingCatalogSkill] = useState("");
  const [catalogSkillDetails, setCatalogSkillDetails] = useState<Record<string, SkillDetail>>({});
  const [activeModule, setActiveModule] = useState<AdminModule>("overview");
  const [activeAgentsSection, setActiveAgentsSection] = useState<AgentsSection>("agents");
  const [activeBuildAgentsSection, setActiveBuildAgentsSection] = useState<BuildAgentsSection>("configuration");
  const [activeAgentTab, setActiveAgentTab] = useState<AgentDetailTab>("prompt");
  const [activeReportTab, setActiveReportTab] = useState<ReportDetailTab>("plans");
  const [activeAccessTab, setActiveAccessTab] = useState<AccessDetailTab>("invite");
  const [activeLocalTab, setActiveLocalTab] = useState<LocalDetailTab>("devices");
  const [selectedRequestDetail, setSelectedRequestDetail] = useState<EnterpriseLocalRequest | null>(null);

  const [editingAgentId, setEditingAgentId] = useState<string | null>(null);
  const [agentForm, setAgentForm] = useState<EnterpriseAgentPayload>({
    name: "",
    description: "",
    role_prompt: "",
    task_prompt: "",
    tone_prompt: "",
    instructions: "",
    escalation_prompt: "",
    knowledge: "",
  });

  const initialized = Boolean(status?.initialized && status.tenant);
  const showAgentUserDetail = agentUserDetailOpen;
  const isWhatsAppSocialPlatform = socialPlatform === "whatsapp";
  const whatsappGatewayPaired = whatsappPair?.status === "connected";
  const isTelegramSocialPlatform = socialPlatform === "telegram";
  const telegramGatewayReady = telegramGateway?.status === "connected" && Boolean(telegramGateway.username);
  const visibleSocialInvite =
    latestSocialInvite && latestSocialInvite.link.platform === socialPlatform
      ? latestSocialInvite
      : null;
  const inviteUrl = useMemo(() => {
    if (!latestInvite?.code) return "";
    return `${window.location.origin}/accept-invite?code=${encodeURIComponent(latestInvite.code)}`;
  }, [latestInvite]);
  const selectedLocalRequest = useMemo(
    () => localRequests.find((item) => item.id === selectedRequestId) || localRequests[0],
    [localRequests, selectedRequestId],
  );
  const selectedCatalogSkill = useMemo(
    () => skillCatalog.find((skill) => skillIdentity(skill) === expandedCatalogSkill) || null,
    [expandedCatalogSkill, skillCatalog],
  );
  const selectedAgent = useMemo(
    () => agents.find((agent) => agent.id === catalogAgentId) || null,
    [agents, catalogAgentId],
  );
  const remoteAgents = useMemo(
    () => localWebStatus?.agents || [],
    [localWebStatus?.agents],
  );
  const combinedInvites = useMemo<CombinedInviteRow[]>(() => {
    const emailRows: CombinedInviteRow[] = invites.map((invite, index) => ({
      id: `email-${invite.created_at}-${index}`,
      kind: "email",
      status: inviteState(invite),
      recipient: invite.email || "Any email",
      agentLabel: (invite.agent_names || []).join(", ") || "Default Agent",
      channelLabel: invite.role,
      uses: `${invite.uses}/${invite.max_uses}`,
      expires_at: invite.expires_at,
      created_at: invite.created_at,
    }));
    const socialRows: CombinedInviteRow[] = socialInvites.map((invite, index) => {
      const platform = (invite.platform || "gateway").trim();
      return {
        id: `qr-${invite.created_at}-${index}`,
        kind: "qr",
        status: inviteState(invite),
        recipient: invite.label || `${platform.toUpperCase()} QR`,
        agentLabel: invite.agent_name || invite.agent_id || "Default Agent",
        channelLabel: platform,
        uses: `${invite.uses}/${invite.max_uses}`,
        expires_at: invite.expires_at,
        created_at: invite.created_at,
      };
    });
    return [...emailRows, ...socialRows].sort((a, b) => b.created_at - a.created_at);
  }, [invites, socialInvites]);
  const selectedAgentUser = useMemo(
    () => agentUsers.find((user) => user.id === selectedAgentUserId) || agentUsers[0] || null,
    [agentUsers, selectedAgentUserId],
  );
  const agentDevices = useMemo(
    () => selectedAgent ? localDevices.filter((device) => device.agent_id === selectedAgent.id) : [],
    [localDevices, selectedAgent],
  );
  const agentLocalRequests = useMemo(
    () => selectedAgent ? localRequests.filter((request) => request.agent_id === selectedAgent.id) : [],
    [localRequests, selectedAgent],
  );
  const agentReportPlans = useMemo(() => {
    if (!selectedAgent) return [];
    const deviceIds = new Set(agentDevices.map((device) => device.id));
    return localReportPlans.filter((plan) => plan.agent_id === selectedAgent.id || (plan.device_id ? deviceIds.has(plan.device_id) : false));
  }, [agentDevices, localReportPlans, selectedAgent]);
  const filteredSkillCatalog = useMemo(
    () =>
      skillCatalog.filter((skill) =>
        matchesText(
          catalogSkillSearch,
          skill.name,
          skill.description,
          skill.category,
          skill.source,
          skill.allowed ? "visible" : "hidden",
          skill.enabled ? "enabled" : "disabled",
          skill.skill_dir,
        ),
      ),
    [catalogSkillSearch, skillCatalog],
  );
  const filteredToolsets = useMemo(
    () =>
      toolsets.filter((toolset) =>
        matchesText(
          toolSearch,
          toolset.name,
          toolset.label,
          toolset.description,
          toolset.enabled ? "enabled available" : "disabled off",
          toolset.configured ? "configured" : "not configured",
          ...(toolset.tools || []),
        ),
      ),
    [toolsets, toolSearch],
  );
  async function loadEnterprise() {
    setLoading(true);
    setError(null);
    try {
      api
        .getEnterpriseLocalWebStatus()
        .then((localStatus) => {
          setLocalWebStatus(localStatus);
          if (localStatus.server) setJoinServer(localStatus.server);
        })
        .catch(() => {
          setLocalWebStatus(null);
        });
      const nextStatus = await api.getEnterpriseStatus();
      setStatus(nextStatus);
      setUsers(nextStatus.users || []);
      setAgents(nextStatus.agents || []);
      if (nextStatus.initialized) {
        const [
          userResult,
          agentResult,
          inviteResult,
          socialInviteResult,
          deviceResult,
          requestResult,
          reportPlanResult,
          toolsetResult,
        ] = await Promise.all([
          api.getEnterpriseUsers(),
          api.getEnterpriseAgents(),
          api.getEnterpriseInvites(),
          api.getEnterpriseSocialInvites(),
          api.getEnterpriseLocalDevices(),
          api.getEnterpriseLocalRequests(),
          api.getEnterpriseLocalReportPlans(),
          api.getToolsets(),
        ]);
        setUsers(userResult.users || []);
        setAgents(agentResult.agents || []);
        setCatalogAgentId((current) => {
          if (current && (agentResult.agents || []).some((agent) => agent.id === current)) {
            return current;
          }
          return agentResult.agents?.[0]?.id || "";
        });
        setInviteAgentIds((current) => {
          const valid = new Set((agentResult.agents || []).map((agent) => agent.id));
          const kept = current.filter((id) => valid.has(id));
          return kept.length ? kept : (agentResult.agents[0] ? [agentResult.agents[0].id] : []);
        });
        setSocialAgentId((current) => {
          if (current && (agentResult.agents || []).some((agent) => agent.id === current)) {
            return current;
          }
          return agentResult.agents?.[0]?.id || "";
        });
        setInvites(inviteResult.invites || []);
        setSocialInvites(socialInviteResult.invites || []);
        setLocalDevices(deviceResult.devices || []);
        setLocalRequests(requestResult.requests || []);
        setLocalReportPlans(reportPlanResult.plans || []);
        setToolsets(toolsetResult || []);
        setSelectedLocalDeviceId((current) => {
          if (current && (deviceResult.devices || []).some((device) => device.id === current)) {
            return current;
          }
          return deviceResult.devices?.[0]?.id || "";
        });
      } else {
        setAgents([]);
        setCatalogAgentId("");
        setSkillCatalog([]);
        setInvites([]);
        setSocialInvites([]);
        setLocalDevices([]);
        setLocalRequests([]);
        setLocalReportPlans([]);
        setAgentUsers([]);
        setAgentUserDetail(null);
        setToolsets([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function joinRemoteWorkspace(event: FormEvent) {
    event.preventDefault();
    const server = joinServer.trim();
    const code = joinInviteCode.trim();
    const password = joinPassword.trim();
    if (!server || !code || !password) return;
    setJoiningWorkspace(true);
    setError(null);
    try {
      const next = await api.joinEnterpriseLocalWeb({
        server,
        code,
        password,
        name: joinDeviceName.trim() || undefined,
      });
      setLocalWebStatus(next);
      setJoinInviteCode("");
      setJoinPassword("");
      showToast("Joined remote workspace", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      showToast("Join remote workspace failed", "error");
    } finally {
      setJoiningWorkspace(false);
    }
  }

  useEffect(() => {
    void loadEnterprise();
  }, []);

  useEffect(() => {
    if (!routeAgentId) return;
    setActiveModule("agents");
    setActiveAgentTab("users");
    setCatalogAgentId(routeAgentId);
    if (routeUserId) {
      setSelectedAgentUserId(routeUserId);
      setAgentUserDetailOpen(true);
    }
  }, [routeAgentId, routeUserId]);

  useEffect(() => {
    if (!catalogAgentId) {
      setSkillCatalog([]);
      setExpandedCatalogSkill("");
      setCatalogSkillDetails({});
      setAgentUsers([]);
      setSelectedAgentUserId("");
      setAgentUserDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingCatalog(true);
    setExpandedCatalogSkill("");
    setCatalogSkillDetails({});
    api
      .getEnterpriseAgentSkillCatalog(catalogAgentId)
      .then((result) => {
        if (!cancelled) setSkillCatalog(result.skills || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingCatalog(false);
      });
    return () => {
      cancelled = true;
    };
  }, [catalogAgentId]);

  useEffect(() => {
    if (!catalogAgentId) {
      setAgentUsers([]);
      setSelectedAgentUserId("");
      setAgentUserDetail(null);
      return;
    }
    let cancelled = false;
    setLoadingAgentUsers(true);
    api
      .getEnterpriseAgentUsers(catalogAgentId)
      .then((result) => {
        if (cancelled) return;
        const nextUsers = result.users || [];
        setAgentUsers(nextUsers);
        setSelectedAgentUserId((current) => {
          if (current && nextUsers.some((user) => user.id === current)) return current;
          return nextUsers[0]?.id || "";
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingAgentUsers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [catalogAgentId]);

  useEffect(() => {
    if (!catalogAgentId || !selectedAgentUserId) {
      setAgentUserDetail(null);
      setExpandedAgentUserSessionId("");
      setAgentUserSessionMessages({});
      return;
    }
    let cancelled = false;
    setLoadingAgentUserDetail(true);
    api
      .getEnterpriseAgentUserDetail(catalogAgentId, selectedAgentUserId)
      .then((result) => {
        if (!cancelled) {
          setAgentUserDetail(result);
          setExpandedAgentUserSessionId("");
          setAgentUserSessionMessages({});
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoadingAgentUserDetail(false);
      });
    return () => {
      cancelled = true;
    };
  }, [catalogAgentId, selectedAgentUserId]);

  useEffect(() => {
    if (!selectedAgent || editingAgentId === selectedAgent.id) return;
    setEditingAgentId(selectedAgent.id);
    setAgentForm({
      name: selectedAgent.name || "",
      description: selectedAgent.description || "",
      role_prompt: selectedAgent.role_prompt || "",
      task_prompt: selectedAgent.task_prompt || "",
      tone_prompt: selectedAgent.tone_prompt || "",
      instructions: selectedAgent.instructions || "",
      escalation_prompt: selectedAgent.escalation_prompt || "",
      knowledge: selectedAgent.knowledge || "",
      status: selectedAgent.status || "active",
    });
  }, [editingAgentId, selectedAgent]);

  useEffect(() => {
    if (!selectedAgent || agentDevices.length === 0) return;
    if (agentDevices.some((device) => device.id === selectedLocalDeviceId)) return;
    setSelectedLocalDeviceId(agentDevices[0].id);
  }, [agentDevices, selectedAgent, selectedLocalDeviceId]);

  useEffect(() => {
    if (socialPlatform !== "whatsapp") return;
    let cancelled = false;
    api
      .getEnterpriseWhatsAppPairCurrentStatus()
      .then((result) => {
        if (cancelled) return;
        setWhatsappPair(result);
      })
      .catch(() => {
        if (cancelled) return;
        setWhatsappPair(null);
      });
    return () => {
      cancelled = true;
    };
  }, [socialPlatform]);

  useEffect(() => {
    if (socialPlatform !== "telegram") return;
    let cancelled = false;
    api
      .getEnterpriseTelegramGatewayStatus()
      .then((result) => {
        if (cancelled) return;
        setTelegramGateway(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setTelegramGateway({
          status: "unreachable",
          message: err instanceof Error ? err.message : String(err),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [socialPlatform]);

  useEffect(() => {
    const qrId = latestSocialInvite?.link?.qr_id;
    if (!qrId || latestSocialInvite.link.platform !== "weixin") {
      setWeixinQrStatus("");
      return;
    }
    let cancelled = false;
    setWeixinQrStatus("waiting");
    const timer = window.setInterval(() => {
      api
        .getEnterpriseWeixinSocialQrStatus(qrId)
        .then((result) => {
          if (cancelled) return;
          setWeixinQrStatus(result.status || "");
          if (result.confirmed) {
            window.clearInterval(timer);
            showToast("WeChat account connected", "success");
            void loadEnterprise();
          }
        })
        .catch((err) => {
          if (cancelled) return;
          setWeixinQrStatus(err instanceof Error ? err.message : String(err));
        });
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [latestSocialInvite?.link?.platform, latestSocialInvite?.link?.qr_id]);

  useEffect(() => {
    if (!whatsappPair?.id || ["connected", "failed"].includes(whatsappPair.status)) return;
    let cancelled = false;
    const timer = window.setInterval(() => {
      api
        .getEnterpriseWhatsAppPairStatus(whatsappPair.id)
        .then((result) => {
          if (cancelled) return;
          setWhatsappPair(result);
          if (result.status === "connected") {
            window.clearInterval(timer);
            showToast("WhatsApp gateway paired", "success");
          }
        })
        .catch((err) => {
          if (cancelled) return;
          setWhatsappPair((current) => ({
            id: current?.id || "",
            status: "failed",
            message: err instanceof Error ? err.message : String(err),
          }));
        });
    }, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [whatsappPair?.id, whatsappPair?.status]);

  async function initializeEnterprise(event: FormEvent) {
    event.preventDefault();
    setSavingInit(true);
    setError(null);
    try {
      const result = await api.initEnterprise({
        name: tenantName.trim(),
        tenant_id: tenantId.trim() || undefined,
        admin_email: adminEmail.trim() || undefined,
        admin_name: adminName.trim() || undefined,
      });
      setAdminApiKey(result.admin_api_key || "");
      setStatus({
        initialized: true,
        tenant: result.tenant,
        users: result.admin_user ? [result.admin_user] : [],
      });
      showToast("Workspace initialized", "success");
      await loadEnterprise();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      showToast("Initialization failed", "error");
    } finally {
      setSavingInit(false);
    }
  }

  async function createInvite(event: FormEvent) {
    event.preventDefault();
    setCreatingInvite(true);
    setError(null);
    try {
      const created = await api.createEnterpriseInvite({
        email: inviteEmail.trim() || undefined,
        role: inviteRole,
        max_uses: Math.max(1, Number.parseInt(maxUses, 10) || 1),
        expires_days: expiresDays.trim()
          ? Math.max(1, Number.parseInt(expiresDays, 10) || 7)
          : undefined,
        agent_ids: inviteAgentIds,
      });
      setLatestInvite(created);
      setInviteEmail("");
      showToast("Invite created", "success");
      await loadEnterprise();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      showToast("Invite creation failed", "error");
    } finally {
      setCreatingInvite(false);
    }
  }

  async function createSocialInvite(event?: { preventDefault: () => void }) {
    event?.preventDefault();
    if (!socialAgentId) return;
    if (socialPlatform === "whatsapp" && !whatsappGatewayPaired) {
      showToast("Pair the server WhatsApp bot first", "error");
      return;
    }
    if (socialPlatform === "telegram" && !telegramGatewayReady) {
      showToast("Configure the server Telegram bot first", "error");
      return;
    }
    setCreatingSocialInvite(true);
    setError(null);
    try {
      const created = await api.createEnterpriseSocialInvite({
        agent_id: socialAgentId,
        platform: socialPlatform,
        label: socialLabel.trim() || undefined,
        max_uses: 1,
        expires_days: 7,
      });
      setLatestSocialInvite(created);
      setSocialLabel("");
      showToast("Social QR invite created", "success");
      await loadEnterprise();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      showToast(`Social QR invite failed: ${message}`, "error");
    } finally {
      setCreatingSocialInvite(false);
    }
  }

  async function pairWhatsAppGateway() {
    setPairingWhatsapp(true);
    setError(null);
    try {
      const result = await api.createEnterpriseWhatsAppPair();
      setWhatsappPair(result);
      if (result.status === "connected") {
        showToast("WhatsApp gateway paired", "success");
      } else if (result.qr_image) {
        showToast("Scan the WhatsApp pairing QR", "success");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      showToast("WhatsApp pairing failed", "error");
    } finally {
      setPairingWhatsapp(false);
    }
  }

  async function refreshTelegramGatewayStatus() {
    setRefreshingTelegramBot(true);
    setError(null);
    try {
      const result = await api.getEnterpriseTelegramGatewayStatus(true);
      setTelegramGateway(result);
      if (result.status === "connected") {
        showToast("Telegram bot is configured", "success");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      showToast("Telegram status refresh failed", "error");
    } finally {
      setRefreshingTelegramBot(false);
    }
  }

  async function configureTelegramGateway() {
    const token = telegramBotToken.trim();
    if (!token) {
      showToast("Enter a Telegram bot token", "error");
      return;
    }
    setSavingTelegramBot(true);
    setError(null);
    try {
      const result = await api.configureEnterpriseTelegramGateway({ token });
      setTelegramGateway(result);
      setTelegramBotToken("");
      showToast("Telegram bot configured", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      showToast("Telegram bot configuration failed", "error");
    } finally {
      setSavingTelegramBot(false);
    }
  }

  async function toggleCatalogSkill(skill: SkillInfo) {
    if (!catalogAgentId) return;
    setBusyCatalogSkill(skill.name);
    setError(null);
    try {
      await api.toggleEnterpriseAgentSkillCatalog({
        agent_id: catalogAgentId,
        name: skill.name,
        enabled: !skill.allowed,
      });
      setSkillCatalog((current) =>
        current.map((item) =>
          item.name === skill.name ? { ...item, allowed: !skill.allowed } : item,
        ),
      );
      showToast(!skill.allowed ? "Skill allowed" : "Skill hidden", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      showToast("Skill catalog update failed", "error");
    } finally {
      setBusyCatalogSkill("");
    }
  }

  async function openCatalogSkill(skill: SkillInfo) {
    if (!catalogAgentId) return;
    const key = skillIdentity(skill);
    if (expandedCatalogSkill === key) {
      setExpandedCatalogSkill("");
      return;
    }
    setExpandedCatalogSkill(key);
    if (catalogSkillDetails[key]) return;
    setLoadingCatalogSkill(key);
    setError(null);
    try {
      const detail = await api.getEnterpriseAgentSkillDetail(catalogAgentId, skill.name);
      setCatalogSkillDetails((current) => ({ ...current, [key]: detail }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      showToast("Failed to open skill", "error");
    } finally {
      setLoadingCatalogSkill("");
    }
  }

  async function copyAndToast(value: string, label: string) {
    try {
      await copyText(value);
      showToast(`${label} copied`, "success");
    } catch {
      showToast("Copy failed", "error");
    }
  }

  function openAgentUser(user: EnterpriseAgentUser) {
    const agentId = selectedAgent?.id || catalogAgentId;
    if (!agentId) return;
    setSelectedAgentUserId(user.id);
    setAgentUserDetailOpen(true);
  }

  async function toggleAgentUserSession(session: SessionInfo) {
    if (expandedAgentUserSessionId === session.id) {
      setExpandedAgentUserSessionId("");
      return;
    }
    setExpandedAgentUserSessionId(session.id);
    if (agentUserSessionMessages[session.id] || !catalogAgentId || !selectedAgentUserId) return;
    setError(null);
    try {
      const result = await api.getEnterpriseAgentUserSessionMessages(
        catalogAgentId,
        selectedAgentUserId,
        session.id,
      );
      setAgentUserSessionMessages((current) => ({
        ...current,
        [session.id]: result.messages || [],
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      showToast("Failed to load session messages", "error");
    }
  }

  function resetAgentForm() {
    setEditingAgentId(null);
    setAgentForm({
      name: "",
      description: "",
      role_prompt: "",
      task_prompt: "",
      tone_prompt: "",
      instructions: "",
      escalation_prompt: "",
      knowledge: "",
    });
  }

  function editAgent(agent: EnterpriseAgent) {
    setCatalogAgentId(agent.id);
    setEditingAgentId(agent.id);
    setAgentForm({
      name: agent.name || "",
      description: agent.description || "",
      role_prompt: agent.role_prompt || "",
      task_prompt: agent.task_prompt || "",
      tone_prompt: agent.tone_prompt || "",
      instructions: agent.instructions || "",
      escalation_prompt: agent.escalation_prompt || "",
      knowledge: agent.knowledge || "",
      status: agent.status || "active",
    });
  }

  async function saveAgent(event: FormEvent) {
    event.preventDefault();
    setSavingAgent(true);
    setError(null);
    try {
      if (editingAgentId) {
        await api.updateEnterpriseAgent(editingAgentId, agentForm);
        showToast("Agent updated", "success");
      } else {
        await api.createEnterpriseAgent(agentForm);
        showToast("Agent created", "success");
      }
      resetAgentForm();
      await loadEnterprise();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      showToast("Agent save failed", "error");
    } finally {
      setSavingAgent(false);
    }
  }

  function renderAgentConfigurationForm() {
    return (
      <form onSubmit={saveAgent} className="grid gap-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium normal-case text-muted-foreground">
            Agent name
          </span>
          <Input
            value={agentForm.name}
            onChange={(event) => setAgentForm({ ...agentForm, name: event.target.value })}
            required
            className="normal-case"
            placeholder="Customer Support Agent"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium normal-case text-muted-foreground">
            Business description
          </span>
          <Textarea
            value={agentForm.description || ""}
            onChange={(value) => setAgentForm({ ...agentForm, description: value })}
            placeholder="What kind of business this agent serves."
          />
        </label>
        <div className="grid gap-3 lg:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium normal-case text-muted-foreground">Role</span>
            <Textarea
              value={agentForm.role_prompt || ""}
              onChange={(value) => setAgentForm({ ...agentForm, role_prompt: value })}
              placeholder="Who the agent is."
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium normal-case text-muted-foreground">Tasks</span>
            <Textarea
              value={agentForm.task_prompt || ""}
              onChange={(value) => setAgentForm({ ...agentForm, task_prompt: value })}
              placeholder="What the agent should accomplish."
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium normal-case text-muted-foreground">Tone</span>
            <Textarea
              value={agentForm.tone_prompt || ""}
              onChange={(value) => setAgentForm({ ...agentForm, tone_prompt: value })}
              placeholder="How the agent should communicate."
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium normal-case text-muted-foreground">Escalation</span>
            <Textarea
              value={agentForm.escalation_prompt || ""}
              onChange={(value) => setAgentForm({ ...agentForm, escalation_prompt: value })}
              placeholder="When to hand off to a human."
            />
          </label>
        </div>
        <label className="block">
          <span className="mb-1 block text-xs font-medium normal-case text-muted-foreground">
            Instructions
          </span>
          <Textarea
            value={agentForm.instructions || ""}
            onChange={(value) => setAgentForm({ ...agentForm, instructions: value })}
            placeholder="Policies, boundaries, required behavior."
            rows={4}
          />
        </label>
        <label className="block">
          <span className="mb-1 flex items-center justify-between gap-2 text-xs font-medium normal-case text-muted-foreground">
            <span>Knowledge</span>
            <Button type="button" variant="outline" size="sm" onClick={() => knowledgeFileRef.current?.click()}>
              Import Text
            </Button>
          </span>
          <input
            ref={knowledgeFileRef}
            type="file"
            accept=".txt,.md,.csv,.json,text/plain,text/markdown,text/csv,application/json"
            className="hidden"
            onChange={importKnowledgeFile}
          />
          <Textarea
            value={agentForm.knowledge || ""}
            onChange={(value) => setAgentForm({ ...agentForm, knowledge: value })}
            placeholder="Paste FAQs, business facts, product info, policies, or source notes."
            rows={5}
          />
        </label>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={savingAgent || !agentForm.name.trim()}>
            {savingAgent && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {editingAgentId ? "Update Agent" : "Create Agent"}
          </Button>
          {editingAgentId && (
            <Button type="button" variant="outline" onClick={resetAgentForm}>
              Cancel
            </Button>
          )}
        </div>
      </form>
    );
  }

  function toggleInviteAgent(agentId: string) {
    setInviteAgentIds((current) => {
      if (current.includes(agentId)) {
        const next = current.filter((id) => id !== agentId);
        return next.length ? next : current;
      }
      return [...current, agentId];
    });
  }

  async function importKnowledgeFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const trimmed = text.trim();
      if (!trimmed) {
        showToast("File is empty", "error");
        return;
      }
      setAgentForm((current) => ({
        ...current,
        knowledge: [current.knowledge?.trim(), trimmed].filter(Boolean).join("\n\n"),
      }));
      showToast("Knowledge imported", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      showToast("Import failed", "error");
    } finally {
      event.target.value = "";
    }
  }

  async function sendLocalRequest(event: FormEvent) {
    event.preventDefault();
    if (!selectedLocalDeviceId || !localRequestText.trim()) return;
    const targetDevice = localDevices.find((device) => device.id === selectedLocalDeviceId);
    setSendingLocalRequest(true);
    setError(null);
    try {
      const adminInstruction = [
        "Admin has confirmed a one-time local-agent report request.",
        "Use the enterprise-local-report-collaboration playbook.",
        "Resolve and send this request with enterprise_local_bridge action=send_request and confirmed_by_admin=true.",
        `Target device: ${localDeviceLabel(targetDevice || ({ id: selectedLocalDeviceId } as EnterpriseLocalDevice))}`,
        selectedAgent ? `Business agent: ${selectedAgent.name} (${selectedAgent.id})` : "",
        "Local-agent report task:",
        localRequestText.trim(),
      ].filter(Boolean).join("\n");
      await streamEnterpriseAdminChat({ message: adminInstruction }, {});
      setLocalRequestText("");
      showToast("Admin agent sent local request", "success");
      const requestResult = await api.getEnterpriseLocalRequests();
      setLocalRequests(requestResult.requests || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      showToast("Local request failed", "error");
    } finally {
      setSendingLocalRequest(false);
    }
  }

  async function refreshLocalRequests() {
    setError(null);
    try {
      const requestResult = await api.getEnterpriseLocalRequests();
      setLocalRequests(requestResult.requests || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      showToast("Local request refresh failed", "error");
    }
  }

  async function createReportPlan(event: FormEvent) {
    event.preventDefault();
    if (!selectedLocalDeviceId || !reportPlanRequest.trim() || !reportPlanSchedule.trim()) return;
    setCreatingReportPlan(true);
    setError(null);
    try {
      const result = await api.createEnterpriseLocalReportPlan({
        device_id: selectedLocalDeviceId,
        request: reportPlanRequest.trim(),
        schedule: reportPlanSchedule.trim(),
        name: reportPlanName.trim() || undefined,
      });
      setLocalReportPlans((current) => [result.plan, ...current]);
      setReportPlanName("");
      setReportPlanSchedule("");
      setReportPlanRequest("");
      showToast("Report plan created", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      showToast("Report plan failed", "error");
    } finally {
      setCreatingReportPlan(false);
    }
  }

  async function triggerReportPlan(plan: EnterpriseLocalReportPlan) {
    setError(null);
    try {
      const result = await api.triggerEnterpriseLocalReportPlan(plan.id);
      setLocalRequests((current) => [result.request, ...current]);
      setSelectedRequestId(result.request.id);
      setSelectedRequestDetail(result.request);
      showToast("Report request sent", "success");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      showToast("Report trigger failed", "error");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 text-midground sm:px-6 lg:px-8">
      <Toast toast={toast} />
      <SkillDetailModal
        skill={selectedCatalogSkill}
        detail={expandedCatalogSkill ? catalogSkillDetails[expandedCatalogSkill] : undefined}
        loading={Boolean(expandedCatalogSkill && loadingCatalogSkill === expandedCatalogSkill)}
        onClose={() => setExpandedCatalogSkill("")}
      />
      <LocalRequestDetailModal
        request={selectedRequestDetail}
        onClose={() => setSelectedRequestDetail(null)}
      />

      <header className="flex flex-col gap-4 rounded-lg border border-border bg-card/85 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-3 flex items-center gap-2">
            <span className="rounded-full border border-amber-300/70 bg-amber-50 px-2.5 py-1 text-xs font-medium normal-case text-amber-900">
              Workspace
            </span>
            {status?.tenant?.name && (
              <span className="truncate text-xs normal-case text-muted-foreground">
                {status.tenant.name}
              </span>
            )}
            {error && (
              <span className="truncate rounded-full border border-amber-300/70 bg-amber-50 px-2.5 py-1 text-xs font-medium normal-case text-amber-900">
                Sync issue
              </span>
            )}
          </div>
          <Typography className="text-2xl font-semibold leading-tight tracking-[-0.02em] text-midground sm:text-3xl">
            Manage your agent workspace
          </Typography>
          <p className="mt-2 max-w-2xl text-sm normal-case leading-6 text-muted-foreground">
            Join remote workspaces, invite people, and manage business agents, skills, schedules, devices, and local collaboration from one place.
          </p>
        </div>

        <Button type="button" variant="outline" onClick={loadEnterprise} disabled={loading}>
          {loading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </header>

      {!initialized ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Initialize Workspace
            </CardTitle>
            <CardDescription className="normal-case">
              This creates the first workspace and one admin API key. The key is
              shown once.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={initializeEnterprise} className="grid gap-4 lg:grid-cols-2">
              <label className="block lg:col-span-2">
                <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                  Workspace name
                </span>
                <Input
                  value={tenantName}
                  onChange={(event) => setTenantName(event.target.value)}
                  required
                  className="normal-case"
                  placeholder="Acme Inc."
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                  Workspace ID
                </span>
                <Input
                  value={tenantId}
                  onChange={(event) => setTenantId(event.target.value)}
                  className="normal-case"
                  placeholder="Auto-generated"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                  Admin email
                </span>
                <Input
                  value={adminEmail}
                  onChange={(event) => setAdminEmail(event.target.value)}
                  type="email"
                  className="normal-case"
                />
              </label>
              <label className="block">
                <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                  Admin name
                </span>
                <Input
                  value={adminName}
                  onChange={(event) => setAdminName(event.target.value)}
                  className="normal-case"
                />
              </label>
              <div className="flex items-end">
                <Button type="submit" disabled={savingInit || !tenantName.trim()}>
                  {savingInit && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Initialize
                </Button>
              </div>
            </form>

            {adminApiKey && (
              <OneTimeSecret
                title="Admin API key"
                value={adminApiKey}
                onCopy={() => copyAndToast(adminApiKey, "Admin API key")}
              />
            )}
          </CardContent>
        </Card>

        <Card className="enterprise-card">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Laptop className="h-4 w-4" />
              Join remote workspace
            </CardTitle>
            <CardDescription className="normal-case">
              Use an invite code from another workspace to connect this device as a workspace member.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={joinRemoteWorkspace} className="grid gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-medium normal-case text-muted-foreground">
                  Remote server
                </span>
                <Input
                  value={joinServer}
                  onChange={(event) => setJoinServer(event.target.value)}
                  className="normal-case"
                  placeholder="http://127.0.0.1:9119"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium normal-case text-muted-foreground">
                  Invite code
                </span>
                <Input
                  value={joinInviteCode}
                  onChange={(event) => setJoinInviteCode(event.target.value)}
                  className="normal-case"
                  placeholder="hmi_..."
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium normal-case text-muted-foreground">
                  Password
                </span>
                <Input
                  value={joinPassword}
                  onChange={(event) => setJoinPassword(event.target.value)}
                  type="password"
                  className="normal-case"
                  placeholder="Create or confirm workspace password"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium normal-case text-muted-foreground">
                  Device name
                </span>
                <Input
                  value={joinDeviceName}
                  onChange={(event) => setJoinDeviceName(event.target.value)}
                  className="normal-case"
                  placeholder="My laptop"
                />
              </label>
              {localWebStatus?.joined && (
                <div className="rounded-md border border-border bg-white/45 px-3 py-2 text-xs normal-case text-muted-foreground">
                  Joined as {localWebStatus.user?.email || localWebStatus.user?.name || localWebStatus.user?.id || "workspace user"}
                  {localWebStatus.agent?.name ? ` · ${localWebStatus.agent.name}` : ""}
                </div>
              )}
              <Button
                type="submit"
                disabled={joiningWorkspace || !joinServer.trim() || !joinInviteCode.trim() || !joinPassword.trim()}
              >
                {joiningWorkspace && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Join Workspace
              </Button>
            </form>
          </CardContent>
        </Card>
        </div>
      ) : (
        <>
          <nav className="grid gap-2 md:grid-cols-4" aria-label="Workspace modules">
            {ADMIN_MODULES.map((item) => {
              const Icon = item.icon;
              const active = activeModule === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setActiveModule(item.key)}
                  className={cn(
                    "min-h-[86px] rounded-lg border px-3 py-3 text-left transition-colors",
                    active
                      ? "border-midground bg-white text-midground shadow-sm"
                      : "border-border bg-white/60 text-muted-foreground hover:border-midground/30 hover:bg-white hover:text-midground",
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-medium normal-case">
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </div>
                  <div className="mt-1 line-clamp-2 text-xs normal-case leading-5">
                    {item.description}
                  </div>
                </button>
              );
            })}
          </nav>

          <div className="min-w-0 space-y-4">

          {activeModule === "overview" && (
            <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <Card className="enterprise-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" />
                    Workspace Overview
                  </CardTitle>
                  <CardDescription className="normal-case">
                    Current workspace state.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <OverviewMetric label="Workspace" value={status?.tenant?.name || "Configured"} />
                  <OverviewMetric
                    label="Agents"
                    value={String(agents.filter((agent) => agent.status === "active").length)}
                  />
                  <OverviewMetric
                    label="Remote agents"
                    value={String(remoteAgents.filter((agent) => agent.status !== "disabled").length)}
                  />
                  <OverviewMetric label="Users" value={String(users.length)} />
                  <OverviewMetric
                    label="Active invites"
                    value={String(combinedInvites.filter((invite) => invite.status.label === "Active").length)}
                  />
                  <OverviewMetric
                    label="Local devices"
                    value={String(localDevices.filter((device) => !device.revoked_at).length)}
                  />
                </CardContent>
              </Card>

              <Card className="enterprise-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <UsersRound className="h-4 w-4" />
                    Join or Invite
                  </CardTitle>
                  <CardDescription className="normal-case">
                    Every Teames user can join someone else's workspace or invite people into this one.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2">
                  <form
                    onSubmit={joinRemoteWorkspace}
                    className="rounded-lg border border-border bg-background/40 p-4 text-left"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm font-medium normal-case text-midground">
                        <Laptop className="h-4 w-4" />
                        Join remote workspace
                      </div>
                      {localWebStatus?.joined && (
                        <Badge variant="success">
                          Connected
                        </Badge>
                      )}
                    </div>
                    <div className="grid gap-3">
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium normal-case text-muted-foreground">
                          Remote server
                        </span>
                        <Input
                          value={joinServer}
                          onChange={(event) => setJoinServer(event.target.value)}
                          className="normal-case"
                          placeholder="http://127.0.0.1:9119"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium normal-case text-muted-foreground">
                          Invite code
                        </span>
                        <Input
                          value={joinInviteCode}
                          onChange={(event) => setJoinInviteCode(event.target.value)}
                          className="normal-case"
                          placeholder="hmi_..."
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium normal-case text-muted-foreground">
                          Password
                        </span>
                        <Input
                          value={joinPassword}
                          onChange={(event) => setJoinPassword(event.target.value)}
                          type="password"
                          className="normal-case"
                          placeholder="Create or confirm workspace password"
                        />
                      </label>
                      <label className="block">
                        <span className="mb-1 block text-xs font-medium normal-case text-muted-foreground">
                          Device name
                        </span>
                        <Input
                          value={joinDeviceName}
                          onChange={(event) => setJoinDeviceName(event.target.value)}
                          className="normal-case"
                          placeholder="My laptop"
                        />
                      </label>
                      {localWebStatus?.joined && (
                        <div className="rounded-md border border-border bg-white/45 px-3 py-2 text-xs normal-case text-muted-foreground">
                          Joined as {localWebStatus.user?.email || localWebStatus.user?.name || localWebStatus.user?.id || "workspace user"}
                          {localWebStatus.agent?.name ? ` · ${localWebStatus.agent.name}` : ""}
                        </div>
                      )}
                      <Button
                        type="submit"
                        disabled={joiningWorkspace || !joinServer.trim() || !joinInviteCode.trim() || !joinPassword.trim()}
                      >
                        {joiningWorkspace && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Join Workspace
                      </Button>
                    </div>
                  </form>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveModule("access");
                      setActiveAccessTab("invite");
                    }}
                    className="rounded-lg border border-border bg-background/40 p-4 text-left transition-colors hover:border-midground/30 hover:bg-white"
                  >
                    <div className="flex items-center gap-2 text-sm font-medium normal-case text-midground">
                      <UserPlus className="h-4 w-4" />
                      Invite people
                    </div>
                    <p className="mt-2 text-xs normal-case leading-5 text-muted-foreground">
                      Invite users by email or messaging QR to agents in this workspace.
                    </p>
                  </button>
                </CardContent>
              </Card>
            </div>
          )}

          {activeModule === "local" && (
            <section className="space-y-4">
              <nav className="grid gap-2 md:grid-cols-2" aria-label="Local device sections">
                {LOCAL_DETAIL_TABS.map((item) => {
                  const Icon = item.icon;
                  const active = activeLocalTab === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveLocalTab(item.key)}
                      className={cn(
                        "min-h-[86px] rounded-lg border px-3 py-3 text-left transition-colors",
                        active
                          ? "border-midground bg-white text-midground shadow-sm"
                          : "border-border bg-white/60 text-muted-foreground hover:border-midground/30 hover:bg-white hover:text-midground",
                      )}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium normal-case">
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs normal-case leading-5">
                        {item.description}
                      </div>
                    </button>
                  );
                })}
              </nav>

              <Card className={cn("enterprise-card", activeLocalTab !== "devices" && "hidden")}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Laptop className="h-4 w-4" />
                    My Agent Devices
                  </CardTitle>
                  <CardDescription className="normal-case">
                    Connected user-owned local agents and their default business-agent assignment.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {localDevices.map((device) => (
                      <button
                        key={device.id}
                        type="button"
                        onClick={() => setSelectedLocalDeviceId(device.id)}
                        className={cn(
                          "min-h-[128px] rounded-lg border px-4 py-3 text-left text-xs normal-case transition-colors",
                          selectedLocalDeviceId === device.id
                            ? "border-midground bg-white text-midground shadow-sm"
                            : "border-border bg-white/55 text-muted-foreground hover:border-midground/30 hover:bg-white hover:text-midground",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-midground">
                              {device.name || "Local Agent"}
                            </div>
                            <div className="mt-1 truncate">
                              {device.user_name || device.user_email || device.user_id}
                            </div>
                          </div>
                          <Badge variant={device.revoked_at ? "outline" : "success"}>
                            {device.revoked_at ? "Revoked" : "Active"}
                          </Badge>
                        </div>
                        <div className="mt-3 truncate">
                          Agent: {device.agent_name || device.agent_id || "-"}
                        </div>
                        <div className="mt-1 truncate text-muted-foreground">
                          User email: {device.user_email || "-"}
                        </div>
                        <div className="mt-1 truncate text-muted-foreground">
                          Device code: {device.id}
                        </div>
                        <div className="mt-1 text-muted-foreground">
                          Last seen: {formatDate(device.last_seen_at)}
                        </div>
                      </button>
                    ))}
                    {localDevices.length === 0 && (
                      <div className="rounded-lg border border-border bg-white/45 px-4 py-8 text-sm normal-case text-muted-foreground">
                        No local agents connected yet.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className={cn("enterprise-card", activeLocalTab !== "requests" && "hidden")}>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Request Log
                    </CardTitle>
                    <CardDescription className="normal-case">
                      Global local-agent request history. Create new agent-scoped requests from Agent &gt; Reports.
                    </CardDescription>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={refreshLocalRequests}>
                    <RefreshCw className="h-3.5 w-3.5" />
                    Refresh
                  </Button>
                </CardHeader>
                <CardContent className="grid gap-4 xl:grid-cols-[minmax(340px,0.45fr)_minmax(0,1fr)]">
                  <div className="rounded-lg border border-border bg-background/30">
                    <div className="border-b border-border px-3 py-2 text-xs font-medium normal-case text-muted-foreground">
                      Recent requests
                    </div>
                    <div className="max-h-[520px] overflow-y-auto">
                      {localRequests.slice(0, 30).map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setSelectedRequestId(item.id);
                            setSelectedRequestDetail(item);
                          }}
                          className={cn(
                            "block w-full border-b border-border/60 px-3 py-3 text-left text-xs normal-case",
                            selectedLocalRequest?.id === item.id ? "bg-foreground/10" : "hover:bg-foreground/5",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate font-medium text-midground">
                              {localRequestLabel(item)}
                            </span>
                            <Badge variant={item.status === "responded" ? "success" : item.status === "rejected" ? "warning" : "outline"}>
                              {item.status}
                            </Badge>
                          </div>
                          <div className="mt-1 truncate text-muted-foreground">
                            {item.agent_name || item.agent_id || "No agent"} · {formatDate(item.created_at)}
                          </div>
                          <div className="mt-1 truncate text-muted-foreground">
                            Device: {item.device_name || "-"} · Request ID: {item.id}
                          </div>
                          <p className="mt-2 line-clamp-2 text-muted-foreground">{item.request}</p>
                        </button>
                      ))}
                      {localRequests.length === 0 && (
                        <div className="px-3 py-6 text-sm normal-case text-muted-foreground">
                          No local-agent requests yet.
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedLocalRequest ? (
                    <div className="rounded-lg border border-border bg-background/30 p-4 text-sm normal-case">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-midground">
                            {selectedLocalRequest.device_name || selectedLocalRequest.device_id}
                          </div>
                          <div className="mt-1 text-xs text-muted-foreground">
                            {formatDate(selectedLocalRequest.created_at)} · {selectedLocalRequest.agent_name || selectedLocalRequest.agent_id || "-"}
                          </div>
                        </div>
                        <Badge variant={selectedLocalRequest.status === "responded" ? "success" : selectedLocalRequest.status === "rejected" ? "warning" : "outline"}>
                          {selectedLocalRequest.status}
                        </Badge>
                      </div>
                      <div className="mt-4 grid gap-2 rounded-lg border border-border bg-white/45 p-3 text-xs text-muted-foreground sm:grid-cols-2">
                        <div className="truncate">User: {selectedLocalRequest.user_email || selectedLocalRequest.user_name || selectedLocalRequest.user_id || "-"}</div>
                        <div className="truncate">Device code: {selectedLocalRequest.device_id || "-"}</div>
                        <div className="truncate">Device: {selectedLocalRequest.device_name || "-"}</div>
                        <div className="truncate">Request ID: {selectedLocalRequest.id}</div>
                      </div>
                      <div className="mt-4 whitespace-pre-wrap text-midground">
                        {selectedLocalRequest.request}
                      </div>
                      {selectedLocalRequest.response && (
                        <div className="mt-4 border-t border-border/70 pt-4 text-muted-foreground">
                          <Markdown content={selectedLocalRequest.response} />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="rounded-lg border border-border bg-background/30 p-6 text-sm normal-case text-muted-foreground">
                      Select a request to view details.
                    </div>
                  )}
                </CardContent>
              </Card>
            </section>
          )}

          {activeModule === "agents" && (
            <section className="space-y-4">
              <nav className="grid gap-2 md:grid-cols-2" aria-label="Agent sections">
                {AGENTS_SECTIONS.map((item) => {
                  const Icon = item.icon;
                  const active = activeAgentsSection === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => {
                        setActiveAgentsSection(item.key);
                        if (item.key === "build") {
                          setActiveBuildAgentsSection("configuration");
                          setCatalogAgentId("");
                          resetAgentForm();
                          setActiveAgentTab("prompt");
                        }
                      }}
                      className={cn(
                        "min-h-[86px] rounded-lg border px-3 py-3 text-left transition-colors",
                        active
                          ? "border-midground bg-white text-midground shadow-sm"
                          : "border-border bg-white/60 text-muted-foreground hover:border-midground/30 hover:bg-white hover:text-midground",
                      )}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium normal-case">
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs normal-case leading-5">
                        {item.description}
                      </div>
                    </button>
                  );
                })}
              </nav>

              {activeAgentsSection === "agents" && (
                <>
              <Card className="enterprise-card overflow-hidden">
                <CardHeader>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Bot className="h-4 w-4" />
                      Agents
                    </CardTitle>
                    <CardDescription className="normal-case">
                      Local workspace agents are editable. Remote agents are shown for reference only.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {agents.map((agent) => {
                      const active = selectedAgent?.id === agent.id;
                      return (
                        <button
                          type="button"
                          key={agent.id}
                          onClick={() => editAgent(agent)}
                          className={cn(
                            "block min-h-[112px] w-full rounded-lg border px-4 py-3 text-left transition-colors",
                            active
                              ? "border-midground bg-white text-midground shadow-sm"
                              : "border-border bg-white/55 text-muted-foreground hover:border-midground/30 hover:bg-white hover:text-midground",
                          )}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="truncate text-sm font-semibold normal-case text-midground">
                                {agent.name}
                              </div>
                              <div className="mt-1 line-clamp-2 text-xs normal-case leading-5 text-muted-foreground">
                                  {compactText(agent.description || agent.task_prompt, 120)}
                              </div>
                            </div>
                            <Badge variant={agent.status === "active" ? "success" : "outline"}>
                              {agent.status}
                            </Badge>
                          </div>
                        </button>
                      );
                    })}
                    {remoteAgents.map((agent) => (
                      <div
                        key={`${localWebStatus?.server || "remote"}:${agent.id}`}
                        className="min-h-[112px] rounded-lg border border-border bg-white/55 px-4 py-3 text-left"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold normal-case text-midground">
                              {agent.name}
                            </div>
                            <div className="mt-1 line-clamp-2 text-xs normal-case leading-5 text-muted-foreground">
                              {compactText(agent.description || agent.task_prompt || agent.id, 120)}
                            </div>
                          </div>
                          <Badge variant="outline">
                            Remote
                          </Badge>
                        </div>
                        <div className="mt-3 truncate text-xs normal-case text-muted-foreground">
                          {localWebStatus?.user?.email || localWebStatus?.user?.name || "Remote workspace member"}
                        </div>
                        <div className="mt-1 truncate text-xs normal-case text-muted-foreground">
                          {localWebStatus?.server || "Remote server"}
                        </div>
                      </div>
                    ))}
                    {agents.length === 0 && remoteAgents.length === 0 && (
                      <div className="rounded-lg border border-border bg-white/45 px-4 py-8 text-sm normal-case text-muted-foreground">
                        No agents yet.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <div className="min-w-0 space-y-4">
                <Card className="enterprise-card overflow-hidden">
                  <CardContent className="p-0">
                    <div className="bg-white/70 p-5">
                      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <Badge variant={selectedAgent?.status === "active" ? "success" : "outline"}>
                              {selectedAgent?.status || "new"}
                            </Badge>
                            <span className="text-xs normal-case text-muted-foreground">
                              {selectedAgent ? `Updated ${formatDate(selectedAgent.updated_at)}` : "Draft"}
                            </span>
                          </div>
                          <Typography className="truncate text-2xl font-semibold leading-tight tracking-[-0.02em] text-midground">
                            {selectedAgent?.name || "New business agent"}
                          </Typography>
                          <p className="mt-2 max-w-3xl text-sm normal-case leading-6 text-muted-foreground">
                            {selectedAgent?.description || selectedAgent?.task_prompt || "Configure prompts, skills, cron, reports, and local collaboration from this agent workspace."}
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <nav className="grid gap-2 md:grid-cols-5" aria-label="Agent workspace sections">
                  {AGENT_DETAIL_TABS.map((item) => {
                    const Icon = item.icon;
                    const active = activeAgentTab === item.key;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => setActiveAgentTab(item.key)}
                        className={cn(
                          "min-h-[86px] rounded-lg border px-3 py-3 text-left transition-colors",
                          active
                            ? "border-midground bg-white text-midground shadow-sm"
                            : "border-border bg-white/60 text-muted-foreground hover:border-midground/30 hover:bg-white hover:text-midground",
                        )}
                      >
                        <div className="flex items-center gap-2 text-sm font-medium normal-case">
                          <Icon className="h-4 w-4" />
                          {item.label}
                        </div>
                        <div className="mt-1 line-clamp-2 text-xs normal-case leading-5">
                          {item.description}
                        </div>
                      </button>
                    );
                  })}
                </nav>

                {activeAgentTab === "reports" && (
                  <nav className="grid gap-2 md:grid-cols-2" aria-label="Report sections">
                    {REPORT_DETAIL_TABS.map((item) => {
                      const Icon = item.icon;
                      const active = activeReportTab === item.key;
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => setActiveReportTab(item.key)}
                          className={cn(
                            "rounded-lg border px-3 py-3 text-left transition-colors",
                            active
                              ? "border-midground bg-white text-midground shadow-sm"
                              : "border-border bg-white/60 text-muted-foreground hover:border-midground/30 hover:bg-white hover:text-midground",
                          )}
                        >
                          <div className="flex items-center gap-2 text-sm font-medium normal-case">
                            <Icon className="h-4 w-4" />
                            {item.label}
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs normal-case leading-5">
                            {item.description}
                          </div>
                        </button>
                      );
                    })}
                  </nav>
                )}

                <div className="space-y-4">
                  <Card className={cn("enterprise-card", activeAgentTab !== "prompt" && "hidden")}>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Bot className="h-4 w-4" />
                        Configuration
                      </CardTitle>
                      <CardDescription className="normal-case">
                        Prompt layers and business knowledge for the selected agent.
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {renderAgentConfigurationForm()}
                    </CardContent>
                  </Card>

                  <div className={cn(
                    "grid gap-4",
                    activeAgentTab === "skills" || activeAgentTab === "tools" || activeAgentTab === "reports" ? "xl:grid-cols-1" : "hidden",
                  )}>
                    <Card className={cn("enterprise-card", activeAgentTab !== "skills" && "hidden")}>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Package className="h-4 w-4" />
                          Skills
                        </CardTitle>
                        <CardDescription className="normal-case">
                          Visible skills for this agent.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {loadingCatalog && (
                          <div className="flex items-center gap-2 text-xs normal-case text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading skills
                          </div>
                        )}
                        {!loadingCatalog && skillCatalog.length > 0 && (
                          <Input
                            value={catalogSkillSearch}
                            onChange={(event) => setCatalogSkillSearch(event.target.value)}
                            placeholder="Search skills..."
                            className="normal-case"
                          />
                        )}
                        <div className="max-h-[430px] space-y-2 overflow-y-auto pr-1">
                          {filteredSkillCatalog.map((skill) => {
                            const key = skillIdentity(skill);
                            return (
                              <div key={key} className="rounded-lg border border-border bg-white/50 p-3">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-medium normal-case text-midground">
                                      {skill.name}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-2 text-xs normal-case text-muted-foreground">
                                      <span>{skill.category || "general"}</span>
                                      <Badge variant={skill.source === "agent_custom" ? "success" : "outline"}>
                                        {skill.source === "agent_custom" ? "Business" : "Built-in"}
                                      </Badge>
                                    </div>
                                  </div>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    disabled={loadingCatalogSkill === key}
                                    onClick={() => openCatalogSkill(skill)}
                                  >
                                    {loadingCatalogSkill === key ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BookOpen className="h-3.5 w-3.5" />}
                                    Open
                                  </Button>
                                </div>
                                <p className="mt-2 line-clamp-2 text-xs normal-case leading-5 text-muted-foreground">
                                  {compactText(skill.description)}
                                </p>
                                {skill.source === "agent_custom" ? (
                                  <Badge variant={skill.enabled ? "success" : "outline"}>
                                    {skill.enabled ? "Enabled" : "Disabled"}
                                  </Badge>
                                ) : (
                                  <Button
                                    type="button"
                                    variant={skill.allowed ? "default" : "outline"}
                                    size="sm"
                                    className="mt-2"
                                    disabled={busyCatalogSkill === skill.name}
                                    onClick={() => toggleCatalogSkill(skill)}
                                  >
                                    {busyCatalogSkill === skill.name && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                                    {skill.allowed ? "Visible" : "Hidden"}
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                          {!loadingCatalog && skillCatalog.length === 0 && (
                            <div className="rounded-lg border border-border bg-white/45 p-4 text-sm normal-case text-muted-foreground">
                              No skills available.
                            </div>
                          )}
                          {!loadingCatalog && skillCatalog.length > 0 && filteredSkillCatalog.length === 0 && (
                            <div className="rounded-lg border border-border bg-white/45 p-4 text-sm normal-case text-muted-foreground">
                              No skills match your search.
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className={cn("enterprise-card", activeAgentTab !== "tools" && "hidden")}>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Wrench className="h-4 w-4" />
                          Tools
                        </CardTitle>
                        <CardDescription className="normal-case">
                          Toolsets available to the workspace runtime. Business agents use the same Hermes tool capability layer.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <Input
                          value={toolSearch}
                          onChange={(event) => setToolSearch(event.target.value)}
                          placeholder="Search tools..."
                          className="normal-case"
                        />
                        {filteredToolsets.length === 0 ? (
                          <div className="rounded-lg border border-border bg-white/45 p-4 text-sm normal-case text-muted-foreground">
                            No tools match your search.
                          </div>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            {filteredToolsets.map((toolset) => (
                              <div key={toolset.name} className="rounded-lg border border-border bg-white/50 p-3">
                                <div className="flex items-start gap-3">
                                  <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                                  <div className="min-w-0 flex-1">
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="min-w-0">
                                        <div className="truncate text-sm font-medium normal-case text-midground">
                                          {(toolset.label || toolset.name).replace(/^[\p{Emoji}\s]+/u, "").trim()}
                                        </div>
                                        <div className="mt-1 text-xs normal-case text-muted-foreground">
                                          {toolset.tools.length} tools
                                        </div>
                                      </div>
                                      <Badge variant={toolset.enabled ? "success" : "outline"}>
                                        {toolset.enabled ? "Enabled" : "Disabled"}
                                      </Badge>
                                    </div>
                                    <p className="mt-2 line-clamp-3 text-xs normal-case leading-5 text-muted-foreground">
                                      {toolset.description || toolset.name}
                                    </p>
                                    <div className="mt-2 flex flex-wrap gap-1">
                                      {(toolset.tools || []).slice(0, 18).map((tool) => (
                                        <Badge key={tool} variant="secondary" className="text-[10px]">
                                          {tool}
                                        </Badge>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    <Card className={cn("enterprise-card", (activeAgentTab !== "reports" || activeReportTab !== "plans") && "hidden")}>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <CalendarClock className="h-4 w-4" />
                          Cron & Reports
                        </CardTitle>
                        <CardDescription className="normal-case">
                          Scheduled local reports for this agent.
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <form onSubmit={createReportPlan} className="space-y-3">
                          <Select value={selectedLocalDeviceId} onValueChange={setSelectedLocalDeviceId}>
                            {agentDevices.map((device) => (
                              <SelectOption key={device.id} value={device.id}>
                                {localDeviceLabel(device)}
                              </SelectOption>
                            ))}
                          </Select>
                          <Input
                            value={reportPlanName}
                            onChange={(event) => setReportPlanName(event.target.value)}
                            placeholder="Plan name"
                            className="normal-case"
                          />
                          <Input
                            value={reportPlanSchedule}
                            onChange={(event) => setReportPlanSchedule(event.target.value)}
                            placeholder="Schedule, e.g. every day 18:00"
                            className="normal-case"
                          />
                          <textarea
                            value={reportPlanRequest}
                            onChange={(event) => setReportPlanRequest(event.target.value)}
                            rows={3}
                            placeholder="What should the local agent report?"
                            className="w-full resize-none rounded-lg border border-border bg-background/40 px-3 py-2 text-sm normal-case placeholder:text-muted-foreground focus-visible:border-foreground/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30"
                          />
                          <Button
                            type="submit"
                            disabled={creatingReportPlan || agentDevices.length === 0 || !selectedLocalDeviceId || !reportPlanSchedule.trim() || !reportPlanRequest.trim()}
                          >
                            {creatingReportPlan ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarClock className="h-3.5 w-3.5" />}
                            Create Plan
                          </Button>
                        </form>
                        <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                          {agentReportPlans.map((plan) => (
                            <div key={plan.id} className="border-b border-border/60 bg-white/40 px-3 py-3 text-xs normal-case">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate font-medium text-midground">{plan.name || plan.id}</div>
                                  <div className="mt-1 text-muted-foreground">
                                    {plan.device_name || plan.device_id || "Local agent"} · {plan.schedule_display || plan.schedule?.display || "-"}
                                  </div>
                                </div>
                                <Button type="button" variant="outline" size="sm" onClick={() => triggerReportPlan(plan)}>
                                  <Send className="h-3.5 w-3.5" />
                                  Run
                                </Button>
                              </div>
                              <p className="mt-2 line-clamp-2 text-muted-foreground">{plan.request}</p>
                            </div>
                          ))}
                          {agentReportPlans.length === 0 && (
                            <div className="px-3 py-6 text-sm normal-case text-muted-foreground">
                              No report plans for this agent.
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                <Card className={cn("enterprise-card", (activeAgentTab !== "reports" || activeReportTab !== "requests") && "hidden")}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4" />
                      Local Requests
                    </CardTitle>
                    <CardDescription className="normal-case">
                      Ad-hoc requests and local-agent responses for this agent.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <section className="grid gap-4 xl:grid-cols-[minmax(360px,0.55fr)_minmax(0,1fr)]">
                      <form onSubmit={sendLocalRequest} className="space-y-3 rounded-lg border border-border bg-background/30 p-3">
                        <div className="flex items-center gap-2 text-sm font-medium normal-case text-midground">
                          <MessageSquare className="h-4 w-4" />
                          Ad-hoc Local Request
                        </div>
                        <Select value={selectedLocalDeviceId} onValueChange={setSelectedLocalDeviceId}>
                          {agentDevices.map((device) => (
                            <SelectOption key={device.id} value={device.id}>
                              {localDeviceLabel(device)}
                            </SelectOption>
                          ))}
                        </Select>
                        <textarea
                          value={localRequestText}
                          onChange={(event) => setLocalRequestText(event.target.value)}
                          rows={3}
                          placeholder="Ask the local agent to summarize or verify something locally."
                          className="w-full resize-none rounded-lg border border-border bg-background/40 px-3 py-2 text-sm normal-case placeholder:text-muted-foreground focus-visible:border-foreground/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30"
                        />
                        <Button
                          type="submit"
                          disabled={sendingLocalRequest || agentDevices.length === 0 || !selectedLocalDeviceId || !localRequestText.trim()}
                        >
                          {sendingLocalRequest ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                          Send Request
                        </Button>
                      </form>

                      <div className="grid gap-3">
                        <div className="rounded-lg border border-border bg-background/30">
                          <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                            <span className="text-xs font-medium normal-case text-muted-foreground">Recent report requests</span>
                            <Button type="button" variant="outline" size="sm" onClick={refreshLocalRequests}>
                              <RefreshCw className="h-3.5 w-3.5" />
                              Refresh
                            </Button>
                          </div>
                          <div className="max-h-80 overflow-y-auto">
                            {agentLocalRequests.slice(0, 12).map((item) => (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => {
                                  setSelectedRequestId(item.id);
                                  setSelectedRequestDetail(item);
                                }}
                                className="block w-full border-b border-border/60 px-3 py-3 text-left text-xs normal-case hover:bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="truncate font-medium text-midground">{localRequestLabel(item)}</span>
                                  <Badge variant={item.status === "responded" ? "success" : item.status === "rejected" ? "warning" : "outline"}>
                                    {item.status}
                                  </Badge>
                                </div>
                                <p className="mt-1 truncate text-muted-foreground">
                                  Device: {item.device_name || "-"} · Request ID: {item.id}
                                </p>
                                <p className="mt-2 line-clamp-2 text-muted-foreground">{item.request}</p>
                                {item.response && (
                                  <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-midground">{item.response}</p>
                                )}
                              </button>
                            ))}
                            {agentLocalRequests.length === 0 && (
                              <div className="px-3 py-6 text-sm normal-case text-muted-foreground">
                                No requests for this agent.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </section>
                  </CardContent>
                </Card>

                <Card className={cn("enterprise-card", activeAgentTab !== "users" && "hidden")}>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <UsersRound className="h-4 w-4" />
                      Agent Users
                    </CardTitle>
                    <CardDescription className="normal-case">
                      Users assigned to this agent and their private per-agent state. Invite new users from People & Invites.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <section className="rounded-lg border border-border bg-background/30">
                      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                        <span className="text-xs font-medium normal-case text-muted-foreground">Assigned users</span>
                        {loadingAgentUsers && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                      </div>
                      <div className="divide-y divide-border/60">
                        {agentUsers.map((user) => {
                          return (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => openAgentUser(user)}
                              className="block w-full px-3 py-4 text-left text-xs normal-case transition-colors hover:bg-white/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="truncate font-medium text-midground">
                                  {user.name || user.email || user.id}
                                </span>
                                <Badge variant={user.disabled_at ? "outline" : "success"}>
                                  {user.disabled_at ? "Disabled" : user.access_role || user.role || "member"}
                                </Badge>
                              </div>
                              <div className="mt-1 truncate text-muted-foreground">
                                {user.email || user.id}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-1">
                                <Badge variant="outline">{user.session_count || 0} sessions</Badge>
                                <Badge variant="outline">{user.skill_count || 0} builtin</Badge>
                                <Badge variant="outline">{user.custom_skill_count || 0} custom</Badge>
                                <Badge variant="outline">{user.cron_job_count || 0} cron</Badge>
                                <Badge variant="outline">{user.social_binding_count || 0} gateway</Badge>
                                <Badge variant="outline">{user.local_device_count || 0} local</Badge>
                              </div>
                              <div className="mt-2 text-muted-foreground">
                                Last seen: {formatDate(user.last_seen_at)}
                              </div>
                            </button>
                          );
                        })}
                        {!loadingAgentUsers && agentUsers.length === 0 && (
                          <div className="px-3 py-6 text-sm normal-case text-muted-foreground">
                            No users are assigned to this agent yet.
                          </div>
                        )}
                      </div>
                    </section>
                  </CardContent>
                </Card>
              </div>
                </>
              )}

              {activeAgentsSection === "build" && (
                <div className="space-y-4">
                  <Card className="enterprise-card">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Bot className="h-4 w-4" />
                        Build Agents
                      </CardTitle>
                      <CardDescription className="normal-case">
                        Start from structured fields or use the builder chat to generate agents, prompts, skills, and invite links.
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 md:grid-cols-2">
                      {BUILD_AGENT_SECTIONS.map((item) => {
                        const Icon = item.icon;
                        const active = activeBuildAgentsSection === item.key;
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => setActiveBuildAgentsSection(item.key)}
                            className={cn(
                              "rounded-lg border p-4 text-left transition-colors",
                              active
                                ? "border-midground bg-white text-midground shadow-sm"
                                : "border-border bg-background/40 text-muted-foreground hover:border-midground/30 hover:bg-white hover:text-midground",
                            )}
                          >
                            <div className="flex items-center gap-2 text-sm font-medium normal-case">
                              <Icon className="h-4 w-4" />
                              {item.label}
                            </div>
                            <p className="mt-2 text-xs normal-case leading-5">
                              {item.description}
                            </p>
                          </button>
                        );
                      })}
                    </CardContent>
                  </Card>

                  {activeBuildAgentsSection === "configuration" && (
                    <Card className="enterprise-card">
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                          <Bot className="h-4 w-4" />
                          Configuration
                        </CardTitle>
                        <CardDescription className="normal-case">
                          Create a workspace agent by defining its prompts, knowledge, and behavior.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        {renderAgentConfigurationForm()}
                      </CardContent>
                    </Card>
                  )}

                  {activeBuildAgentsSection === "chat" && <EnterpriseBuilderPage embedded />}
                </div>
              )}
            </section>
          )}

          {activeModule === "access" && (
            <section className="space-y-4">
              <nav className="grid gap-2 md:grid-cols-4" aria-label="Access sections">
                {ACCESS_DETAIL_TABS.map((item) => {
                  const Icon = item.icon;
                  const active = activeAccessTab === item.key;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      onClick={() => setActiveAccessTab(item.key)}
                      className={cn(
                        "min-h-[86px] rounded-lg border px-3 py-3 text-left transition-colors",
                        active
                          ? "border-midground bg-white text-midground shadow-sm"
                          : "border-border bg-white/60 text-muted-foreground hover:border-midground/30 hover:bg-white hover:text-midground",
                      )}
                    >
                      <div className="flex items-center gap-2 text-sm font-medium normal-case">
                        <Icon className="h-4 w-4" />
                        {item.label}
                      </div>
                      <div className="mt-1 line-clamp-2 text-xs normal-case leading-5">
                        {item.description}
                      </div>
                    </button>
                  );
                })}
              </nav>

              <Card className={cn("enterprise-card", activeAccessTab !== "invite" && "hidden")}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UserPlus className="h-4 w-4" />
                  Invite User
                </CardTitle>
                <CardDescription className="normal-case">
                  Generate a one-time code or link and choose accessible agents.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={createInvite} className="grid gap-3">
                  <label className="block">
                    <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                      Email
                    </span>
                    <Input
                      value={inviteEmail}
                      onChange={(event) => setInviteEmail(event.target.value)}
                      type="email"
                      className="normal-case"
                      placeholder="optional"
                    />
                  </label>
                  <div>
                    <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                      Allowed agents
                    </span>
                    <div className="grid gap-2">
                      {agents.map((agent) => (
                        <label
                          key={agent.id}
                          className="flex items-center gap-2 border border-border bg-background/30 px-3 py-2 font-courier text-xs normal-case"
                        >
                          <input
                            type="checkbox"
                            checked={inviteAgentIds.includes(agent.id)}
                            onChange={() => toggleInviteAgent(agent.id)}
                          />
                          <span className="min-w-0 flex-1 truncate">{agent.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                        Role
                      </span>
                      <Select
                        value={inviteRole}
                        onValueChange={(value) => setInviteRole(value as InviteRole)}
                      >
                        <SelectOption value="member">Member</SelectOption>
                        <SelectOption value="admin">Admin</SelectOption>
                      </Select>
                    </label>
                    <label className="block">
                      <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                        Max uses
                      </span>
                      <Input
                        value={maxUses}
                        onChange={(event) => setMaxUses(event.target.value)}
                        inputMode="numeric"
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                        Expires days
                      </span>
                      <Input
                        value={expiresDays}
                        onChange={(event) => setExpiresDays(event.target.value)}
                        inputMode="numeric"
                        placeholder="7"
                      />
                    </label>
                  </div>
                  <Button type="submit" disabled={creatingInvite || inviteAgentIds.length === 0}>
                    {creatingInvite && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Create Invite
                  </Button>
                </form>

                {latestInvite && (
                  <div className="mt-4 space-y-3 border border-border bg-background/40 p-3">
                    <OneTimeSecret
                      title="Invite code"
                      value={latestInvite.code}
                      onCopy={() => copyAndToast(latestInvite.code, "Invite code")}
                    />
                    <OneTimeSecret
                      title="Invite link"
                      value={inviteUrl}
                      onCopy={() => copyAndToast(inviteUrl, "Invite link")}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

              <Card className={cn("enterprise-card", activeAccessTab !== "social" && "hidden")}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Social Gateway QR
                  </CardTitle>
                  <CardDescription className="normal-case">
                    Create a QR invite that binds a messaging account to a remote business agent.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={createSocialInvite} className="grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-3">
                      <label className="block">
                        <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                          Platform
                        </span>
                        <Select value={socialPlatform} onValueChange={setSocialPlatform}>
                          <SelectOption value="weixin">WeChat</SelectOption>
                          <SelectOption value="whatsapp">WhatsApp</SelectOption>
                          <SelectOption value="telegram">Telegram</SelectOption>
                          <SelectOption value="generic">Generic</SelectOption>
                        </Select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                          Agent
                        </span>
                        <Select value={socialAgentId} onValueChange={setSocialAgentId}>
                          {agents.map((agent) => (
                            <SelectOption key={agent.id} value={agent.id}>
                              {agent.name}
                            </SelectOption>
                          ))}
                        </Select>
                      </label>
                      <label className="block">
                        <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                          Label
                        </span>
                        <Input
                          value={socialLabel}
                          onChange={(event) => setSocialLabel(event.target.value)}
                          className="normal-case"
                          placeholder="optional"
                        />
                      </label>
                    </div>
                    {!isWhatsAppSocialPlatform && !isTelegramSocialPlatform && (
                      <Button
                        type="submit"
                        className="h-11 w-full"
                        disabled={creatingSocialInvite || !socialAgentId}
                      >
                        {creatingSocialInvite && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Create QR Invite
                      </Button>
                    )}
                  </form>

                  {isWhatsAppSocialPlatform && (
                    <div
                      className={cn(
                        "mt-4 grid gap-4 border border-border bg-background/40 p-3",
                        !whatsappGatewayPaired && "lg:grid-cols-[220px_minmax(0,1fr)]",
                      )}
                    >
                      {!whatsappGatewayPaired && (
                        <div className="flex min-h-[210px] items-center justify-center bg-white p-3">
                          {whatsappPair?.qr_image ? (
                            <img
                              src={whatsappPair.qr_image}
                              alt="WhatsApp gateway pairing QR"
                              className="h-48 w-48"
                            />
                          ) : (
                            <div className="text-center font-courier text-xs normal-case text-muted-foreground">
                              WhatsApp bot pairing
                            </div>
                          )}
                        </div>
                      )}
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="font-courier text-sm normal-case text-midground">
                            Server WhatsApp Bot
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={pairWhatsAppGateway} disabled={pairingWhatsapp}>
                            {pairingWhatsapp && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            {whatsappGatewayPaired ? "Refresh WhatsApp Status" : "Pair WhatsApp Bot"}
                          </Button>
                        </div>
                        <div className="text-xs normal-case text-muted-foreground">
                          Pair the server-side bot once with WhatsApp Linked Devices, then create user invite QR codes.
                        </div>
                        {whatsappPair && (
                          <div className="space-y-2 text-xs normal-case text-muted-foreground">
                            <div>Status: {whatsappPair.status}</div>
                            {whatsappPair.phone_number && <div>Number: {whatsappPair.phone_number}</div>}
                            {whatsappPair.message && <div>{whatsappPair.message}</div>}
                            {whatsappPair.qr_image && (
                              <div>Open WhatsApp on the bot phone: Settings → Linked Devices → Link a Device.</div>
                            )}
                          </div>
                        )}
                        <div className="space-y-4 pt-2">
                          {whatsappGatewayPaired && (
                            <Button
                              type="button"
                              className="h-11 w-full"
                              onClick={() => void createSocialInvite()}
                              disabled={creatingSocialInvite || !socialAgentId}
                            >
                              {creatingSocialInvite && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                              Create QR Invite
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {isTelegramSocialPlatform && (
                    <div className="mt-4 rounded-lg border border-border bg-white/70 p-4">
                      <div className="min-w-0 space-y-3">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div className="font-courier text-sm normal-case text-midground">
                            Server Telegram Bot
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={refreshTelegramGatewayStatus}
                            disabled={refreshingTelegramBot}
                          >
                            {refreshingTelegramBot && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            Refresh Telegram Status
                          </Button>
                        </div>
                        <div className="space-y-2 text-xs normal-case text-muted-foreground">
                          <div>Status: {telegramGateway?.status || "checking"}</div>
                          {telegramGateway?.username && <div>Username: @{telegramGateway.username}</div>}
                          {telegramGateway?.first_name && <div>Name: {telegramGateway.first_name}</div>}
                          {telegramGateway?.message && <div>{telegramGateway.message}</div>}
                        </div>
                        {!telegramGatewayReady && (
                          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                            <Input
                              value={telegramBotToken}
                              onChange={(event) => setTelegramBotToken(event.target.value)}
                              className="normal-case"
                              placeholder="Telegram bot token"
                              type="password"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              onClick={configureTelegramGateway}
                              disabled={savingTelegramBot || !telegramBotToken.trim()}
                            >
                              {savingTelegramBot && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                              Save Bot
                            </Button>
                          </div>
                        )}
                        <div className="space-y-4 pt-2">
                          {telegramGatewayReady && (
                            <Button
                              type="button"
                              className="h-11 w-full"
                              onClick={() => void createSocialInvite()}
                              disabled={creatingSocialInvite || !socialAgentId}
                            >
                              {creatingSocialInvite && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                              Create QR Invite
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {visibleSocialInvite && (
                    <div className="mt-4 rounded-lg border border-border bg-white p-4 shadow-sm">
                      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="success">{visibleSocialInvite.link.platform_label}</Badge>
                            <span className="font-courier text-sm normal-case text-midground">Invite ready</span>
                          </div>
                          <div className="mt-1 text-xs normal-case leading-5 text-muted-foreground">
                            {visibleSocialInvite.link.platform === "telegram"
                              ? "Scan with the phone camera, open Telegram, then tap Start to connect."
                              : visibleSocialInvite.link.platform === "whatsapp"
                                ? "Scan with the phone camera. WhatsApp opens with the bind message ready; tap Send."
                                : visibleSocialInvite.link.platform === "weixin"
                                  ? "Scan in WeChat and finish the confirmation flow."
                                  : "Scan or copy the target to bind this messaging account."}
                          </div>
                        </div>
                      </div>
                      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
                        <div className="flex min-h-[220px] items-center justify-center rounded-lg border border-border bg-white p-3">
                          {visibleSocialInvite.link.qr_image ? (
                            <img
                              src={visibleSocialInvite.link.qr_image}
                              alt={`${visibleSocialInvite.link.platform_label} QR invite`}
                              className="h-48 w-48"
                            />
                          ) : (
                            <div className="text-center font-courier text-xs normal-case text-muted-foreground">
                              {visibleSocialInvite.link.platform === "weixin"
                                ? "No WeChat QR image for this invite. WeChat QR invites are temporary; create a fresh WeChat QR invite. If this was just created, reinstall portal dependencies and restart Teames."
                                : "No QR image for this invite."}
                            </div>
                          )}
                        </div>
                        <div className="min-w-0 space-y-3">
                          <OneTimeSecret
                            title="QR target"
                            value={visibleSocialInvite.link.qr_data || visibleSocialInvite.link.bind_text || visibleSocialInvite.code}
                            onCopy={() => copyAndToast(visibleSocialInvite.link.qr_data || visibleSocialInvite.link.bind_text || visibleSocialInvite.code, "QR target")}
                          />
                          <OneTimeSecret
                            title={visibleSocialInvite.link.platform === "telegram" ? "Fallback start command" : "Bind message"}
                            value={visibleSocialInvite.link.platform === "telegram" ? `/start ${visibleSocialInvite.code}` : visibleSocialInvite.link.bind_text || visibleSocialInvite.code}
                            onCopy={() =>
                              copyAndToast(
                                visibleSocialInvite.link.platform === "telegram" ? `/start ${visibleSocialInvite.code}` : visibleSocialInvite.link.bind_text || visibleSocialInvite.code,
                                visibleSocialInvite.link.platform === "telegram" ? "Start command" : "Bind message",
                              )
                            }
                          />
                          {visibleSocialInvite.link.setup_required && visibleSocialInvite.link.setup_hint && (
                            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 font-courier text-xs normal-case text-amber-900">
                              {visibleSocialInvite.link.setup_hint}
                            </div>
                          )}
                          {visibleSocialInvite.link.platform === "weixin" && (
                            <div className="rounded-lg border border-border bg-background/40 px-3 py-2 font-courier text-xs normal-case text-muted-foreground">
                              WeChat QR status: {weixinQrStatus || "waiting"}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                </CardContent>
              </Card>

              <Card className={cn("enterprise-card", activeAccessTab !== "users" && "hidden")}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <UsersRound className="h-4 w-4" />
                  Users
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-left font-courier text-xs normal-case">
                    <thead className="border-b border-border text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 font-normal">User</th>
                        <th className="px-4 py-2 font-normal">Role</th>
                        <th className="px-4 py-2 font-normal">Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.map((user) => (
                        <tr key={user.id} className="border-b border-border/60">
                          <td className="px-4 py-3">
                            <div className="font-mondwest text-sm uppercase text-midground">
                              {user.name || user.email || "Unnamed user"}
                            </div>
                            <div className="mt-1 max-w-[260px] truncate text-muted-foreground">
                              {user.email || user.id}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={user.role === "admin" ? "default" : "outline"}>
                              {user.role}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(user.created_at)}
                          </td>
                        </tr>
                      ))}
                      {users.length === 0 && (
                        <tr>
                          <td className="px-4 py-6 text-muted-foreground" colSpan={3}>
                            No users yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>

              <Card className={cn("enterprise-card", activeAccessTab !== "invites" && "hidden")}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="h-4 w-4" />
                Invites
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-left font-courier text-xs normal-case">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 font-normal">Status</th>
                      <th className="px-4 py-2 font-normal">Type</th>
                      <th className="px-4 py-2 font-normal">Invite</th>
                      <th className="px-4 py-2 font-normal">Agents</th>
                      <th className="px-4 py-2 font-normal">Channel</th>
                      <th className="px-4 py-2 font-normal">Uses</th>
                      <th className="px-4 py-2 font-normal">Expires</th>
                      <th className="px-4 py-2 font-normal">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {combinedInvites.map((invite) => (
                        <tr key={invite.id} className="border-b border-border/60">
                          <td className="px-4 py-3">
                            <Badge variant={invite.status.variant}>{invite.status.label}</Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            <Badge variant={invite.kind === "qr" ? "default" : "outline"}>
                              {invite.kind === "qr" ? "QR" : "Email"}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {invite.recipient}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {invite.agentLabel}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline">{invite.channelLabel}</Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {invite.uses}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(invite.expires_at)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(invite.created_at)}
                          </td>
                        </tr>
                    ))}
                    {combinedInvites.length === 0 && (
                      <tr>
                        <td className="px-4 py-6 text-muted-foreground" colSpan={8}>
                          No invites yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
              </Card>
            </section>
          )}
            </div>
          {showAgentUserDetail && (
            <AgentUserDetailView
              agent={agentUserDetail?.agent || selectedAgent}
              user={agentUserDetail?.user || selectedAgentUser}
              detail={agentUserDetail}
              loading={loadingAgentUserDetail}
              expandedSessionId={expandedAgentUserSessionId}
              sessionMessages={agentUserSessionMessages}
              onBack={() => setAgentUserDetailOpen(false)}
              onToggleSession={toggleAgentUserSession}
            />
          )}
        </>
      )}
    </main>
  );
}

function AgentUserDetailView({
  agent,
  user,
  detail,
  loading,
  expandedSessionId,
  sessionMessages,
  onBack,
  onToggleSession,
}: {
  agent: EnterpriseAgent | null;
  user: EnterpriseAgentUser | null;
  detail: EnterpriseAgentUserDetail | null;
  loading: boolean;
  expandedSessionId: string;
  sessionMessages: Record<string, SessionMessage[]>;
  onBack: () => void;
  onToggleSession: (session: SessionInfo) => void;
}) {
  const displayName = user?.name || user?.email || user?.id || "User";
  const cronJobs = detail?.cron_jobs || [];
  const builtinSkills = detail?.skills || [];
  const customSkills = detail?.custom_skills || [];
  const sessions = detail?.sessions || [];
  const bindings = detail?.social_bindings || [];
  const devices = detail?.local_devices || [];
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    sessions: true,
    cron: true,
    skills: true,
    gateways: false,
    devices: false,
  });
  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center bg-background/85 p-3 backdrop-blur-sm sm:p-5"
      role="dialog"
      aria-modal="true"
      onMouseDown={onBack}
    >
      <section
        className="flex max-h-[92dvh] w-full max-w-6xl min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-card shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
      <div className="flex shrink-0 flex-col gap-3 border-b border-border bg-card/95 p-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <Button type="button" variant="outline" size="sm" onClick={onBack}>
            <ChevronLeft className="h-3.5 w-3.5" />
            Close
          </Button>
          <h2 className="mt-3 truncate text-xl font-semibold normal-case text-midground">
            {displayName}
          </h2>
          <p className="mt-1 text-sm normal-case text-muted-foreground">
            {agent?.name || "Agent"} · {user?.email || user?.id || "-"}
          </p>
          <div className="mt-3 flex flex-wrap gap-1">
            <Badge variant={user?.disabled_at ? "outline" : "success"}>
              {user?.disabled_at ? "Disabled" : user?.access_role || user?.role || "member"}
            </Badge>
            <Badge variant="outline">{detail?.session_total ?? user?.session_count ?? 0} sessions</Badge>
            <Badge variant="outline">{cronJobs.length} cron</Badge>
            <Badge variant="outline">{builtinSkills.length + customSkills.length} skills</Badge>
            <Badge variant="outline">{bindings.length} gateways</Badge>
            <Badge variant="outline">{devices.length} local devices</Badge>
          </div>
        </div>
        <div className="text-xs normal-case text-muted-foreground sm:text-right">
          <div>Access granted: {formatDate(user?.access_created_at)}</div>
          <div className="mt-1">Last seen: {formatDate(user?.last_seen_at)}</div>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
      {loading && (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card/70 py-16">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && (
        <>
          <Card className="enterprise-card">
            <CardHeader className="p-0">
              <button
                type="button"
                onClick={() => toggleSection("sessions")}
                className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-white/45"
                aria-expanded={openSections.sessions}
              >
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Sessions
                    <Badge variant="outline">{detail?.session_total ?? sessions.length}</Badge>
                  </CardTitle>
                  <CardDescription className="mt-1 normal-case">
                    Conversation history for this user and agent.
                  </CardDescription>
                </div>
                {openSections.sessions ? (
                  <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            </CardHeader>
            {openSections.sessions && <CardContent className="max-h-[48dvh] space-y-2 overflow-y-auto">
              {sessions.map((session) => {
                const messages = sessionMessages[session.id];
                const expanded = expandedSessionId === session.id;
                return (
                  <div key={session.id} className="rounded-lg border border-border bg-background/40">
                    <button
                      type="button"
                      onClick={() => onToggleSession(session)}
                      className="block w-full px-3 py-3 text-left normal-case hover:bg-white/50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-midground">
                            {session.title || session.preview || "Untitled session"}
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {(session.model || "unknown").split("/").pop()} · {session.message_count} msgs · {formatDate(session.last_active)}
                          </div>
                        </div>
                        <Badge variant={session.is_active ? "success" : "outline"}>{session.source || "session"}</Badge>
                      </div>
                      {session.preview && (
                        <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{session.preview}</p>
                      )}
                    </button>
                    {expanded && (
                      <div className="border-t border-border bg-white/35 px-3 py-3">
                        {!messages ? (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading messages
                          </div>
                        ) : messages.length === 0 ? (
                          <div className="text-xs text-muted-foreground">No messages in this session.</div>
                        ) : (
                          <div className="space-y-3">
                            {messages.map((message, index) => (
                              <div key={`${session.id}-${index}`} className="rounded-md border border-border/70 bg-background/70 p-3">
                                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                  <span className="font-medium normal-case">{message.tool_name ? `tool: ${message.tool_name}` : message.role}</span>
                                  {message.timestamp && <span>{formatDate(message.timestamp)}</span>}
                                </div>
                                <div className="min-w-0 overflow-x-auto break-words text-sm normal-case">
                                  {message.content ? <Markdown content={message.content} /> : <span className="text-muted-foreground">No text content</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
              {sessions.length === 0 && (
                <div className="rounded-lg border border-border bg-background/40 px-3 py-8 text-center text-sm normal-case text-muted-foreground">
                  No sessions for this user and agent.
                </div>
              )}
            </CardContent>}
          </Card>

          <Card className="enterprise-card">
            <CardHeader className="p-0">
              <button
                type="button"
                onClick={() => toggleSection("cron")}
                className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-white/45"
                aria-expanded={openSections.cron}
              >
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <CalendarClock className="h-4 w-4" />
                    Cron Jobs
                    <Badge variant="outline">{cronJobs.length}</Badge>
                  </CardTitle>
                  <CardDescription className="mt-1 normal-case">
                    Scheduled work scoped to this user and agent.
                  </CardDescription>
                </div>
                {openSections.cron ? (
                  <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            </CardHeader>
            {openSections.cron && <CardContent className="space-y-2">
              {cronJobs.map((job) => (
                <div key={job.id} className="rounded-lg border border-border bg-background/40 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium normal-case text-midground">
                        {job.name || job.prompt.slice(0, 60)}
                      </div>
                      <div className="mt-1 truncate text-xs normal-case text-muted-foreground">
                        {job.schedule_display || job.schedule?.display || "-"} · Last: {job.last_status || "never"}
                      </div>
                    </div>
                    <Badge variant={job.enabled ? "success" : "outline"}>{job.state || (job.enabled ? "enabled" : "disabled")}</Badge>
                  </div>
                  {job.prompt && <p className="mt-2 line-clamp-2 text-xs normal-case text-muted-foreground">{job.prompt}</p>}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs normal-case text-muted-foreground">
                    <span>Next: {job.next_run_at || "-"}</span>
                    <span>Previous: {job.last_run_at || "-"}</span>
                  </div>
                  {job.last_error && <p className="mt-2 text-xs text-destructive">{job.last_error}</p>}
                </div>
              ))}
              {cronJobs.length === 0 && (
                <div className="rounded-lg border border-border bg-background/40 px-3 py-8 text-center text-sm normal-case text-muted-foreground">
                  No cron jobs for this user and agent.
                </div>
              )}
            </CardContent>}
          </Card>

          <Card className="enterprise-card">
            <CardHeader className="p-0">
              <button
                type="button"
                onClick={() => toggleSection("skills")}
                className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-white/45"
                aria-expanded={openSections.skills}
              >
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-4 w-4" />
                    Skills
                    <Badge variant="outline">{builtinSkills.length + customSkills.length}</Badge>
                  </CardTitle>
                  <CardDescription className="mt-1 normal-case">
                    Built-in skills selected by the user and custom private skills.
                  </CardDescription>
                </div>
                {openSections.skills ? (
                  <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                )}
              </button>
            </CardHeader>
            {openSections.skills && <CardContent className="grid gap-4 lg:grid-cols-2">
              <section className="rounded-lg border border-border bg-background/40 p-3">
                <div className="mb-2 text-xs font-medium normal-case text-muted-foreground">Built-in skills</div>
                <div className="flex flex-wrap gap-1">
                  {builtinSkills.map((skill) => (
                    <Badge key={skill} variant="outline">{skill}</Badge>
                  ))}
                </div>
                {builtinSkills.length === 0 && (
                  <div className="text-sm normal-case text-muted-foreground">No built-in skills enabled.</div>
                )}
              </section>
              <section className="rounded-lg border border-border bg-background/40 p-3">
                <div className="mb-2 text-xs font-medium normal-case text-muted-foreground">Custom skills</div>
                <div className="space-y-2">
                  {customSkills.map((skill) => (
                    <div key={skill.name} className="rounded-md border border-border/70 bg-white/40 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium normal-case text-midground">{skill.name}</span>
                        <Badge variant={skill.enabled ? "success" : "outline"}>{skill.enabled ? "enabled" : "off"}</Badge>
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs normal-case text-muted-foreground">
                        {skill.description || skill.content || "No description"}
                      </p>
                    </div>
                  ))}
                </div>
                {customSkills.length === 0 && (
                  <div className="text-sm normal-case text-muted-foreground">No custom skills configured.</div>
                )}
              </section>
            </CardContent>}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="enterprise-card">
              <CardHeader className="p-0">
                <button
                  type="button"
                  onClick={() => toggleSection("gateways")}
                  className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-white/45"
                  aria-expanded={openSections.gateways}
                >
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-4 w-4" />
                    Gateway Bindings
                    <Badge variant="outline">{bindings.length}</Badge>
                  </CardTitle>
                  {openSections.gateways ? (
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
              </CardHeader>
              {openSections.gateways && <CardContent className="space-y-2">
                {bindings.map((binding) => (
                  <div key={binding.id} className="rounded-lg border border-border bg-background/40 px-3 py-3 text-xs normal-case">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-midground">
                        {binding.platform}
                        {binding.binding_type === "local_device_gateway" ? " · local gateway" : ""}
                      </span>
                      <Badge variant={binding.revoked_at ? "outline" : "success"}>{binding.status}</Badge>
                    </div>
                    <div className="mt-1 truncate text-muted-foreground">
                      {binding.user_name_saved || binding.user_name || binding.external_user_id}
                    </div>
                    {binding.local_device_name && (
                      <div className="mt-1 truncate text-muted-foreground">Via: {binding.local_device_name}</div>
                    )}
                    <div className="mt-1 text-muted-foreground">Last seen: {formatDate(binding.last_seen_at)}</div>
                  </div>
                ))}
                {bindings.length === 0 && <div className="text-sm normal-case text-muted-foreground">No social gateway bindings.</div>}
              </CardContent>}
            </Card>

            <Card className="enterprise-card">
              <CardHeader className="p-0">
                <button
                  type="button"
                  onClick={() => toggleSection("devices")}
                  className="flex w-full items-start justify-between gap-3 p-4 text-left hover:bg-white/45"
                  aria-expanded={openSections.devices}
                >
                  <CardTitle className="flex items-center gap-2">
                    <Laptop className="h-4 w-4" />
                    Local Devices
                    <Badge variant="outline">{devices.length}</Badge>
                  </CardTitle>
                  {openSections.devices ? (
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
              </CardHeader>
              {openSections.devices && <CardContent className="space-y-2">
                {devices.map((device) => (
                  <div key={device.id} className="rounded-lg border border-border bg-background/40 px-3 py-3 text-xs normal-case">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate font-medium text-midground">{device.name || "Local Agent"}</span>
                      <Badge variant={device.revoked_at ? "outline" : "success"}>{device.revoked_at ? "Revoked" : device.status || "Active"}</Badge>
                    </div>
                    <div className="mt-1 text-muted-foreground">Last seen: {formatDate(device.last_seen_at)}</div>
                    <div className="mt-1 truncate text-muted-foreground">Device ID: {device.id}</div>
                  </div>
                ))}
                {devices.length === 0 && <div className="text-sm normal-case text-muted-foreground">No local devices.</div>}
              </CardContent>}
            </Card>
          </div>
        </>
      )}
      </div>
      </section>
    </div>,
    document.body,
  );
}

function Textarea({
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full resize-y border border-border bg-background/40 px-3 py-2 font-courier text-sm normal-case transition-colors placeholder:text-muted-foreground focus-visible:border-foreground/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30"
    />
  );
}

function OneTimeSecret({
  title,
  value,
  onCopy,
}: {
  title: string;
  value: string;
  onCopy: () => void;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Check className="h-3.5 w-3.5 shrink-0 text-success" />
          <span className="font-courier text-xs normal-case text-muted-foreground">
            {title}
          </span>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={onCopy}>
          <Copy className="h-3.5 w-3.5" />
          Copy
        </Button>
      </div>
      <code className="block overflow-x-auto whitespace-nowrap border border-border bg-black/30 px-2 py-2 font-courier text-xs normal-case text-midground">
        {value}
      </code>
    </div>
  );
}

function OverviewMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/30 px-3 py-2">
      <div className="text-xs font-medium normal-case text-muted-foreground">
        {label}
      </div>
      <div className="mt-1 truncate text-sm font-semibold normal-case text-midground">
        {value}
      </div>
    </div>
  );
}
