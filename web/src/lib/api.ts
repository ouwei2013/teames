const BASE = "";

import type { DashboardTheme } from "@/themes/types";

// Ephemeral session token for protected endpoints.
// Injected into index.html by the server — never fetched via API.
declare global {
  interface Window {
    __HERMES_SESSION_TOKEN__?: string;
  }
}
let _sessionToken: string | null = null;
const SESSION_HEADER = "X-Hermes-Session-Token";
const TOKEN_RELOAD_FLAG = "hermes.dashboard.tokenReloaded";

function isPublicApiPath(url: string): boolean {
  const path = url.split("?", 1)[0];
  return (
    path === "/api/status" ||
    path === "/api/config/defaults" ||
    path === "/api/config/schema" ||
    path === "/api/model/info" ||
    path === "/api/dashboard/themes" ||
    path === "/api/dashboard/plugins" ||
    path === "/api/dashboard/plugins/rescan" ||
    path === "/api/enterprise/invites/redeem" ||
    path === "/api/enterprise/me" ||
    path === "/api/enterprise/chat" ||
    path.startsWith("/api/enterprise/portal/") ||
    path.startsWith("/api/plugins/")
  );
}

function shouldReloadForStaleDashboardToken(url: string, status: number): boolean {
  return status === 401 && url.startsWith("/api/") && !isPublicApiPath(url);
}

function setSessionHeader(headers: Headers, token: string): void {
  if (!headers.has(SESSION_HEADER)) {
    headers.set(SESSION_HEADER, token);
  }
}

export async function fetchJSON<T>(url: string, init?: RequestInit): Promise<T> {
  // Inject the session token into all /api/ requests.
  const headers = new Headers(init?.headers);
  const token = window.__HERMES_SESSION_TOKEN__;
  if (token) {
    setSessionHeader(headers, token);
  }
  const res = await fetch(`${BASE}${url}`, { ...init, headers });
  if (res.ok) {
    window.sessionStorage.removeItem(TOKEN_RELOAD_FLAG);
  }
  if (shouldReloadForStaleDashboardToken(url, res.status)) {
    const alreadyReloaded = window.sessionStorage.getItem(TOKEN_RELOAD_FLAG) === "1";
    if (!alreadyReloaded) {
      window.sessionStorage.setItem(TOKEN_RELOAD_FLAG, "1");
      window.location.reload();
      throw new Error("Dashboard session expired; reloading");
    }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json();
}

async function getSessionToken(): Promise<string> {
  if (_sessionToken) return _sessionToken;
  const injected = window.__HERMES_SESSION_TOKEN__;
  if (injected) {
    _sessionToken = injected;
    return _sessionToken;
  }
  throw new Error("Session token not available — page must be served by the Hermes dashboard server");
}

export const api = {
  getStatus: () => fetchJSON<StatusResponse>("/api/status"),
  getSessions: (limit = 20, offset = 0) =>
    fetchJSON<PaginatedSessions>(`/api/sessions?limit=${limit}&offset=${offset}`),
  getSessionMessages: (id: string) =>
    fetchJSON<SessionMessagesResponse>(`/api/sessions/${encodeURIComponent(id)}/messages`),
  deleteSession: (id: string) =>
    fetchJSON<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(id)}`, {
      method: "DELETE",
    }),
  getLogs: (params: { file?: string; lines?: number; level?: string; component?: string }) => {
    const qs = new URLSearchParams();
    if (params.file) qs.set("file", params.file);
    if (params.lines) qs.set("lines", String(params.lines));
    if (params.level && params.level !== "ALL") qs.set("level", params.level);
    if (params.component && params.component !== "all") qs.set("component", params.component);
    return fetchJSON<LogsResponse>(`/api/logs?${qs.toString()}`);
  },
  getAnalytics: (days: number) =>
    fetchJSON<AnalyticsResponse>(`/api/analytics/usage?days=${days}`),
  getConfig: () => fetchJSON<Record<string, unknown>>("/api/config"),
  getDefaults: () => fetchJSON<Record<string, unknown>>("/api/config/defaults"),
  getSchema: () => fetchJSON<{ fields: Record<string, unknown>; category_order: string[] }>("/api/config/schema"),
  getModelInfo: () => fetchJSON<ModelInfoResponse>("/api/model/info"),
  saveConfig: (config: Record<string, unknown>) =>
    fetchJSON<{ ok: boolean }>("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config }),
    }),
  getConfigRaw: () => fetchJSON<{ yaml: string }>("/api/config/raw"),
  saveConfigRaw: (yaml_text: string) =>
    fetchJSON<{ ok: boolean }>("/api/config/raw", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ yaml_text }),
    }),
  getEnvVars: () => fetchJSON<Record<string, EnvVarInfo>>("/api/env"),
  setEnvVar: (key: string, value: string) =>
    fetchJSON<{ ok: boolean }>("/api/env", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value }),
    }),
  deleteEnvVar: (key: string) =>
    fetchJSON<{ ok: boolean }>("/api/env", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    }),
  revealEnvVar: async (key: string) => {
    const token = await getSessionToken();
    return fetchJSON<{ key: string; value: string }>("/api/env/reveal", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [SESSION_HEADER]: token,
      },
      body: JSON.stringify({ key }),
    });
  },

  // Cron jobs
  getCronJobs: () => fetchJSON<CronJob[]>("/api/cron/jobs"),
  createCronJob: (job: { prompt: string; schedule: string; name?: string; deliver?: string }) =>
    fetchJSON<CronJob>("/api/cron/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(job),
    }),
  pauseCronJob: (id: string) =>
    fetchJSON<{ ok: boolean }>(`/api/cron/jobs/${id}/pause`, { method: "POST" }),
  resumeCronJob: (id: string) =>
    fetchJSON<{ ok: boolean }>(`/api/cron/jobs/${id}/resume`, { method: "POST" }),
  triggerCronJob: (id: string) =>
    fetchJSON<{ ok: boolean }>(`/api/cron/jobs/${id}/trigger`, { method: "POST" }),
  deleteCronJob: (id: string) =>
    fetchJSON<{ ok: boolean }>(`/api/cron/jobs/${id}`, { method: "DELETE" }),

  // Skills & Toolsets
  getSkills: () => fetchJSON<SkillInfo[]>("/api/skills"),
  toggleSkill: (name: string, enabled: boolean) =>
    fetchJSON<{ ok: boolean }>("/api/skills/toggle", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, enabled }),
    }),
  getToolsets: () => fetchJSON<ToolsetInfo[]>("/api/tools/toolsets"),

  // Session search (FTS5)
  searchSessions: (q: string) =>
    fetchJSON<SessionSearchResponse>(`/api/sessions/search?q=${encodeURIComponent(q)}`),

  // OAuth provider management
  getOAuthProviders: () =>
    fetchJSON<OAuthProvidersResponse>("/api/providers/oauth"),
  disconnectOAuthProvider: async (providerId: string) => {
    const token = await getSessionToken();
    return fetchJSON<{ ok: boolean; provider: string }>(
      `/api/providers/oauth/${encodeURIComponent(providerId)}`,
      {
        method: "DELETE",
        headers: { [SESSION_HEADER]: token },
      },
    );
  },
  startOAuthLogin: async (providerId: string) => {
    const token = await getSessionToken();
    return fetchJSON<OAuthStartResponse>(
      `/api/providers/oauth/${encodeURIComponent(providerId)}/start`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [SESSION_HEADER]: token,
        },
        body: "{}",
      },
    );
  },
  submitOAuthCode: async (providerId: string, sessionId: string, code: string) => {
    const token = await getSessionToken();
    return fetchJSON<OAuthSubmitResponse>(
      `/api/providers/oauth/${encodeURIComponent(providerId)}/submit`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          [SESSION_HEADER]: token,
        },
        body: JSON.stringify({ session_id: sessionId, code }),
      },
    );
  },
  pollOAuthSession: (providerId: string, sessionId: string) =>
    fetchJSON<OAuthPollResponse>(
      `/api/providers/oauth/${encodeURIComponent(providerId)}/poll/${encodeURIComponent(sessionId)}`,
    ),
  cancelOAuthSession: async (sessionId: string) => {
    const token = await getSessionToken();
    return fetchJSON<{ ok: boolean }>(
      `/api/providers/oauth/sessions/${encodeURIComponent(sessionId)}`,
      {
        method: "DELETE",
        headers: { [SESSION_HEADER]: token },
      },
    );
  },

  // Gateway / update actions
  restartGateway: () =>
    fetchJSON<ActionResponse>("/api/gateway/restart", { method: "POST" }),
  updateHermes: () =>
    fetchJSON<ActionResponse>("/api/hermes/update", { method: "POST" }),
  getActionStatus: (name: string, lines = 200) =>
    fetchJSON<ActionStatusResponse>(
      `/api/actions/${encodeURIComponent(name)}/status?lines=${lines}`,
    ),

  // Dashboard plugins
  getPlugins: () =>
    fetchJSON<PluginManifestResponse[]>("/api/dashboard/plugins"),
  rescanPlugins: () =>
    fetchJSON<{ ok: boolean; count: number }>("/api/dashboard/plugins/rescan"),

  // Dashboard themes
  getThemes: () =>
    fetchJSON<DashboardThemesResponse>("/api/dashboard/themes"),
  setTheme: (name: string) =>
    fetchJSON<{ ok: boolean; theme: string }>("/api/dashboard/theme", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    }),

  getEnterpriseStatus: () =>
    fetchJSON<EnterpriseStatusResponse>("/api/enterprise/status"),
  initEnterprise: (payload: {
    name: string;
    tenant_id?: string;
    admin_email?: string;
    admin_name?: string;
  }) =>
    fetchJSON<EnterpriseInitResponse>("/api/enterprise/init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  getEnterpriseUsers: () =>
    fetchJSON<{ users: EnterpriseUser[] }>("/api/enterprise/users"),
  getEnterpriseAgents: () =>
    fetchJSON<{ agents: EnterpriseAgent[] }>("/api/enterprise/agents"),
  createEnterpriseAgent: (payload: EnterpriseAgentPayload) =>
    fetchJSON<{ agent: EnterpriseAgent }>("/api/enterprise/agents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  updateEnterpriseAgent: (id: string, payload: EnterpriseAgentPayload) =>
    fetchJSON<{ agent: EnterpriseAgent }>(
      `/api/enterprise/agents/${encodeURIComponent(id)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    ),
  getEnterpriseInvites: () =>
    fetchJSON<{ invites: EnterpriseInvite[] }>("/api/enterprise/invites"),
  createEnterpriseInvite: (payload: {
    email?: string;
    role?: "member" | "admin";
    max_uses?: number;
    expires_days?: number | null;
    agent_ids?: string[];
  }) =>
    fetchJSON<EnterpriseInviteCreated>("/api/enterprise/invites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),

  redeemEnterpriseInvite: (payload: { code: string; email?: string; name?: string }) =>
    fetchJSON<EnterpriseRedeemResponse>("/api/enterprise/invites/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  getEnterpriseMe: (token: string) =>
    fetchJSON<EnterpriseMeResponse>("/api/enterprise/me", {
      headers: { Authorization: `Bearer ${token}` },
    }),
  enterpriseChat: (payload: {
    token: string;
    message: string;
    session_id?: string;
    agent_id?: string;
  }) =>
    fetchJSON<EnterpriseChatResponse>("/api/enterprise/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${payload.token}`,
      },
      body: JSON.stringify({
        message: payload.message,
        session_id: payload.session_id,
        agent_id: payload.agent_id,
      }),
      }),
  getEnterprisePortalSkills: (token: string, agentId?: string) => {
    const qs = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : "";
    return fetchJSON<{ agent: EnterpriseAgent; skills: SkillInfo[]; selected: string[] }>(
      `/api/enterprise/portal/skills${qs}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  },
  toggleEnterprisePortalSkill: (payload: {
    token: string;
    agent_id: string;
    name: string;
    enabled: boolean;
  }) =>
    fetchJSON<{ ok: boolean; name: string; enabled: boolean; selected: string[] }>(
      "/api/enterprise/portal/skills/toggle",
      {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${payload.token}`,
        },
        body: JSON.stringify({
          agent_id: payload.agent_id,
          name: payload.name,
          enabled: payload.enabled,
        }),
      },
    ),
  getEnterprisePortalToolsets: (token: string, agentId?: string) => {
    const qs = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : "";
    return fetchJSON<{ agent: EnterpriseAgent; toolsets: ToolsetInfo[] }>(
      `/api/enterprise/portal/tools/toolsets${qs}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  },
  getEnterprisePortalCronJobs: (token: string, agentId?: string) => {
    const qs = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : "";
    return fetchJSON<{ agent: EnterpriseAgent; jobs: CronJob[] }>(
      `/api/enterprise/portal/cron/jobs${qs}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  },
  createEnterprisePortalCronJob: (payload: {
    token: string;
    agent_id: string;
    prompt: string;
    schedule: string;
    name?: string;
  }) =>
    fetchJSON<CronJob>("/api/enterprise/portal/cron/jobs", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${payload.token}`,
      },
      body: JSON.stringify({
        agent_id: payload.agent_id,
        prompt: payload.prompt,
        schedule: payload.schedule,
        name: payload.name,
      }),
    }),
  pauseEnterprisePortalCronJob: (token: string, id: string) =>
    fetchJSON<CronJob>(`/api/enterprise/portal/cron/jobs/${encodeURIComponent(id)}/pause`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  resumeEnterprisePortalCronJob: (token: string, id: string) =>
    fetchJSON<CronJob>(`/api/enterprise/portal/cron/jobs/${encodeURIComponent(id)}/resume`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    }),
  deleteEnterprisePortalCronJob: (token: string, id: string) =>
    fetchJSON<{ ok: boolean }>(`/api/enterprise/portal/cron/jobs/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    }),
  getEnterprisePortalLocalDevices: (token: string, agentId?: string) => {
    const qs = agentId ? `?agent_id=${encodeURIComponent(agentId)}` : "";
    return fetchJSON<{ agent: EnterpriseAgent; devices: EnterpriseLocalDevice[] }>(
      `/api/enterprise/portal/local-devices${qs}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
  },
  createEnterprisePortalLocalDeviceCode: (payload: {
    token: string;
    agent_id: string;
    label?: string;
    expires_minutes?: number;
  }) =>
    fetchJSON<EnterpriseLocalDeviceCode>("/api/enterprise/portal/local-devices/code", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${payload.token}`,
      },
      body: JSON.stringify({
        agent_id: payload.agent_id,
        label: payload.label,
        expires_minutes: payload.expires_minutes,
      }),
    }),
  getEnterpriseLocalDevices: () =>
    fetchJSON<{ devices: EnterpriseLocalDevice[] }>("/api/enterprise/local-devices"),
  createEnterpriseLocalRequest: (payload: { device_id: string; request: string }) =>
    fetchJSON<{ request: EnterpriseLocalRequest }>("/api/enterprise/local-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  getEnterpriseLocalRequests: (deviceId?: string) => {
    const qs = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : "";
    return fetchJSON<{ requests: EnterpriseLocalRequest[] }>(`/api/enterprise/local-requests${qs}`);
  },
};

export interface EnterpriseUser {
  id: string;
  tenant_id: string;
  email?: string | null;
  name?: string | null;
  role: string;
  created_at?: number;
  disabled_at?: number | null;
}

export interface EnterpriseTenant {
  id: string;
  name: string;
  created_at: number;
}

export interface EnterpriseStatusResponse {
  initialized: boolean;
  tenant: EnterpriseTenant | null;
  users: EnterpriseUser[];
  agents?: EnterpriseAgent[];
}

export interface EnterpriseInitResponse {
  tenant: EnterpriseTenant;
  admin_user?: EnterpriseUser;
  admin_api_key?: string;
  agent?: EnterpriseAgent;
  created: boolean;
}

export interface EnterpriseAgent {
  id: string;
  tenant_id: string;
  name: string;
  description?: string | null;
  status: "active" | "disabled" | string;
  role_prompt?: string | null;
  task_prompt?: string | null;
  tone_prompt?: string | null;
  instructions?: string | null;
  escalation_prompt?: string | null;
  knowledge?: string | null;
  access_role?: string | null;
  created_by_user_id?: string | null;
  created_at: number;
  updated_at: number;
}

export interface EnterpriseAgentPayload {
  name: string;
  description?: string;
  role_prompt?: string;
  task_prompt?: string;
  tone_prompt?: string;
  instructions?: string;
  escalation_prompt?: string;
  knowledge?: string;
  status?: string;
}

export interface EnterpriseInvite {
  tenant_id: string;
  email?: string | null;
  role: string;
  max_uses: number;
  uses: number;
  expires_at?: number | null;
  created_by_user_id?: string | null;
  created_at: number;
  revoked_at?: number | null;
  agent_ids?: string[];
  agent_names?: string[];
}

export interface EnterpriseInviteCreated extends EnterpriseInvite {
  code: string;
}

export interface EnterpriseRedeemResponse {
  user: EnterpriseUser;
  api_key: string;
  api_base: string;
  agents: EnterpriseAgent[];
}

export interface EnterpriseMeResponse {
  user: EnterpriseUser;
  agents: EnterpriseAgent[];
}

export interface EnterpriseChatResponse {
  session_id: string;
  final_response: string;
  user: EnterpriseUser;
  agent?: EnterpriseAgent;
  agents?: EnterpriseAgent[];
}

export interface EnterpriseLocalDevice {
  id: string;
  tenant_id: string;
  user_id: string;
  agent_id: string;
  name: string;
  status: string;
  created_at: number;
  last_seen_at?: number | null;
  revoked_at?: number | null;
  user_email?: string | null;
  user_name?: string | null;
  agent_name?: string | null;
}

export interface EnterpriseLocalDeviceCode {
  code: string;
  tenant_id: string;
  user_id: string;
  agent_id: string;
  agent_name: string;
  label?: string | null;
  created_at: number;
  expires_at: number;
}

export interface EnterpriseLocalRequest {
  id: string;
  tenant_id: string;
  user_id: string;
  agent_id: string;
  device_id: string;
  requester_user_id?: string | null;
  request: string;
  response?: string | null;
  status: string;
  created_at: number;
  updated_at: number;
  delivered_at?: number | null;
  responded_at?: number | null;
  device_name?: string | null;
  user_email?: string | null;
  user_name?: string | null;
  agent_name?: string | null;
}

export interface ActionResponse {
  name: string;
  ok: boolean;
  pid: number;
}

export interface ActionStatusResponse {
  exit_code: number | null;
  lines: string[];
  name: string;
  pid: number | null;
  running: boolean;
}

export interface PlatformStatus {
  error_code?: string;
  error_message?: string;
  state: string;
  updated_at: string;
}

export interface StatusResponse {
  active_sessions: number;
  config_path: string;
  config_version: number;
  env_path: string;
  gateway_exit_reason: string | null;
  gateway_health_url: string | null;
  gateway_pid: number | null;
  gateway_platforms: Record<string, PlatformStatus>;
  gateway_running: boolean;
  gateway_state: string | null;
  gateway_updated_at: string | null;
  hermes_home: string;
  latest_config_version: number;
  release_date: string;
  version: string;
}

export interface SessionInfo {
  id: string;
  source: string | null;
  model: string | null;
  title: string | null;
  started_at: number;
  ended_at: number | null;
  last_active: number;
  is_active: boolean;
  message_count: number;
  tool_call_count: number;
  input_tokens: number;
  output_tokens: number;
  preview: string | null;
}

export interface PaginatedSessions {
  sessions: SessionInfo[];
  total: number;
  limit: number;
  offset: number;
}

export interface EnvVarInfo {
  is_set: boolean;
  redacted_value: string | null;
  description: string;
  url: string | null;
  category: string;
  is_password: boolean;
  tools: string[];
  advanced: boolean;
}

export interface SessionMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string | null;
  tool_calls?: Array<{
    id: string;
    function: { name: string; arguments: string };
  }>;
  tool_name?: string;
  tool_call_id?: string;
  timestamp?: number;
}

export interface SessionMessagesResponse {
  session_id: string;
  messages: SessionMessage[];
}

export interface LogsResponse {
  file: string;
  lines: string[];
}

export interface AnalyticsDailyEntry {
  day: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  reasoning_tokens: number;
  estimated_cost: number;
  actual_cost: number;
  sessions: number;
  api_calls: number;
}

export interface AnalyticsModelEntry {
  model: string;
  input_tokens: number;
  output_tokens: number;
  estimated_cost: number;
  sessions: number;
  api_calls: number;
}

export interface AnalyticsSkillEntry {
  skill: string;
  view_count: number;
  manage_count: number;
  total_count: number;
  percentage: number;
  last_used_at: number | null;
}

export interface AnalyticsSkillsSummary {
  total_skill_loads: number;
  total_skill_edits: number;
  total_skill_actions: number;
  distinct_skills_used: number;
}

export interface AnalyticsResponse {
  daily: AnalyticsDailyEntry[];
  by_model: AnalyticsModelEntry[];
  totals: {
    total_input: number;
    total_output: number;
    total_cache_read: number;
    total_reasoning: number;
    total_estimated_cost: number;
    total_actual_cost: number;
    total_sessions: number;
    total_api_calls: number;
  };
  skills: {
    summary: AnalyticsSkillsSummary;
    top_skills: AnalyticsSkillEntry[];
  };
}

export interface CronJob {
  id: string;
  name?: string;
  prompt: string;
  schedule: { kind: string; expr: string; display: string };
  schedule_display: string;
  enabled: boolean;
  state: string;
  deliver?: string;
  last_run_at?: string | null;
  last_status?: string | null;
  next_run_at?: string | null;
  last_error?: string | null;
  latest_output?: string | null;
}

export interface SkillInfo {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
}

export interface ToolsetInfo {
  name: string;
  label: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  tools: string[];
}

export interface SessionSearchResult {
  session_id: string;
  snippet: string;
  role: string | null;
  source: string | null;
  model: string | null;
  session_started: number | null;
}

export interface SessionSearchResponse {
  results: SessionSearchResult[];
}

// ── Model info types ──────────────────────────────────────────────────

export interface ModelInfoResponse {
  model: string;
  provider: string;
  auto_context_length: number;
  config_context_length: number;
  effective_context_length: number;
  capabilities: {
    supports_tools?: boolean;
    supports_vision?: boolean;
    supports_reasoning?: boolean;
    context_window?: number;
    max_output_tokens?: number;
    model_family?: string;
  };
}

// ── OAuth provider types ────────────────────────────────────────────────

export interface OAuthProviderStatus {
  logged_in: boolean;
  source?: string | null;
  source_label?: string | null;
  token_preview?: string | null;
  expires_at?: string | null;
  has_refresh_token?: boolean;
  last_refresh?: string | null;
  error?: string;
}

export interface OAuthProvider {
  id: string;
  name: string;
  /** "pkce" (browser redirect + paste code), "device_code" (show code + URL),
   *  or "external" (delegated to a separate CLI like Claude Code or Qwen). */
  flow: "pkce" | "device_code" | "external";
  cli_command: string;
  docs_url: string;
  status: OAuthProviderStatus;
}

export interface OAuthProvidersResponse {
  providers: OAuthProvider[];
}

/** Discriminated union — the shape of /start depends on the flow. */
export type OAuthStartResponse =
  | {
      session_id: string;
      flow: "pkce";
      auth_url: string;
      expires_in: number;
    }
  | {
      session_id: string;
      flow: "device_code";
      user_code: string;
      verification_url: string;
      expires_in: number;
      poll_interval: number;
    };

export interface OAuthSubmitResponse {
  ok: boolean;
  status: "approved" | "error";
  message?: string;
}

export interface OAuthPollResponse {
  session_id: string;
  status: "pending" | "approved" | "denied" | "expired" | "error";
  error_message?: string | null;
  expires_at?: number | null;
}

// ── Dashboard theme types ──────────────────────────────────────────────

export interface DashboardThemeSummary {
  description: string;
  label: string;
  name: string;
  /** Full theme definition for user themes; undefined for built-ins
   *  (which the frontend already has locally). */
  definition?: DashboardTheme;
}

export interface DashboardThemesResponse {
  active: string;
  themes: DashboardThemeSummary[];
}

// ── Dashboard plugin types ─────────────────────────────────────────────

export interface PluginManifestResponse {
  name: string;
  label: string;
  description: string;
  icon: string;
  version: string;
  tab: {
    path: string;
    position?: string;
    override?: string;
    hidden?: boolean;
  };
  entry: string;
  css?: string | null;
  has_api: boolean;
  source: string;
}
