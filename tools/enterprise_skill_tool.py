"""Enterprise-scoped custom skill tool for browser portal agents."""

from __future__ import annotations

import json
from typing import Optional

from gateway.session_context import get_session_env
from tools.registry import registry


def _tool_error(message: str) -> str:
    return json.dumps({"success": False, "error": message}, ensure_ascii=False)


def enterprise_skill(
    action: str,
    name: Optional[str] = None,
    content: Optional[str] = None,
    description: Optional[str] = None,
    category: Optional[str] = "custom",
    enabled: bool = True,
    task_id: str | None = None,
) -> str:
    del task_id
    normalized_action = (action or "").strip().lower()
    tenant_id = get_session_env("HERMES_ENTERPRISE_TENANT_ID")
    user_id = get_session_env("HERMES_ENTERPRISE_USER_ID")
    agent_id = get_session_env("HERMES_ENTERPRISE_AGENT_ID")
    if not (tenant_id and user_id and agent_id):
        return _tool_error("enterprise_skill is only available in an enterprise portal chat session")

    from enterprise import EnterpriseStore

    store = EnterpriseStore()
    try:
        user = store.get_user(user_id)
        if not user or user.get("tenant_id") != tenant_id:
            return _tool_error("enterprise user is not available")

        if normalized_action in {"create", "upsert", "save"}:
            skill = store.upsert_user_agent_custom_skill(
                user,
                agent_id,
                name=name or "",
                content=content or "",
                description=description,
                category=category or "custom",
                enabled=enabled,
            )
            return json.dumps(
                {
                    "success": True,
                    "skill": {
                        "name": skill["name"],
                        "description": skill.get("description"),
                        "category": skill.get("category") or "custom",
                        "enabled": bool(skill.get("enabled")),
                        "agent_id": skill.get("agent_id"),
                    },
                    "message": f"Enterprise skill '{skill['name']}' saved.",
                },
                ensure_ascii=False,
                indent=2,
            )

        if normalized_action == "list":
            skills = store.list_user_agent_custom_skills(user, agent_id)
            return json.dumps(
                {
                    "success": True,
                    "skills": [
                        {
                            "name": skill["name"],
                            "description": skill.get("description"),
                            "category": skill.get("category") or "custom",
                            "enabled": bool(skill.get("enabled")),
                            "agent_id": skill.get("agent_id"),
                        }
                        for skill in skills
                    ],
                },
                ensure_ascii=False,
                indent=2,
            )

        if normalized_action in {"enable", "disable"}:
            skill = store.set_user_agent_custom_skill_enabled(
                user,
                agent_id,
                name or "",
                enabled=(normalized_action == "enable"),
            )
            if not skill:
                return _tool_error("enterprise skill not found")
            return json.dumps(
                {
                    "success": True,
                    "skill": {
                        "name": skill["name"],
                        "enabled": bool(skill.get("enabled")),
                    },
                },
                ensure_ascii=False,
                indent=2,
            )

        return _tool_error(f"unknown action '{action}'")
    except Exception as exc:
        return _tool_error(str(exc))
    finally:
        store.close()


ENTERPRISE_SKILL_SCHEMA = {
    "name": "enterprise_skill",
    "description": (
        "Create, update, list, enable, or disable enterprise-scoped custom skills "
        "for the current portal user and business agent. Use this when the user "
        "asks to turn a habit, workflow, preference, or reusable procedure into a skill. "
        "Do not claim a skill was created unless this tool returns success."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["create", "upsert", "save", "list", "enable", "disable"],
                "description": "Action to perform.",
            },
            "name": {
                "type": "string",
                "description": "Short user-facing skill name.",
            },
            "description": {
                "type": "string",
                "description": "One sentence summary shown in the Skills page.",
            },
            "content": {
                "type": "string",
                "description": (
                    "Reusable skill instructions. Include trigger conditions, steps, "
                    "required questions, tools/information to gather, and the expected output style."
                ),
            },
            "category": {
                "type": "string",
                "description": "Optional category label, defaults to custom.",
            },
            "enabled": {
                "type": "boolean",
                "description": "Whether the skill should immediately affect future chats.",
            },
        },
        "required": ["action"],
    },
}


registry.register(
    name="enterprise_skill",
    toolset="enterprise_skills",
    schema=ENTERPRISE_SKILL_SCHEMA,
    handler=lambda args, **kw: enterprise_skill(
        action=args.get("action", ""),
        name=args.get("name"),
        content=args.get("content"),
        description=args.get("description"),
        category=args.get("category"),
        enabled=args.get("enabled", True),
        task_id=kw.get("task_id"),
    ),
)
