"""Admin-only enterprise builder tool for creating business agents."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

from gateway.session_context import get_session_env
from hermes_constants import get_hermes_home
from tools.registry import registry


_SLUG_RE = re.compile(r"[^a-z0-9-]+")


def _tool_error(message: str) -> str:
    return json.dumps({"success": False, "error": message}, ensure_ascii=False)


def _skill_slug(name: str) -> str:
    slug = _SLUG_RE.sub("-", (name or "").strip().lower()).strip("-")
    return slug[:80] or "business-skill"


def _validate_package_file(path: str) -> str:
    normalized = (path or "").strip().replace("\\", "/")
    if not normalized or normalized.startswith("/") or ".." in Path(normalized).parts:
        raise ValueError("skill package file paths must be relative and cannot contain '..'")
    return normalized


def _write_skill_package(
    *,
    tenant_id: str,
    agent_id: str,
    name: str,
    description: str,
    content: str,
    files: Optional[List[Dict[str, Any]]] = None,
) -> tuple[str, List[Dict[str, str]]]:
    slug = _skill_slug(name)
    skill_dir = get_hermes_home() / "enterprise_skills" / tenant_id / agent_id / slug
    skill_dir.mkdir(parents=True, exist_ok=True)

    if content.lstrip().startswith("---"):
        skill_md = content.strip() + "\n"
    else:
        skill_md = (
            "---\n"
            f"name: {json.dumps(name, ensure_ascii=False)}\n"
            f"description: {json.dumps(description or 'Business-specific enterprise skill', ensure_ascii=False)}\n"
            "version: 1.0.0\n"
            "metadata:\n"
            "  hermes:\n"
            "    category: enterprise\n"
            "    scope: tenant_agent\n"
            "---\n\n"
            f"# {name}\n\n"
            f"{content.strip()}\n"
        )
    (skill_dir / "SKILL.md").write_text(skill_md, encoding="utf-8")

    written = [{"path": "SKILL.md", "kind": "skill"}]
    for item in files or []:
        if not isinstance(item, dict):
            continue
        rel = _validate_package_file(str(item.get("path") or ""))
        if rel == "SKILL.md":
            continue
        body = str(item.get("content") or "")
        target = skill_dir / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(body, encoding="utf-8")
        written.append({"path": rel, "kind": str(item.get("kind") or "support")})
    return str(skill_dir), written


def _require_builder_context() -> tuple[str, str]:
    platform = get_session_env("HERMES_SESSION_PLATFORM")
    tenant_id = get_session_env("HERMES_ENTERPRISE_TENANT_ID")
    admin_user_id = get_session_env("HERMES_ENTERPRISE_USER_ID")
    if platform != "enterprise_admin_builder" or not tenant_id or not admin_user_id:
        raise PermissionError("enterprise_builder is only available in admin builder sessions")
    return tenant_id, admin_user_id


def enterprise_builder(
    action: str,
    agent_id: Optional[str] = None,
    name: Optional[str] = None,
    description: Optional[str] = None,
    role_prompt: Optional[str] = None,
    task_prompt: Optional[str] = None,
    tone_prompt: Optional[str] = None,
    instructions: Optional[str] = None,
    escalation_prompt: Optional[str] = None,
    knowledge: Optional[str] = None,
    status: Optional[str] = None,
    skill_name: Optional[str] = None,
    enabled: bool = True,
    email: Optional[str] = None,
    role: str = "member",
    max_uses: int = 1,
    expires_days: Optional[int] = 7,
    agent_ids: Optional[List[str]] = None,
    category: Optional[str] = "business",
    content: Optional[str] = None,
    files: Optional[List[Dict[str, Any]]] = None,
    confirmed_by_admin: bool = False,
    task_id: str | None = None,
) -> str:
    del task_id
    normalized_action = (action or "").strip().lower()
    try:
        tenant_id, admin_user_id = _require_builder_context()
    except Exception as exc:
        return _tool_error(str(exc))

    from enterprise import EnterpriseStore

    mutating_actions = {
        "create_agent",
        "update_agent",
        "set_skill_catalog",
        "create_invite",
        "create_agent_skill",
    }
    if normalized_action in mutating_actions and not confirmed_by_admin:
        return _tool_error(
            "Mutating builder actions require explicit admin confirmation. "
            "First ask clarifying questions or present a draft, then call this "
            "tool only after the admin confirms the specific change."
        )

    store = EnterpriseStore()
    try:
        if normalized_action == "status":
            return json.dumps(
                {
                    "success": True,
                    "tenant": store.get_default_tenant(),
                    "agents": store.list_agents(tenant_id=tenant_id),
                    "users": [user for user in store.list_users() if user.get("tenant_id") == tenant_id],
                },
                ensure_ascii=False,
                indent=2,
            )

        if normalized_action == "list_agents":
            return json.dumps(
                {"success": True, "agents": store.list_agents(tenant_id=tenant_id)},
                ensure_ascii=False,
                indent=2,
            )

        if normalized_action == "list_builtin_skills":
            from tools.skills_tool import _find_all_skills

            return json.dumps(
                {"success": True, "skills": _find_all_skills(skip_disabled=True)},
                ensure_ascii=False,
                indent=2,
            )

        if normalized_action == "create_agent":
            agent = store.create_agent(
                name=name or "",
                description=description,
                role_prompt=role_prompt,
                task_prompt=task_prompt,
                tone_prompt=tone_prompt,
                instructions=instructions,
                escalation_prompt=escalation_prompt,
                knowledge=knowledge,
                created_by_user_id=admin_user_id,
                tenant_id=tenant_id,
            )
            store.grant_agent_access(
                user_id=admin_user_id,
                agent_id=agent["id"],
                role="manager",
                tenant_id=tenant_id,
                granted_by_user_id=admin_user_id,
            )
            return json.dumps({"success": True, "agent": agent}, ensure_ascii=False, indent=2)

        if normalized_action == "update_agent":
            agent = store.update_agent(
                agent_id or "",
                name=name,
                description=description,
                role_prompt=role_prompt,
                task_prompt=task_prompt,
                tone_prompt=tone_prompt,
                instructions=instructions,
                escalation_prompt=escalation_prompt,
                knowledge=knowledge,
                status=status,
            )
            return json.dumps({"success": True, "agent": agent}, ensure_ascii=False, indent=2)

        if normalized_action == "set_skill_catalog":
            allowed = store.set_agent_skill_catalog_item(
                agent_id or "",
                skill_name or name or "",
                enabled,
                tenant_id=tenant_id,
            )
            return json.dumps(
                {"success": True, "agent_id": agent_id, "allowed_skills": allowed},
                ensure_ascii=False,
                indent=2,
            )

        if normalized_action == "create_invite":
            invite = store.create_invite(
                email=email,
                role=role,
                max_uses=max_uses,
                expires_days=expires_days,
                created_by_user_id=admin_user_id,
                agent_ids=agent_ids or ([agent_id] if agent_id else None),
            )
            return json.dumps({"success": True, "invite": invite}, ensure_ascii=False, indent=2)

        if normalized_action == "create_agent_skill":
            skill_agent_id = agent_id or ""
            agent = store.get_agent(skill_agent_id, tenant_id=tenant_id)
            if not agent:
                raise ValueError("agent not found")
            skill_content = (content or "").strip()
            if not skill_content:
                raise ValueError("content is required")
            skill_label = (skill_name or name or "").strip()
            if not skill_label:
                raise ValueError("skill_name is required")
            skill_dir, written = _write_skill_package(
                tenant_id=tenant_id,
                agent_id=agent["id"],
                name=skill_label,
                description=description or "",
                content=skill_content,
                files=files,
            )
            skill = store.upsert_agent_custom_skill(
                agent["id"],
                name=skill_label,
                description=description,
                content=skill_content,
                category=category or "business",
                enabled=enabled,
                skill_dir=skill_dir,
                files=written,
                created_by_user_id=admin_user_id,
                tenant_id=tenant_id,
            )
            return json.dumps(
                {
                    "success": True,
                    "skill": {
                        "name": skill["name"],
                        "description": skill.get("description"),
                        "category": skill.get("category"),
                        "enabled": bool(skill.get("enabled")),
                        "agent_id": skill.get("agent_id"),
                        "skill_dir": skill.get("skill_dir"),
                        "files": skill.get("files", []),
                    },
                },
                ensure_ascii=False,
                indent=2,
            )

        if normalized_action == "list_agent_skills":
            return json.dumps(
                {
                    "success": True,
                    "skills": store.list_agent_custom_skills(
                        agent_id or "",
                        tenant_id=tenant_id,
                    ),
                },
                ensure_ascii=False,
                indent=2,
            )

        return _tool_error(f"unknown action '{action}'")
    except Exception as exc:
        return _tool_error(str(exc))
    finally:
        store.close()


ENTERPRISE_BUILDER_SCHEMA = {
    "name": "enterprise_builder",
    "description": (
        "Admin-only tool for building enterprise business agents. It can create "
        "or update business agents, enable built-in skills for an agent, create "
        "tenant/agent-scoped enterprise skill packages with supporting scripts, "
        "and create invite links. Mutating actions require confirmed_by_admin=true, "
        "which must only be set after the admin explicitly approves the specific draft; "
        "do not claim changes were made unless this tool returns success."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": [
                    "status",
                    "list_agents",
                    "list_builtin_skills",
                    "create_agent",
                    "update_agent",
                    "set_skill_catalog",
                    "create_invite",
                    "create_agent_skill",
                    "list_agent_skills",
                ],
            },
            "agent_id": {"type": "string"},
            "name": {"type": "string"},
            "description": {"type": "string"},
            "role_prompt": {"type": "string"},
            "task_prompt": {"type": "string"},
            "tone_prompt": {"type": "string"},
            "instructions": {"type": "string"},
            "escalation_prompt": {"type": "string"},
            "knowledge": {"type": "string"},
            "status": {"type": "string", "enum": ["active", "disabled"]},
            "skill_name": {"type": "string"},
            "enabled": {"type": "boolean"},
            "email": {"type": "string"},
            "role": {"type": "string", "enum": ["member", "admin"]},
            "max_uses": {"type": "integer", "minimum": 1},
            "expires_days": {"type": "integer", "minimum": 1},
            "agent_ids": {"type": "array", "items": {"type": "string"}},
            "category": {"type": "string"},
            "content": {
                "type": "string",
                "description": "SKILL.md body or complete SKILL.md content for create_agent_skill.",
            },
            "confirmed_by_admin": {
                "type": "boolean",
                "description": (
                    "Set true only after the admin explicitly approves the specific draft "
                    "or says to apply/create/save the proposed configuration. Do not set "
                    "true for vague initial requests."
                ),
            },
            "files": {
                "type": "array",
                "description": "Optional supporting files for create_agent_skill, commonly scripts/*.py.",
                "items": {
                    "type": "object",
                    "properties": {
                        "path": {"type": "string"},
                        "content": {"type": "string"},
                        "kind": {"type": "string"},
                    },
                    "required": ["path", "content"],
                },
            },
        },
        "required": ["action"],
    },
}


registry.register(
    name="enterprise_builder",
    toolset="enterprise_builder",
    schema=ENTERPRISE_BUILDER_SCHEMA,
    handler=lambda args, **kw: enterprise_builder(
        action=args.get("action", ""),
        agent_id=args.get("agent_id"),
        name=args.get("name"),
        description=args.get("description"),
        role_prompt=args.get("role_prompt"),
        task_prompt=args.get("task_prompt"),
        tone_prompt=args.get("tone_prompt"),
        instructions=args.get("instructions"),
        escalation_prompt=args.get("escalation_prompt"),
        knowledge=args.get("knowledge"),
        status=args.get("status"),
        skill_name=args.get("skill_name"),
        enabled=args.get("enabled", True),
        email=args.get("email"),
        role=args.get("role", "member"),
        max_uses=args.get("max_uses", 1),
        expires_days=args.get("expires_days", 7),
        agent_ids=args.get("agent_ids"),
        category=args.get("category", "business"),
        content=args.get("content"),
        files=args.get("files"),
        confirmed_by_admin=args.get("confirmed_by_admin", False),
        task_id=kw.get("task_id"),
    ),
)
