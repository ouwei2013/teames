"""Local-agent tools for calling assigned remote enterprise business agents."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional

from hermes_constants import get_hermes_home
from tools.registry import registry


def _config_path() -> Path:
    return get_hermes_home() / "enterprise-local.json"


def _read_config() -> Dict[str, Any]:
    path = _config_path()
    if not path.exists():
        return {}
    try:
        parsed = json.loads(path.read_text(encoding="utf-8"))
        return parsed if isinstance(parsed, dict) else {}
    except Exception:
        return {}


def _write_config(config: Dict[str, Any]) -> None:
    path = _config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(config, indent=2, sort_keys=True), encoding="utf-8")
    try:
        path.chmod(0o600)
    except OSError:
        pass


def check_requirements() -> bool:
    config = _read_config()
    return bool(config.get("server") and config.get("device_token"))


def _tool_error(message: str) -> str:
    return json.dumps({"success": False, "error": message}, ensure_ascii=False)


def _gateway_origin() -> Dict[str, Any]:
    try:
        from gateway.session_context import get_session_env
    except Exception:
        return {}
    platform = get_session_env("HERMES_SESSION_PLATFORM", "").strip().lower()
    chat_id = get_session_env("HERMES_SESSION_CHAT_ID", "").strip()
    user_id = get_session_env("HERMES_SESSION_USER_ID", "").strip()
    if not platform or not user_id:
        return {}
    origin: Dict[str, Any] = {
        "platform": platform,
        "external_user_id": user_id,
        "external_chat_id": chat_id,
        "user_name": get_session_env("HERMES_SESSION_USER_NAME", "").strip(),
    }
    if platform == "weixin" and "|" in chat_id:
        origin["bot_account_id"] = chat_id.split("|", 1)[0]
    return {key: value for key, value in origin.items() if value}


def _http_json(
    config: Dict[str, Any],
    path: str,
    *,
    method: str = "GET",
    payload: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    server = str(config.get("server") or "").rstrip("/")
    token = str(config.get("device_token") or "")
    if not server or not token:
        raise RuntimeError("Local agent is not joined. Run: hermes enterprise local join <code>")
    data = None
    headers = {
        "Accept": "application/json",
        "Authorization": f"Bearer {token}",
    }
    if payload is not None:
        data = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(server + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            raw = resp.read().decode("utf-8")
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{exc.code} {exc.reason}: {detail}") from exc


def enterprise_remote(
    action: str,
    agent_id: Optional[str] = None,
    message: Optional[str] = None,
    session_id: Optional[str] = None,
    query: Optional[str] = None,
    limit: Optional[int] = None,
    task_id: str | None = None,
) -> str:
    del task_id
    normalized_action = (action or "").strip().lower()
    config = _read_config()
    try:
        if normalized_action == "list_agents":
            result = _http_json(config, "/api/enterprise/local-agent/agents")
            return json.dumps({"success": True, **result}, ensure_ascii=False, indent=2)

        if normalized_action == "chat":
            text = (message or "").strip()
            if not text:
                raise ValueError("message is required")
            chosen_agent_id = (agent_id or "").strip()
            session_ids = config.get("remote_session_ids")
            if not isinstance(session_ids, dict):
                session_ids = {}
            existing_session_id = (session_id or session_ids.get(chosen_agent_id or "default") or "").strip()
            payload: Dict[str, Any] = {"message": text}
            if chosen_agent_id:
                payload["agent_id"] = chosen_agent_id
            if existing_session_id:
                payload["session_id"] = existing_session_id
            origin = _gateway_origin()
            if origin:
                payload["gateway_origin"] = origin
            result = _http_json(
                config,
                "/api/enterprise/local-agent/chat",
                method="POST",
                payload=payload,
            )
            resolved_agent = result.get("agent") or {}
            resolved_agent_id = resolved_agent.get("id") or chosen_agent_id or "default"
            if result.get("session_id"):
                session_ids[resolved_agent_id] = result["session_id"]
                config["remote_session_ids"] = session_ids
                _write_config(config)
            return json.dumps({"success": True, **result}, ensure_ascii=False, indent=2)

        if normalized_action == "search_history":
            text = (query or message or "").strip()
            if not text:
                raise ValueError("query is required")
            payload = {
                "query": text,
                "limit": max(1, min(int(limit or 10), 25)),
            }
            chosen_agent_id = (agent_id or "").strip()
            if chosen_agent_id:
                payload["agent_id"] = chosen_agent_id
            result = _http_json(
                config,
                "/api/enterprise/local-agent/history/search",
                method="POST",
                payload=payload,
            )
            return json.dumps({"success": True, **result}, ensure_ascii=False, indent=2)

        return _tool_error(f"unknown action '{action}'")
    except Exception as exc:
        return _tool_error(str(exc))


ENTERPRISE_REMOTE_SCHEMA: Dict[str, Any] = {
    "name": "enterprise_remote",
    "description": (
        "For a local Hermes agent joined to an enterprise workspace. List and chat "
        "with remote business agents assigned to the local user, such as HR, support, "
        "or policy agents. Can also search this local user's own remote business-agent "
        "chat history. Do not send private local data unless the user explicitly agrees."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {"type": "string", "enum": ["list_agents", "chat", "search_history"]},
            "agent_id": {
                "type": "string",
                "description": "Remote business agent id returned by list_agents.",
            },
            "message": {
                "type": "string",
                "description": "Question or request to send to the remote business agent.",
            },
            "session_id": {
                "type": "string",
                "description": "Optional explicit remote conversation session id.",
            },
            "query": {
                "type": "string",
                "description": "Search query for search_history. Results are scoped to the local user and selected business agent.",
            },
            "limit": {
                "type": "integer",
                "description": "Maximum number of search_history matches to return, capped at 25.",
            },
        },
        "required": ["action"],
    },
}


registry.register(
    name="enterprise_remote",
    toolset="enterprise_remote",
    schema=ENTERPRISE_REMOTE_SCHEMA,
    handler=lambda args, **kw: enterprise_remote(
        action=args.get("action", ""),
        agent_id=args.get("agent_id"),
        message=args.get("message"),
        session_id=args.get("session_id"),
        query=args.get("query"),
        limit=args.get("limit"),
        task_id=kw.get("task_id"),
    ),
    check_fn=check_requirements,
)
