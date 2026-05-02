"""Enterprise tenant, business-agent, invite, and user-token storage."""

from __future__ import annotations

import hashlib
import secrets
import sqlite3
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from agent.access_context import AccessContext
from hermes_constants import get_hermes_home


DEFAULT_ENTERPRISE_DB_PATH = get_hermes_home() / "enterprise.db"


SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS enterprise_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    email TEXT,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    api_key_hash TEXT UNIQUE,
    created_at REAL NOT NULL,
    disabled_at REAL
);

CREATE TABLE IF NOT EXISTS invites (
    code_hash TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    email TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    max_uses INTEGER NOT NULL DEFAULT 1,
    uses INTEGER NOT NULL DEFAULT 0,
    expires_at REAL,
    created_by_user_id TEXT,
    created_at REAL NOT NULL,
    revoked_at REAL
);

CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    role_prompt TEXT,
    task_prompt TEXT,
    tone_prompt TEXT,
    instructions TEXT,
    escalation_prompt TEXT,
    knowledge TEXT,
    created_by_user_id TEXT,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS user_agent_access (
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    role TEXT NOT NULL DEFAULT 'user',
    granted_by_user_id TEXT,
    created_at REAL NOT NULL,
    PRIMARY KEY (user_id, agent_id)
);

CREATE TABLE IF NOT EXISTS invite_agents (
    code_hash TEXT NOT NULL REFERENCES invites(code_hash) ON DELETE CASCADE,
    agent_id TEXT NOT NULL REFERENCES agents(id),
    PRIMARY KEY (code_hash, agent_id)
);

CREATE TABLE IF NOT EXISTS user_agent_skills (
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    skill_name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at REAL NOT NULL,
    PRIMARY KEY (user_id, agent_id, skill_name)
);

CREATE TABLE IF NOT EXISTS agent_skill_catalog (
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    skill_name TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    updated_at REAL NOT NULL,
    PRIMARY KEY (tenant_id, agent_id, skill_name)
);

CREATE TABLE IF NOT EXISTS user_agent_custom_skills (
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    name TEXT NOT NULL,
    description TEXT,
    content TEXT NOT NULL,
    category TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    PRIMARY KEY (user_id, agent_id, name)
);

CREATE TABLE IF NOT EXISTS local_device_codes (
    code_hash TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    label TEXT,
    created_at REAL NOT NULL,
    expires_at REAL NOT NULL,
    redeemed_at REAL
);

CREATE TABLE IF NOT EXISTS local_devices (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    name TEXT NOT NULL,
    api_key_hash TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at REAL NOT NULL,
    last_seen_at REAL,
    revoked_at REAL
);

CREATE TABLE IF NOT EXISTS local_agent_requests (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES tenants(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    agent_id TEXT NOT NULL REFERENCES agents(id),
    device_id TEXT NOT NULL REFERENCES local_devices(id),
    requester_user_id TEXT,
    request TEXT NOT NULL,
    response TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at REAL NOT NULL,
    updated_at REAL NOT NULL,
    delivered_at REAL,
    responded_at REAL
);

CREATE INDEX IF NOT EXISTS idx_enterprise_users_tenant ON users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_users_key ON users(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_enterprise_invites_tenant ON invites(tenant_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_agents_tenant ON agents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_access_user ON user_agent_access(user_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_access_agent ON user_agent_access(agent_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_user_agent_skills
    ON user_agent_skills(tenant_id, user_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_agent_skill_catalog
    ON agent_skill_catalog(tenant_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_user_agent_custom_skills
    ON user_agent_custom_skills(tenant_id, user_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_local_devices_tenant
    ON local_devices(tenant_id, user_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_local_device_codes_user
    ON local_device_codes(tenant_id, user_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_enterprise_local_requests_device
    ON local_agent_requests(device_id, status, created_at);
CREATE INDEX IF NOT EXISTS idx_enterprise_local_requests_tenant
    ON local_agent_requests(tenant_id, user_id, agent_id, created_at);
"""


def _hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def _new_user_token() -> str:
    return "hmt_" + secrets.token_urlsafe(32)


def _new_invite_code() -> str:
    return "hmi_" + secrets.token_urlsafe(18)


def _new_agent_id() -> str:
    return "agent_" + uuid.uuid4().hex[:12]


def _new_device_id() -> str:
    return "dev_" + uuid.uuid4().hex[:12]


def _new_device_code() -> str:
    return "hmd_" + secrets.token_urlsafe(18)


def _new_device_token() -> str:
    return "hmdt_" + secrets.token_urlsafe(32)


def _new_bridge_request_id() -> str:
    return "lreq_" + uuid.uuid4().hex[:12]


def _clean_text(value: Optional[str]) -> Optional[str]:
    text = (value or "").strip()
    return text or None


class EnterpriseStore:
    """SQLite-backed enterprise onboarding store.

    Stores only hashes for invite codes and user API keys. Plain invite codes
    and user tokens are returned once at creation/redeem time.
    """

    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or DEFAULT_ENTERPRISE_DB_PATH
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self._conn = sqlite3.connect(str(self.db_path), check_same_thread=False)
        self._conn.row_factory = sqlite3.Row
        self._conn.execute("PRAGMA foreign_keys=ON")
        self._conn.executescript(SCHEMA_SQL)
        self._repair_schema()
        self._ensure_default_agents()
        self._conn.commit()

    def close(self) -> None:
        if self._conn:
            self._conn.close()
            self._conn = None

    def is_initialized(self) -> bool:
        row = self._conn.execute("SELECT 1 FROM tenants LIMIT 1").fetchone()
        return row is not None

    def get_default_tenant(self) -> Optional[Dict[str, Any]]:
        row = self._conn.execute("SELECT * FROM tenants ORDER BY created_at LIMIT 1").fetchone()
        return dict(row) if row else None

    def _repair_schema(self) -> None:
        """Defensively add columns/tables for older enterprise.db files."""
        self._conn.executescript(SCHEMA_SQL)

    def _ensure_default_agents(self) -> None:
        tenants = self._conn.execute("SELECT * FROM tenants").fetchall()
        for tenant_row in tenants:
            tenant = dict(tenant_row)
            existing = self._conn.execute(
                "SELECT id FROM agents WHERE tenant_id = ? LIMIT 1",
                (tenant["id"],),
            ).fetchone()
            if existing:
                continue
            with self._conn:
                agent = self.create_agent(
                    name="Default Agent",
                    description="General-purpose business assistant",
                    role_prompt="You are a helpful business assistant for this organization.",
                    task_prompt="Answer user questions accurately and help with business workflows.",
                    tone_prompt="Use a professional, concise, and friendly tone.",
                    instructions=(
                        "If the answer depends on business policy or uploaded materials "
                        "that are not available, say what information is missing instead "
                        "of guessing."
                    ),
                    escalation_prompt=(
                        "Escalate to a human administrator when the request requires a "
                        "decision, refund, legal commitment, account access, or private "
                        "business data not provided by the user."
                    ),
                    knowledge="",
                    tenant_id=tenant["id"],
                    commit=False,
                )
                users = self._conn.execute(
                    "SELECT id, role FROM users WHERE tenant_id = ? AND disabled_at IS NULL",
                    (tenant["id"],),
                ).fetchall()
                for user in users:
                    self.grant_agent_access(
                        user_id=user["id"],
                        agent_id=agent["id"],
                        role="manager" if user["role"] == "admin" else "user",
                        tenant_id=tenant["id"],
                        commit=False,
                    )

    def initialize_tenant(
        self,
        *,
        name: str,
        tenant_id: Optional[str] = None,
        admin_email: Optional[str] = None,
        admin_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        tenant_name = (name or "").strip()
        if not tenant_name:
            raise ValueError("tenant name is required")
        existing = self.get_default_tenant()
        if existing:
            return {"tenant": existing, "created": False}

        tid = (tenant_id or "").strip() or f"tenant_{uuid.uuid4().hex[:12]}"
        now = time.time()
        admin_token = _new_user_token()
        admin_user_id = f"user_{uuid.uuid4().hex[:12]}"
        with self._conn:
            self._conn.execute(
                "INSERT INTO tenants (id, name, created_at) VALUES (?, ?, ?)",
                (tid, tenant_name, now),
            )
            self._conn.execute(
                """INSERT INTO users
                   (id, tenant_id, email, name, role, api_key_hash, created_at)
                   VALUES (?, ?, ?, ?, 'admin', ?, ?)""",
                (
                    admin_user_id,
                    tid,
                    (admin_email or "").strip() or None,
                    (admin_name or "").strip() or "Admin",
                    _hash_secret(admin_token),
                    now,
                ),
            )
            agent = self.create_agent(
                name="Default Agent",
                description="General-purpose business assistant",
                role_prompt="You are a helpful business assistant for this organization.",
                task_prompt="Answer user questions accurately and help with business workflows.",
                tone_prompt="Use a professional, concise, and friendly tone.",
                instructions="If the answer depends on business policy or uploaded materials that are not available, say what information is missing instead of guessing.",
                escalation_prompt="Escalate to a human administrator when the request requires a decision, refund, legal commitment, account access, or private business data not provided by the user.",
                knowledge="",
                created_by_user_id=admin_user_id,
                tenant_id=tid,
                commit=False,
            )
            self.grant_agent_access(
                user_id=admin_user_id,
                agent_id=agent["id"],
                role="manager",
                tenant_id=tid,
                granted_by_user_id=admin_user_id,
                commit=False,
            )
        return {
            "tenant": {"id": tid, "name": tenant_name, "created_at": now},
            "admin_user": {
                "id": admin_user_id,
                "tenant_id": tid,
                "email": (admin_email or "").strip() or None,
                "name": (admin_name or "").strip() or "Admin",
                "role": "admin",
            },
            "admin_api_key": admin_token,
            "agent": agent,
            "created": True,
        }

    def list_agents(self, *, tenant_id: Optional[str] = None) -> List[Dict[str, Any]]:
        tenant = self.get_default_tenant()
        tid = tenant_id or (tenant["id"] if tenant else None)
        if not tid:
            return []
        rows = self._conn.execute(
            """SELECT * FROM agents
               WHERE tenant_id = ?
               ORDER BY updated_at DESC, created_at DESC""",
            (tid,),
        ).fetchall()
        return [dict(r) for r in rows]

    def get_agent(self, agent_id: str, *, tenant_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        if not agent_id:
            return None
        tenant = self.get_default_tenant()
        tid = tenant_id or (tenant["id"] if tenant else None)
        if not tid:
            return None
        row = self._conn.execute(
            "SELECT * FROM agents WHERE id = ? AND tenant_id = ?",
            (agent_id, tid),
        ).fetchone()
        return dict(row) if row else None

    def create_agent(
        self,
        *,
        name: str,
        description: Optional[str] = None,
        role_prompt: Optional[str] = None,
        task_prompt: Optional[str] = None,
        tone_prompt: Optional[str] = None,
        instructions: Optional[str] = None,
        escalation_prompt: Optional[str] = None,
        knowledge: Optional[str] = None,
        created_by_user_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
        commit: bool = True,
    ) -> Dict[str, Any]:
        tenant = self.get_default_tenant()
        tid = tenant_id or (tenant["id"] if tenant else None)
        if not tid:
            raise ValueError("enterprise tenant is not initialized")
        agent_name = (name or "").strip()
        if not agent_name:
            raise ValueError("agent name is required")
        agent_id = _new_agent_id()
        now = time.time()
        params = (
            agent_id,
            tid,
            agent_name,
            _clean_text(description),
            _clean_text(role_prompt),
            _clean_text(task_prompt),
            _clean_text(tone_prompt),
            _clean_text(instructions),
            _clean_text(escalation_prompt),
            _clean_text(knowledge),
            created_by_user_id,
            now,
            now,
        )
        sql = """INSERT INTO agents
                 (id, tenant_id, name, description, status, role_prompt,
                  task_prompt, tone_prompt, instructions, escalation_prompt,
                  knowledge, created_by_user_id, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?)"""
        if commit:
            with self._conn:
                self._conn.execute(sql, params)
        else:
            self._conn.execute(sql, params)
        return self.get_agent(agent_id, tenant_id=tid) or {
            "id": agent_id,
            "tenant_id": tid,
            "name": agent_name,
            "description": _clean_text(description),
            "status": "active",
            "role_prompt": _clean_text(role_prompt),
            "task_prompt": _clean_text(task_prompt),
            "tone_prompt": _clean_text(tone_prompt),
            "instructions": _clean_text(instructions),
            "escalation_prompt": _clean_text(escalation_prompt),
            "knowledge": _clean_text(knowledge),
            "created_by_user_id": created_by_user_id,
            "created_at": now,
            "updated_at": now,
        }

    def update_agent(
        self,
        agent_id: str,
        *,
        name: Optional[str] = None,
        description: Optional[str] = None,
        role_prompt: Optional[str] = None,
        task_prompt: Optional[str] = None,
        tone_prompt: Optional[str] = None,
        instructions: Optional[str] = None,
        escalation_prompt: Optional[str] = None,
        knowledge: Optional[str] = None,
        status: Optional[str] = None,
    ) -> Dict[str, Any]:
        agent = self.get_agent(agent_id)
        if not agent:
            raise ValueError("agent not found")
        next_name = (name if name is not None else agent["name"]) or ""
        if not next_name.strip():
            raise ValueError("agent name is required")
        next_status = status if status in {"active", "disabled"} else agent["status"]
        with self._conn:
            self._conn.execute(
                """UPDATE agents SET
                   name = ?, description = ?, status = ?, role_prompt = ?,
                   task_prompt = ?, tone_prompt = ?, instructions = ?,
                   escalation_prompt = ?, knowledge = ?, updated_at = ?
                   WHERE id = ? AND tenant_id = ?""",
                (
                    next_name.strip(),
                    _clean_text(description if description is not None else agent.get("description")),
                    next_status,
                    _clean_text(role_prompt if role_prompt is not None else agent.get("role_prompt")),
                    _clean_text(task_prompt if task_prompt is not None else agent.get("task_prompt")),
                    _clean_text(tone_prompt if tone_prompt is not None else agent.get("tone_prompt")),
                    _clean_text(instructions if instructions is not None else agent.get("instructions")),
                    _clean_text(escalation_prompt if escalation_prompt is not None else agent.get("escalation_prompt")),
                    _clean_text(knowledge if knowledge is not None else agent.get("knowledge")),
                    time.time(),
                    agent_id,
                    agent["tenant_id"],
                ),
            )
        return self.get_agent(agent_id, tenant_id=agent["tenant_id"]) or agent

    def grant_agent_access(
        self,
        *,
        user_id: str,
        agent_id: str,
        role: str = "user",
        tenant_id: Optional[str] = None,
        granted_by_user_id: Optional[str] = None,
        commit: bool = True,
    ) -> None:
        tenant = self.get_default_tenant()
        tid = tenant_id or (tenant["id"] if tenant else None)
        if not tid:
            raise ValueError("enterprise tenant is not initialized")
        access_role = role if role in {"user", "manager"} else "user"
        params = (tid, user_id, agent_id, access_role, granted_by_user_id, time.time())
        sql = """INSERT OR REPLACE INTO user_agent_access
                 (tenant_id, user_id, agent_id, role, granted_by_user_id, created_at)
                 VALUES (?, ?, ?, ?, ?, ?)"""
        if commit:
            with self._conn:
                self._conn.execute(sql, params)
        else:
            self._conn.execute(sql, params)

    def list_user_agents(self, user_id: str) -> List[Dict[str, Any]]:
        rows = self._conn.execute(
            """SELECT a.*, uaa.role AS access_role
               FROM user_agent_access uaa
               JOIN agents a ON a.id = uaa.agent_id AND a.tenant_id = uaa.tenant_id
               WHERE uaa.user_id = ? AND a.status = 'active'
               ORDER BY a.updated_at DESC, a.created_at DESC""",
            (user_id,),
        ).fetchall()
        return [dict(r) for r in rows]

    def resolve_user_agent(
        self,
        user: Dict[str, Any],
        agent_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        agents = self.list_user_agents(user["id"])
        if not agents:
            default_agent = self._default_agent_for_tenant(user["tenant_id"])
            self.grant_agent_access(
                user_id=user["id"],
                agent_id=default_agent["id"],
                role="manager" if user.get("role") == "admin" else "user",
                tenant_id=user["tenant_id"],
            )
            agents = [default_agent]
        if agent_id:
            for agent in agents:
                if agent["id"] == agent_id:
                    return agent
            raise PermissionError("user is not allowed to access this agent")
        return agents[0]

    def _default_agent_for_tenant(self, tenant_id: str) -> Dict[str, Any]:
        row = self._conn.execute(
            """SELECT * FROM agents
               WHERE tenant_id = ? AND status = 'active'
               ORDER BY created_at ASC LIMIT 1""",
            (tenant_id,),
        ).fetchone()
        if row:
            return dict(row)
        return self.create_agent(
            name="Default Agent",
            description="General-purpose business assistant",
            tenant_id=tenant_id,
        )

    def list_user_agent_skill_names(
        self,
        user: Dict[str, Any],
        agent_id: Optional[str] = None,
    ) -> List[str]:
        agent = self.resolve_user_agent(user, agent_id)
        rows = self._conn.execute(
            """SELECT skill_name
               FROM user_agent_skills uas
               WHERE uas.tenant_id = ?
                 AND uas.user_id = ?
                 AND uas.agent_id = ?
                 AND uas.enabled = 1
                 AND EXISTS (
                    SELECT 1 FROM agent_skill_catalog catalog
                    WHERE catalog.tenant_id = uas.tenant_id
                      AND catalog.agent_id = uas.agent_id
                      AND catalog.skill_name = uas.skill_name
                      AND catalog.enabled = 1
                 )
               ORDER BY uas.updated_at DESC, skill_name ASC""",
            (user["tenant_id"], user["id"], agent["id"]),
        ).fetchall()
        return [str(row["skill_name"]) for row in rows]

    def list_agent_skill_catalog(
        self,
        agent_id: str,
        *,
        tenant_id: Optional[str] = None,
        enabled_only: bool = False,
    ) -> List[str]:
        agent = self.get_agent(agent_id, tenant_id=tenant_id)
        if not agent:
            raise ValueError("agent not found")
        enabled_clause = "AND enabled = 1" if enabled_only else ""
        rows = self._conn.execute(
            f"""SELECT skill_name
                FROM agent_skill_catalog
                WHERE tenant_id = ? AND agent_id = ? {enabled_clause}
                ORDER BY updated_at DESC, skill_name ASC""",
            (agent["tenant_id"], agent["id"]),
        ).fetchall()
        return [str(row["skill_name"]) for row in rows]

    def set_agent_skill_catalog_item(
        self,
        agent_id: str,
        skill_name: str,
        enabled: bool,
        *,
        tenant_id: Optional[str] = None,
    ) -> List[str]:
        agent = self.get_agent(agent_id, tenant_id=tenant_id)
        if not agent:
            raise ValueError("agent not found")
        normalized = (skill_name or "").strip()
        if not normalized:
            raise ValueError("skill name is required")
        with self._conn:
            if enabled:
                self._conn.execute(
                    """INSERT OR REPLACE INTO agent_skill_catalog
                       (tenant_id, agent_id, skill_name, enabled, updated_at)
                       VALUES (?, ?, ?, 1, ?)""",
                    (agent["tenant_id"], agent["id"], normalized, time.time()),
                )
            else:
                self._conn.execute(
                    """DELETE FROM agent_skill_catalog
                       WHERE tenant_id = ? AND agent_id = ? AND skill_name = ?""",
                    (agent["tenant_id"], agent["id"], normalized),
                )
                self._conn.execute(
                    """DELETE FROM user_agent_skills
                       WHERE tenant_id = ? AND agent_id = ? AND skill_name = ?""",
                    (agent["tenant_id"], agent["id"], normalized),
                )
        return self.list_agent_skill_catalog(agent["id"], tenant_id=agent["tenant_id"], enabled_only=True)

    def list_user_agent_custom_skills(
        self,
        user: Dict[str, Any],
        agent_id: Optional[str] = None,
        *,
        enabled_only: bool = False,
    ) -> List[Dict[str, Any]]:
        agent = self.resolve_user_agent(user, agent_id)
        enabled_clause = "AND enabled = 1" if enabled_only else ""
        rows = self._conn.execute(
            f"""SELECT *
                FROM user_agent_custom_skills
                WHERE tenant_id = ? AND user_id = ? AND agent_id = ? {enabled_clause}
                ORDER BY updated_at DESC, name ASC""",
            (user["tenant_id"], user["id"], agent["id"]),
        ).fetchall()
        return [dict(row) for row in rows]

    def get_user_agent_custom_skill(
        self,
        user: Dict[str, Any],
        agent_id: str,
        name: str,
    ) -> Optional[Dict[str, Any]]:
        agent = self.resolve_user_agent(user, agent_id)
        row = self._conn.execute(
            """SELECT *
               FROM user_agent_custom_skills
               WHERE tenant_id = ? AND user_id = ? AND agent_id = ? AND name = ?""",
            (user["tenant_id"], user["id"], agent["id"], (name or "").strip()),
        ).fetchone()
        return dict(row) if row else None

    def upsert_user_agent_custom_skill(
        self,
        user: Dict[str, Any],
        agent_id: str,
        *,
        name: str,
        content: str,
        description: Optional[str] = None,
        category: Optional[str] = "custom",
        enabled: bool = True,
    ) -> Dict[str, Any]:
        agent = self.resolve_user_agent(user, agent_id)
        normalized_name = (name or "").strip()
        normalized_content = _clean_text(content)
        if not normalized_name:
            raise ValueError("skill name is required")
        if not normalized_content:
            raise ValueError("skill content is required")
        now = time.time()
        existing = self.get_user_agent_custom_skill(user, agent["id"], normalized_name)
        created_at = float(existing["created_at"]) if existing else now
        with self._conn:
            self._conn.execute(
                """INSERT OR REPLACE INTO user_agent_custom_skills
                   (tenant_id, user_id, agent_id, name, description, content,
                    category, enabled, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    user["tenant_id"],
                    user["id"],
                    agent["id"],
                    normalized_name,
                    _clean_text(description),
                    normalized_content,
                    (category or "custom").strip() or "custom",
                    1 if enabled else 0,
                    created_at,
                    now,
                ),
            )
        skill = self.get_user_agent_custom_skill(user, agent["id"], normalized_name)
        if not skill:
            raise RuntimeError("custom skill was not saved")
        return skill

    def set_user_agent_custom_skill_enabled(
        self,
        user: Dict[str, Any],
        agent_id: str,
        name: str,
        enabled: bool,
    ) -> Optional[Dict[str, Any]]:
        agent = self.resolve_user_agent(user, agent_id)
        normalized_name = (name or "").strip()
        if not normalized_name:
            raise ValueError("skill name is required")
        with self._conn:
            self._conn.execute(
                """UPDATE user_agent_custom_skills
                   SET enabled = ?, updated_at = ?
                   WHERE tenant_id = ? AND user_id = ? AND agent_id = ? AND name = ?""",
                (
                    1 if enabled else 0,
                    time.time(),
                    user["tenant_id"],
                    user["id"],
                    agent["id"],
                    normalized_name,
                ),
            )
        return self.get_user_agent_custom_skill(user, agent["id"], normalized_name)

    def set_user_agent_skill(
        self,
        user: Dict[str, Any],
        agent_id: str,
        skill_name: str,
        enabled: bool,
    ) -> List[str]:
        agent = self.resolve_user_agent(user, agent_id)
        normalized = (skill_name or "").strip()
        if not normalized:
            raise ValueError("skill name is required")
        with self._conn:
            if enabled:
                self._conn.execute(
                    """INSERT OR REPLACE INTO user_agent_skills
                       (tenant_id, user_id, agent_id, skill_name, enabled, updated_at)
                       VALUES (?, ?, ?, ?, 1, ?)""",
                    (user["tenant_id"], user["id"], agent["id"], normalized, time.time()),
                )
            else:
                self._conn.execute(
                    """DELETE FROM user_agent_skills
                       WHERE tenant_id = ? AND user_id = ? AND agent_id = ? AND skill_name = ?""",
                    (user["tenant_id"], user["id"], agent["id"], normalized),
                )
        return self.list_user_agent_skill_names(user, agent["id"])

    def clear_user_agent_skills(
        self,
        user: Dict[str, Any],
        agent_id: str,
    ) -> None:
        agent = self.resolve_user_agent(user, agent_id)
        with self._conn:
            self._conn.execute(
                """DELETE FROM user_agent_skills
                   WHERE tenant_id = ? AND user_id = ? AND agent_id = ?""",
                (user["tenant_id"], user["id"], agent["id"]),
            )

    def create_local_device_code(
        self,
        user: Dict[str, Any],
        agent_id: str,
        *,
        label: Optional[str] = None,
        expires_minutes: int = 30,
    ) -> Dict[str, Any]:
        agent = self.resolve_user_agent(user, agent_id)
        code = _new_device_code()
        now = time.time()
        expires_at = now + max(1, int(expires_minutes or 30)) * 60
        with self._conn:
            self._conn.execute(
                """INSERT INTO local_device_codes
                   (code_hash, tenant_id, user_id, agent_id, label, created_at, expires_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    _hash_secret(code),
                    user["tenant_id"],
                    user["id"],
                    agent["id"],
                    _clean_text(label),
                    now,
                    expires_at,
                ),
            )
        return {
            "code": code,
            "tenant_id": user["tenant_id"],
            "user_id": user["id"],
            "agent_id": agent["id"],
            "agent_name": agent["name"],
            "label": _clean_text(label),
            "created_at": now,
            "expires_at": expires_at,
        }

    def redeem_local_device_code(
        self,
        code: str,
        *,
        device_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        normalized = (code or "").strip()
        if not normalized:
            raise ValueError("device code is required")
        now = time.time()
        code_hash = _hash_secret(normalized)
        with self._conn:
            row = self._conn.execute(
                "SELECT * FROM local_device_codes WHERE code_hash = ?",
                (code_hash,),
            ).fetchone()
            if not row:
                raise ValueError("invalid device code")
            device_code = dict(row)
            if device_code.get("redeemed_at") is not None:
                raise ValueError("device code has already been used")
            if float(device_code["expires_at"]) < now:
                raise ValueError("device code has expired")

            user = self._conn.execute(
                "SELECT * FROM users WHERE id = ? AND tenant_id = ? AND disabled_at IS NULL",
                (device_code["user_id"], device_code["tenant_id"]),
            ).fetchone()
            if not user:
                raise ValueError("device code user is no longer active")
            agent = self.get_agent(device_code["agent_id"], tenant_id=device_code["tenant_id"])
            if not agent or agent.get("status") != "active":
                raise ValueError("device code agent is no longer active")

            token = _new_device_token()
            device_id = _new_device_id()
            name = (device_name or device_code.get("label") or "").strip() or "Local Hermes Agent"
            self._conn.execute(
                """INSERT INTO local_devices
                   (id, tenant_id, user_id, agent_id, name, api_key_hash, status,
                    created_at, last_seen_at)
                   VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)""",
                (
                    device_id,
                    device_code["tenant_id"],
                    device_code["user_id"],
                    device_code["agent_id"],
                    name,
                    _hash_secret(token),
                    now,
                    now,
                ),
            )
            self._conn.execute(
                "UPDATE local_device_codes SET redeemed_at = ? WHERE code_hash = ?",
                (now, code_hash),
            )
        device = self.get_local_device(device_id)
        return {
            "device": device,
            "device_token": token,
            "user": dict(user),
            "agent": agent,
        }

    def get_local_device(self, device_id: str) -> Optional[Dict[str, Any]]:
        row = self._conn.execute(
            """SELECT d.*, u.email AS user_email, u.name AS user_name,
                      a.name AS agent_name
               FROM local_devices d
               JOIN users u ON u.id = d.user_id AND u.tenant_id = d.tenant_id
               JOIN agents a ON a.id = d.agent_id AND a.tenant_id = d.tenant_id
               WHERE d.id = ?""",
            (device_id,),
        ).fetchone()
        return dict(row) if row else None

    def list_local_devices(
        self,
        *,
        user: Optional[Dict[str, Any]] = None,
        agent_id: Optional[str] = None,
        include_revoked: bool = False,
    ) -> List[Dict[str, Any]]:
        params: List[Any] = []
        where = []
        if user is not None:
            where.append("d.tenant_id = ?")
            params.append(user["tenant_id"])
            where.append("d.user_id = ?")
            params.append(user["id"])
            if agent_id:
                agent = self.resolve_user_agent(user, agent_id)
                where.append("d.agent_id = ?")
                params.append(agent["id"])
        elif agent_id:
            where.append("d.agent_id = ?")
            params.append(agent_id)
        if not include_revoked:
            where.append("d.revoked_at IS NULL")
        where_sql = "WHERE " + " AND ".join(where) if where else ""
        rows = self._conn.execute(
            f"""SELECT d.*, u.email AS user_email, u.name AS user_name,
                       a.name AS agent_name
                FROM local_devices d
                JOIN users u ON u.id = d.user_id AND u.tenant_id = d.tenant_id
                JOIN agents a ON a.id = d.agent_id AND a.tenant_id = d.tenant_id
                {where_sql}
                ORDER BY d.last_seen_at DESC, d.created_at DESC""",
            tuple(params),
        ).fetchall()
        return [dict(row) for row in rows]

    def authenticate_device_token(self, token: str) -> Optional[Dict[str, Any]]:
        normalized = (token or "").strip()
        if not normalized:
            return None
        row = self._conn.execute(
            """SELECT d.*, u.email AS user_email, u.name AS user_name, u.role AS user_role,
                      a.name AS agent_name
               FROM local_devices d
               JOIN users u ON u.id = d.user_id AND u.tenant_id = d.tenant_id
               JOIN agents a ON a.id = d.agent_id AND a.tenant_id = d.tenant_id
               WHERE d.api_key_hash = ? AND d.revoked_at IS NULL AND d.status = 'active'
                     AND u.disabled_at IS NULL AND a.status = 'active'""",
            (_hash_secret(normalized),),
        ).fetchone()
        if not row:
            return None
        device = dict(row)
        now = time.time()
        with self._conn:
            self._conn.execute(
                "UPDATE local_devices SET last_seen_at = ? WHERE id = ?",
                (now, device["id"]),
            )
        user = self._conn.execute(
            "SELECT * FROM users WHERE id = ? AND tenant_id = ?",
            (device["user_id"], device["tenant_id"]),
        ).fetchone()
        agent = self.get_agent(device["agent_id"], tenant_id=device["tenant_id"])
        access_context = AccessContext(
            tenant_id=device["tenant_id"],
            workspace_id="default",
            user_id=device["user_id"],
            agent_id=device["agent_id"],
        )
        return {
            "device": {**device, "last_seen_at": now},
            "user": dict(user) if user else None,
            "agent": agent,
            "access_context": access_context,
        }

    def create_local_agent_request(
        self,
        *,
        device_id: str,
        request: str,
        requester_user_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        device = self.get_local_device(device_id)
        if not device or device.get("revoked_at") is not None or device.get("status") != "active":
            raise ValueError("local device not found or inactive")
        text = (request or "").strip()
        if not text:
            raise ValueError("request is required")
        now = time.time()
        request_id = _new_bridge_request_id()
        with self._conn:
            self._conn.execute(
                """INSERT INTO local_agent_requests
                   (id, tenant_id, user_id, agent_id, device_id, requester_user_id,
                    request, status, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)""",
                (
                    request_id,
                    device["tenant_id"],
                    device["user_id"],
                    device["agent_id"],
                    device["id"],
                    requester_user_id,
                    text,
                    now,
                    now,
                ),
            )
        result = self.get_local_agent_request(request_id)
        if not result:
            raise RuntimeError("failed to create local agent request")
        return result

    def get_local_agent_request(self, request_id: str) -> Optional[Dict[str, Any]]:
        row = self._conn.execute(
            """SELECT r.*, d.name AS device_name, u.email AS user_email,
                      u.name AS user_name, a.name AS agent_name
               FROM local_agent_requests r
               JOIN local_devices d ON d.id = r.device_id
               JOIN users u ON u.id = r.user_id AND u.tenant_id = r.tenant_id
               JOIN agents a ON a.id = r.agent_id AND a.tenant_id = r.tenant_id
               WHERE r.id = ?""",
            (request_id,),
        ).fetchone()
        return dict(row) if row else None

    def list_local_agent_requests(
        self,
        *,
        device_id: Optional[str] = None,
        user: Optional[Dict[str, Any]] = None,
        agent_id: Optional[str] = None,
        statuses: Optional[List[str]] = None,
        limit: int = 50,
    ) -> List[Dict[str, Any]]:
        params: List[Any] = []
        where = []
        if device_id:
            where.append("r.device_id = ?")
            params.append(device_id)
        if user is not None:
            where.append("r.tenant_id = ?")
            params.append(user["tenant_id"])
            where.append("r.user_id = ?")
            params.append(user["id"])
        if agent_id:
            where.append("r.agent_id = ?")
            params.append(agent_id)
        if statuses:
            placeholders = ", ".join("?" for _ in statuses)
            where.append(f"r.status IN ({placeholders})")
            params.extend(statuses)
        where_sql = "WHERE " + " AND ".join(where) if where else ""
        params.append(max(1, min(int(limit or 50), 200)))
        rows = self._conn.execute(
            f"""SELECT r.*, d.name AS device_name, u.email AS user_email,
                       u.name AS user_name, a.name AS agent_name
                FROM local_agent_requests r
                JOIN local_devices d ON d.id = r.device_id
                JOIN users u ON u.id = r.user_id AND u.tenant_id = r.tenant_id
                JOIN agents a ON a.id = r.agent_id AND a.tenant_id = r.tenant_id
                {where_sql}
                ORDER BY r.created_at DESC
                LIMIT ?""",
            tuple(params),
        ).fetchall()
        return [dict(row) for row in rows]

    def poll_local_agent_requests(
        self,
        device: Dict[str, Any],
        *,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        rows = self.list_local_agent_requests(
            device_id=device["id"],
            statuses=["pending", "delivered"],
            limit=limit,
        )
        now = time.time()
        pending_ids = [row["id"] for row in rows if row.get("status") == "pending"]
        if pending_ids:
            placeholders = ", ".join("?" for _ in pending_ids)
            with self._conn:
                self._conn.execute(
                    f"""UPDATE local_agent_requests
                        SET status = 'delivered', delivered_at = COALESCE(delivered_at, ?),
                            updated_at = ?
                        WHERE id IN ({placeholders})""",
                    (now, now, *pending_ids),
                )
        return [self.get_local_agent_request(row["id"]) or row for row in rows]

    def respond_local_agent_request(
        self,
        device: Dict[str, Any],
        request_id: str,
        response: str,
        *,
        status: str = "responded",
    ) -> Dict[str, Any]:
        if status not in {"responded", "rejected"}:
            raise ValueError("status must be responded or rejected")
        text = (response or "").strip()
        if not text:
            raise ValueError("response is required")
        row = self._conn.execute(
            "SELECT * FROM local_agent_requests WHERE id = ? AND device_id = ?",
            (request_id, device["id"]),
        ).fetchone()
        if not row:
            raise ValueError("local agent request not found")
        now = time.time()
        with self._conn:
            self._conn.execute(
                """UPDATE local_agent_requests
                   SET response = ?, status = ?, responded_at = ?, updated_at = ?
                   WHERE id = ? AND device_id = ?""",
                (text, status, now, now, request_id, device["id"]),
            )
        result = self.get_local_agent_request(request_id)
        if not result:
            raise RuntimeError("failed to update local agent request")
        return result

    @staticmethod
    def compile_agent_prompt(agent: Dict[str, Any]) -> str:
        """Compile structured business-agent fields into a runtime system prompt."""
        sections = [
            "# Business Agent",
            f"Agent name: {agent.get('name') or 'Business Agent'}",
        ]
        if agent.get("description"):
            sections.append(f"Business description:\n{agent['description']}")
        field_map = [
            ("Role", "role_prompt"),
            ("Primary Tasks", "task_prompt"),
            ("Tone and Style", "tone_prompt"),
            ("Operating Instructions", "instructions"),
            ("Escalation Rules", "escalation_prompt"),
            ("Business Knowledge", "knowledge"),
        ]
        for title, key in field_map:
            value = (agent.get(key) or "").strip()
            if value:
                sections.append(f"## {title}\n{value}")
        sections.append(
            "## Boundaries\n"
            "Use only the business configuration, authorized conversation context, "
            "and available tools. If required business information is missing, say "
            "what is missing and ask a focused follow-up question. Do not invent "
            "policies, prices, commitments, availability, refunds, legal advice, "
            "or account-specific facts."
        )
        return "\n\n".join(sections)

    def create_invite(
        self,
        *,
        email: Optional[str] = None,
        role: str = "member",
        max_uses: int = 1,
        expires_days: Optional[int] = 7,
        created_by_user_id: Optional[str] = None,
        agent_ids: Optional[List[str]] = None,
    ) -> Dict[str, Any]:
        tenant = self.get_default_tenant()
        if not tenant:
            raise ValueError("enterprise tenant is not initialized")
        normalized_role = role if role in {"member", "admin"} else "member"
        uses_limit = max(1, int(max_uses or 1))
        expires_at = None
        if expires_days is not None and int(expires_days) > 0:
            expires_at = time.time() + int(expires_days) * 86400
        code = _new_invite_code()
        now = time.time()
        allowed_agent_ids = self._normalize_invite_agent_ids(
            agent_ids,
            tenant_id=tenant["id"],
        )
        with self._conn:
            self._conn.execute(
                """INSERT INTO invites
                   (code_hash, tenant_id, email, role, max_uses, expires_at,
                    created_by_user_id, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    _hash_secret(code),
                    tenant["id"],
                    (email or "").strip() or None,
                    normalized_role,
                    uses_limit,
                    expires_at,
                    created_by_user_id,
                    now,
                ),
            )
            code_hash = _hash_secret(code)
            for agent_id in allowed_agent_ids:
                self._conn.execute(
                    "INSERT INTO invite_agents (code_hash, agent_id) VALUES (?, ?)",
                    (code_hash, agent_id),
                )
        return {
            "code": code,
            "tenant_id": tenant["id"],
            "email": (email or "").strip() or None,
            "role": normalized_role,
            "max_uses": uses_limit,
            "uses": 0,
            "expires_at": expires_at,
            "created_at": now,
            "agent_ids": allowed_agent_ids,
        }

    def _normalize_invite_agent_ids(
        self,
        agent_ids: Optional[List[str]],
        *,
        tenant_id: str,
    ) -> List[str]:
        requested = [str(a).strip() for a in (agent_ids or []) if str(a).strip()]
        if not requested:
            return [self._default_agent_for_tenant(tenant_id)["id"]]
        valid = {
            row["id"]
            for row in self._conn.execute(
                "SELECT id FROM agents WHERE tenant_id = ? AND status = 'active'",
                (tenant_id,),
            ).fetchall()
        }
        invalid = [agent_id for agent_id in requested if agent_id not in valid]
        if invalid:
            raise ValueError(f"unknown or disabled agent ids: {', '.join(invalid)}")
        return list(dict.fromkeys(requested))

    def redeem_invite(
        self,
        code: str,
        *,
        email: Optional[str] = None,
        name: Optional[str] = None,
    ) -> Dict[str, Any]:
        code = (code or "").strip()
        if not code:
            raise ValueError("invite code is required")
        now = time.time()
        with self._conn:
            invite = self._conn.execute(
                "SELECT * FROM invites WHERE code_hash = ?",
                (_hash_secret(code),),
            ).fetchone()
            if not invite:
                raise ValueError("invalid invite code")
            invite_dict = dict(invite)
            if invite_dict.get("revoked_at") is not None:
                raise ValueError("invite code has been revoked")
            if invite_dict.get("expires_at") is not None and invite_dict["expires_at"] < now:
                raise ValueError("invite code has expired")
            if int(invite_dict.get("uses") or 0) >= int(invite_dict.get("max_uses") or 1):
                raise ValueError("invite code has already been used")

            invite_email = invite_dict.get("email")
            provided_email = (email or "").strip() or invite_email
            if invite_email and provided_email and invite_email.lower() != provided_email.lower():
                raise ValueError("invite code is restricted to a different email")

            token = _new_user_token()
            user_id = f"user_{uuid.uuid4().hex[:12]}"
            agent_rows = self._conn.execute(
                "SELECT agent_id FROM invite_agents WHERE code_hash = ?",
                (_hash_secret(code),),
            ).fetchall()
            agent_ids = [row["agent_id"] for row in agent_rows]
            if not agent_ids:
                agent_ids = [self._default_agent_for_tenant(invite_dict["tenant_id"])["id"]]
            self._conn.execute(
                """INSERT INTO users
                   (id, tenant_id, email, name, role, api_key_hash, created_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    user_id,
                    invite_dict["tenant_id"],
                    provided_email,
                    (name or "").strip() or provided_email or "User",
                    invite_dict["role"],
                    _hash_secret(token),
                    now,
                ),
            )
            self._conn.execute(
                "UPDATE invites SET uses = uses + 1 WHERE code_hash = ?",
                (_hash_secret(code),),
            )
            for agent_id in agent_ids:
                self.grant_agent_access(
                    user_id=user_id,
                    agent_id=agent_id,
                    role="manager" if invite_dict["role"] == "admin" else "user",
                    tenant_id=invite_dict["tenant_id"],
                    granted_by_user_id=invite_dict.get("created_by_user_id"),
                    commit=False,
                )
        user_payload = {
            "id": user_id,
            "tenant_id": invite_dict["tenant_id"],
            "email": provided_email,
            "name": (name or "").strip() or provided_email or "User",
            "role": invite_dict["role"],
            "created_at": now,
        }
        return {
            "user": user_payload,
            "api_key": token,
            "agents": self.list_user_agents(user_id),
        }

    def authenticate_api_key(self, token: str) -> Optional[Dict[str, Any]]:
        token = (token or "").strip()
        if not token:
            return None
        row = self._conn.execute(
            """SELECT u.*, t.name AS tenant_name
               FROM users u
               JOIN tenants t ON t.id = u.tenant_id
               WHERE u.api_key_hash = ? AND u.disabled_at IS NULL""",
            (_hash_secret(token),),
        ).fetchone()
        if not row:
            return None
        user = dict(row)
        agents = self.list_user_agents(user["id"])
        return {
            "user": user,
            "agents": agents,
            "access_context": AccessContext(
                tenant_id=user["tenant_id"],
                workspace_id="default",
                user_id=user["id"],
                agent_id=(agents[0]["id"] if agents else "default"),
            ),
        }

    def list_users(self) -> List[Dict[str, Any]]:
        rows = self._conn.execute(
            """SELECT id, tenant_id, email, name, role, created_at, disabled_at
               FROM users ORDER BY created_at DESC"""
        ).fetchall()
        return [dict(r) for r in rows]

    def get_user(self, user_id: str) -> Optional[Dict[str, Any]]:
        row = self._conn.execute(
            """SELECT id, tenant_id, email, name, role, api_key_hash, created_at, disabled_at
               FROM users WHERE id = ? AND disabled_at IS NULL""",
            ((user_id or "").strip(),),
        ).fetchone()
        return dict(row) if row else None

    def list_invites(self) -> List[Dict[str, Any]]:
        rows = self._conn.execute(
            """SELECT tenant_id, code_hash, email, role, max_uses, uses, expires_at,
                      created_by_user_id, created_at, revoked_at
               FROM invites ORDER BY created_at DESC"""
        ).fetchall()
        invites = []
        for row in rows:
            item = dict(row)
            agent_rows = self._conn.execute(
                """SELECT a.id, a.name
                   FROM invite_agents ia
                   JOIN agents a ON a.id = ia.agent_id
                   WHERE ia.code_hash = ?
                   ORDER BY a.name""",
                (item["code_hash"],),
            ).fetchall()
            item["agent_ids"] = [r["id"] for r in agent_rows]
            item["agent_names"] = [r["name"] for r in agent_rows]
            item.pop("code_hash", None)
            invites.append(item)
        return invites
