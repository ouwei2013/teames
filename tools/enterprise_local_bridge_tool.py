"""Admin-only bridge tool for requesting help from user-owned local agents."""

from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

from gateway.session_context import get_session_env
from tools.registry import registry


def _tool_error(message: str) -> str:
    return json.dumps({"success": False, "error": message}, ensure_ascii=False)


def _require_admin_builder_context() -> tuple[str, str]:
    platform = get_session_env("HERMES_SESSION_PLATFORM")
    tenant_id = get_session_env("HERMES_ENTERPRISE_TENANT_ID")
    admin_user_id = get_session_env("HERMES_ENTERPRISE_USER_ID")
    if platform != "enterprise_admin_builder" or not tenant_id or not admin_user_id:
        raise PermissionError("enterprise_local_bridge is only available in admin builder sessions")
    return tenant_id, admin_user_id


def _matches_text(value: Any, needle: Optional[str]) -> bool:
    if not needle:
        return True
    return str(needle).strip().lower() in str(value or "").lower()


def enterprise_local_bridge(
    action: str,
    device_id: Optional[str] = None,
    user_id: Optional[str] = None,
    user_email: Optional[str] = None,
    agent_id: Optional[str] = None,
    request: Optional[str] = None,
    status: Optional[str] = None,
    limit: int = 20,
    include_revoked: bool = False,
    confirmed_by_admin: bool = False,
    task_id: str | None = None,
) -> str:
    del task_id
    normalized_action = (action or "").strip().lower()
    try:
        tenant_id, admin_user_id = _require_admin_builder_context()
    except Exception as exc:
        return _tool_error(str(exc))

    if normalized_action == "send_request" and not confirmed_by_admin:
        return _tool_error(
            "Sending a local-agent request requires explicit admin confirmation. "
            "Present the target device and exact request text first, then call this "
            "tool with confirmed_by_admin=true only after approval."
        )

    from enterprise import EnterpriseStore

    store = EnterpriseStore()
    try:
        if normalized_action == "list_devices":
            devices = store.list_local_devices(
                agent_id=agent_id or None,
                include_revoked=include_revoked,
            )
            devices = [
                device for device in devices
                if device.get("tenant_id") == tenant_id
                and _matches_text(device.get("device_id"), device_id)
                and _matches_text(device.get("user_id"), user_id)
                and _matches_text(device.get("user_email"), user_email)
            ]
            return json.dumps(
                {"success": True, "devices": devices[: max(1, min(int(limit or 20), 100))]},
                ensure_ascii=False,
                indent=2,
            )

        if normalized_action == "send_request":
            device = store.get_local_device(device_id or "")
            if not device or device.get("tenant_id") != tenant_id:
                raise ValueError("local device not found in this tenant")
            item = store.create_local_agent_request(
                device_id=device_id or "",
                request=request or "",
                requester_user_id=admin_user_id,
            )
            return json.dumps({"success": True, "request": item}, ensure_ascii=False, indent=2)

        if normalized_action == "list_requests":
            statuses: Optional[List[str]] = None
            if status:
                statuses = [part.strip() for part in status.split(",") if part.strip()]
            requests = store.list_local_agent_requests(
                device_id=device_id or None,
                agent_id=agent_id or None,
                statuses=statuses,
                limit=max(1, min(int(limit or 20), 100)),
            )
            requests = [
                item for item in requests
                if item.get("tenant_id") == tenant_id
                and _matches_text(item.get("user_id"), user_id)
                and _matches_text(item.get("user_email"), user_email)
            ]
            return json.dumps({"success": True, "requests": requests}, ensure_ascii=False, indent=2)

        return _tool_error(f"unknown action '{action}'")
    except Exception as exc:
        return _tool_error(str(exc))
    finally:
        store.close()


ENTERPRISE_LOCAL_BRIDGE_SCHEMA: Dict[str, Any] = {
    "name": "enterprise_local_bridge",
    "description": (
        "Admin-only tool for communicating with user-owned local Hermes agents. "
        "It lists connected local devices, sends collaboration requests, and checks "
        "responses. It does not grant direct access to local files or tools; the local "
        "agent decides what to share."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": ["list_devices", "send_request", "list_requests"],
            },
            "device_id": {"type": "string"},
            "user_id": {"type": "string"},
            "user_email": {"type": "string"},
            "agent_id": {"type": "string"},
            "request": {
                "type": "string",
                "description": "Exact collaboration request to send to the local agent.",
            },
            "status": {
                "type": "string",
                "description": "Optional comma-separated request statuses such as pending,delivered,responded,rejected.",
            },
            "limit": {"type": "integer", "minimum": 1, "maximum": 100},
            "include_revoked": {"type": "boolean"},
            "confirmed_by_admin": {
                "type": "boolean",
                "description": "Required for send_request after the admin confirms the target and request text.",
            },
        },
        "required": ["action"],
    },
}


registry.register(
    name="enterprise_local_bridge",
    toolset="enterprise_local_bridge",
    schema=ENTERPRISE_LOCAL_BRIDGE_SCHEMA,
    handler=lambda args, **kw: enterprise_local_bridge(
        action=args.get("action", ""),
        device_id=args.get("device_id"),
        user_id=args.get("user_id"),
        user_email=args.get("user_email"),
        agent_id=args.get("agent_id"),
        request=args.get("request"),
        status=args.get("status"),
        limit=args.get("limit", 20),
        include_revoked=args.get("include_revoked", False),
        confirmed_by_admin=args.get("confirmed_by_admin", False),
        task_id=kw.get("task_id"),
    ),
)
