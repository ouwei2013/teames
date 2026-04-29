import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  Bot,
  Check,
  Copy,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  Ticket,
  UserPlus,
  UsersRound,
} from "lucide-react";
import { Typography } from "@nous-research/ui";
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
import {
  api,
  type EnterpriseAgent,
  type EnterpriseAgentPayload,
  type EnterpriseInvite,
  type EnterpriseInviteCreated,
  type EnterpriseStatusResponse,
  type EnterpriseUser,
} from "@/lib/api";
import { cn } from "@/lib/utils";

type InviteRole = "member" | "admin";

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

function inviteState(invite: EnterpriseInvite): {
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

async function copyText(value: string): Promise<void> {
  await navigator.clipboard.writeText(value);
}

export default function EnterpriseAdminPage() {
  const { toast, showToast } = useToast();
  const [status, setStatus] = useState<EnterpriseStatusResponse | null>(null);
  const [users, setUsers] = useState<EnterpriseUser[]>([]);
  const [agents, setAgents] = useState<EnterpriseAgent[]>([]);
  const [invites, setInvites] = useState<EnterpriseInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingInit, setSavingInit] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);
  const [savingAgent, setSavingAgent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adminApiKey, setAdminApiKey] = useState("");
  const [latestInvite, setLatestInvite] = useState<EnterpriseInviteCreated | null>(null);
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
  const inviteUrl = useMemo(() => {
    if (!latestInvite?.code) return "";
    return `${window.location.origin}/accept-invite?code=${encodeURIComponent(latestInvite.code)}`;
  }, [latestInvite]);

  async function loadEnterprise() {
    setLoading(true);
    setError(null);
    try {
      const nextStatus = await api.getEnterpriseStatus();
      setStatus(nextStatus);
      setUsers(nextStatus.users || []);
      setAgents(nextStatus.agents || []);
      if (nextStatus.initialized) {
        const [userResult, agentResult, inviteResult] = await Promise.all([
          api.getEnterpriseUsers(),
          api.getEnterpriseAgents(),
          api.getEnterpriseInvites(),
        ]);
        setUsers(userResult.users || []);
        setAgents(agentResult.agents || []);
        setInviteAgentIds((current) => {
          const valid = new Set((agentResult.agents || []).map((agent) => agent.id));
          const kept = current.filter((id) => valid.has(id));
          return kept.length ? kept : (agentResult.agents[0] ? [agentResult.agents[0].id] : []);
        });
        setInvites(inviteResult.invites || []);
      } else {
        setAgents([]);
        setInvites([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadEnterprise();
  }, []);

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
      showToast("Enterprise workspace initialized", "success");
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

  async function copyAndToast(value: string, label: string) {
    try {
      await copyText(value);
      showToast(`${label} copied`, "success");
    } catch {
      showToast("Copy failed", "error");
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

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-4 text-midground">
      <Toast toast={toast} />

      <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            <span className="font-courier text-xs normal-case text-muted-foreground">
              Admin console
            </span>
          </div>
          <Typography className="font-bold text-[1.35rem] leading-none tracking-[0.08em] sm:text-[1.75rem]">
            Enterprise
          </Typography>
          <p className="mt-2 max-w-2xl font-courier text-sm normal-case text-muted-foreground">
            Create the tenant, invite users, and manage workspace access for the
            browser portal.
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

      {error && (
        <div className="border border-destructive/40 bg-destructive/10 px-3 py-2 font-courier text-xs normal-case text-destructive">
          {error}
        </div>
      )}

      {!initialized ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-4 w-4" />
              Initialize Workspace
            </CardTitle>
            <CardDescription className="normal-case">
              This creates the first tenant and one admin API key. The key is
              shown once.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={initializeEnterprise} className="grid gap-4 lg:grid-cols-2">
              <label className="block lg:col-span-2">
                <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                  Company name
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
                  Tenant ID
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
      ) : (
        <>
          <section className="grid gap-3 md:grid-cols-4">
            <MetricCard
              icon={ShieldCheck}
              label="Tenant"
              value={status?.tenant?.name || "Configured"}
              detail={status?.tenant?.id || ""}
            />
            <MetricCard
              icon={Bot}
              label="Agents"
              value={String(agents.filter((agent) => agent.status === "active").length)}
              detail="Published business agents"
            />
            <MetricCard
              icon={UsersRound}
              label="Users"
              value={String(users.length)}
              detail="Active workspace identities"
            />
            <MetricCard
              icon={Ticket}
              label="Invites"
              value={String(invites.filter((invite) => inviteState(invite).label === "Active").length)}
              detail="Currently usable invites"
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Business Agent
                </CardTitle>
                <CardDescription className="normal-case">
                  Configure a reusable agent for any business workflow.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={saveAgent} className="grid gap-3">
                  <label className="block">
                    <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
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
                    <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
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
                      <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                        Role
                      </span>
                      <Textarea
                        value={agentForm.role_prompt || ""}
                        onChange={(value) => setAgentForm({ ...agentForm, role_prompt: value })}
                        placeholder="Who the agent is."
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                        Tasks
                      </span>
                      <Textarea
                        value={agentForm.task_prompt || ""}
                        onChange={(value) => setAgentForm({ ...agentForm, task_prompt: value })}
                        placeholder="What the agent should accomplish."
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                        Tone
                      </span>
                      <Textarea
                        value={agentForm.tone_prompt || ""}
                        onChange={(value) => setAgentForm({ ...agentForm, tone_prompt: value })}
                        placeholder="How the agent should communicate."
                      />
                    </label>
                    <label className="block">
                      <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
                        Escalation
                      </span>
                      <Textarea
                        value={agentForm.escalation_prompt || ""}
                        onChange={(value) => setAgentForm({ ...agentForm, escalation_prompt: value })}
                        placeholder="When to hand off to a human."
                      />
                    </label>
                  </div>
                  <label className="block">
                    <span className="mb-1 block font-courier text-xs normal-case text-muted-foreground">
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
                    <span className="mb-1 flex items-center justify-between gap-2 font-courier text-xs normal-case text-muted-foreground">
                      <span>Knowledge</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => knowledgeFileRef.current?.click()}
                      >
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-4 w-4" />
                  Agents
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-border">
                  {agents.map((agent) => (
                    <button
                      type="button"
                      key={agent.id}
                      onClick={() => editAgent(agent)}
                      className="block w-full px-4 py-3 text-left transition-colors hover:bg-foreground/5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-mondwest text-sm uppercase text-midground">
                            {agent.name}
                          </div>
                          <div className="mt-1 line-clamp-2 font-courier text-xs normal-case text-muted-foreground">
                            {agent.description || agent.task_prompt || "No description"}
                          </div>
                        </div>
                        <Badge variant={agent.status === "active" ? "success" : "outline"}>
                          {agent.status}
                        </Badge>
                      </div>
                    </button>
                  ))}
                  {agents.length === 0 && (
                    <div className="px-4 py-6 font-courier text-xs normal-case text-muted-foreground">
                      No agents yet.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
            <Card>
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

            <Card>
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
          </section>

          <Card>
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
                      <th className="px-4 py-2 font-normal">Email</th>
                      <th className="px-4 py-2 font-normal">Agents</th>
                      <th className="px-4 py-2 font-normal">Role</th>
                      <th className="px-4 py-2 font-normal">Uses</th>
                      <th className="px-4 py-2 font-normal">Expires</th>
                      <th className="px-4 py-2 font-normal">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invites.map((invite, index) => {
                      const state = inviteState(invite);
                      return (
                        <tr key={`${invite.created_at}-${index}`} className="border-b border-border/60">
                          <td className="px-4 py-3">
                            <Badge variant={state.variant}>{state.label}</Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {invite.email || "Any email"}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {(invite.agent_names || []).join(", ") || "Default Agent"}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={invite.role === "admin" ? "default" : "outline"}>
                              {invite.role}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {invite.uses}/{invite.max_uses}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(invite.expires_at)}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {formatDate(invite.created_at)}
                          </td>
                        </tr>
                      );
                    })}
                    {invites.length === 0 && (
                      <tr>
                        <td className="px-4 py-6 text-muted-foreground" colSpan={7}>
                          No invites yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </main>
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
    <div className="mt-4 border border-border bg-background/40 p-3">
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

function MetricCard({
  icon: Icon,
  label,
  value,
  detail,
}: {
  icon: typeof ShieldCheck;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <Card className="min-h-28">
      <CardContent className="flex h-full items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-border bg-background/50">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <p className="font-courier text-xs normal-case text-muted-foreground">
            {label}
          </p>
          <p className="mt-1 truncate font-mondwest text-xl uppercase text-midground">
            {value}
          </p>
          <p className={cn("mt-1 truncate font-courier text-xs normal-case text-muted-foreground")}>
            {detail}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
