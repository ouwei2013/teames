"""Admin-only bridge tool for requesting help from user-owned local agents."""

from __future__ import annotations

import json
import re
import secrets
from pathlib import Path
from typing import Any, Dict, List, Optional

from gateway.session_context import get_session_env
from hermes_constants import get_hermes_home
from tools.registry import registry


PROJECT_ROOT = Path(__file__).parent.parent.resolve()


def _tool_error(message: str) -> str:
    return json.dumps({"success": False, "error": message}, ensure_ascii=False)


def _require_admin_builder_context() -> tuple[str, str]:
    platform = get_session_env("HERMES_SESSION_PLATFORM")
    tenant_id = get_session_env("HERMES_ENTERPRISE_TENANT_ID")
    admin_user_id = get_session_env("HERMES_ENTERPRISE_USER_ID")
    if platform not in {"enterprise_admin_builder", "enterprise_admin"} or not tenant_id or not admin_user_id:
        raise PermissionError("enterprise_local_bridge is only available in enterprise admin sessions")
    return tenant_id, admin_user_id


def _matches_text(value: Any, needle: Optional[str]) -> bool:
    if not needle:
        return True
    return str(needle).strip().lower() in str(value or "").lower()


def _normalize_report_schedule(schedule: Optional[str]) -> str:
    text = str(schedule or "").strip()
    if not text:
        raise ValueError("schedule is required")
    normalized = text.replace("：", ":")
    daily_match = re.search(r"(?:(?:每天|每日|daily|every day)\s*)?(\d{1,2})\s*:\s*(\d{2})", normalized, re.I)
    if daily_match and (
        any(token in normalized.lower() for token in ("每天", "每日", "daily", "every day"))
        or normalized == daily_match.group(0)
    ):
        hour = int(daily_match.group(1))
        minute = int(daily_match.group(2))
        if not 0 <= hour <= 23 or not 0 <= minute <= 59:
            raise ValueError("daily report time must be a valid HH:MM time")
        return f"{minute} {hour} * * *"
    return text


def _local_report_script_path(plan_id: str) -> Path:
    return get_hermes_home() / "scripts" / "enterprise_local_reports" / f"{plan_id}.py"


def _write_local_report_script(plan_id: str, device_id: str, request_text: str) -> str:
    script_path = _local_report_script_path(plan_id)
    script_path.parent.mkdir(parents=True, exist_ok=True)
    content = (
        "import json\n"
        "import sys\n"
        f"sys.path.insert(0, {str(PROJECT_ROOT)!r})\n"
        "from enterprise import EnterpriseStore\n\n"
        "store = EnterpriseStore()\n"
        "try:\n"
        f"    item = store.create_local_agent_request(device_id={device_id!r}, request={request_text!r})\n"
        "    print(json.dumps({'created_request_id': item.get('id'), 'wakeAgent': False}, ensure_ascii=False))\n"
        "finally:\n"
        "    store.close()\n"
    )
    script_path.write_text(content, encoding="utf-8")
    try:
        script_path.chmod(0o700)
    except OSError:
        pass
    return str(script_path.relative_to(get_hermes_home() / "scripts"))


def _local_report_payload(job: Dict[str, Any]) -> Dict[str, Any]:
    payload = dict(job)
    meta = payload.get("enterprise_local_report")
    if isinstance(meta, dict):
        payload["device_id"] = meta.get("device_id")
        payload["request"] = meta.get("request")
        payload["device_name"] = meta.get("device_name")
        payload["user_email"] = meta.get("user_email")
        payload["user_name"] = meta.get("user_name")
        payload["agent_name"] = meta.get("agent_name")
    return payload


def enterprise_local_bridge(
    action: str,
    device_id: Optional[str] = None,
    user_id: Optional[str] = None,
    user_email: Optional[str] = None,
    agent_id: Optional[str] = None,
    job_id: Optional[str] = None,
    request: Optional[str] = None,
    schedule: Optional[str] = None,
    name: Optional[str] = None,
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

    if normalized_action in {"send_request", "create_report_plan", "trigger_report_plan"} and not confirmed_by_admin:
        return _tool_error(
            "This local-agent bridge mutation requires explicit admin confirmation. "
            "Present the target device and exact request/plan first, then call this "
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

        if normalized_action == "list_report_plans":
            from cron.jobs import list_jobs

            plans = []
            for job in list_jobs(include_disabled=True):
                meta = job.get("enterprise_local_report") if isinstance(job, dict) else None
                if not isinstance(meta, dict):
                    continue
                device = store.get_local_device(str(meta.get("device_id") or ""))
                if not device or device.get("tenant_id") != tenant_id:
                    continue
                if not _matches_text(device.get("id"), device_id):
                    continue
                if not _matches_text(device.get("user_id"), user_id):
                    continue
                if not _matches_text(device.get("user_email"), user_email):
                    continue
                if agent_id and device.get("agent_id") != agent_id:
                    continue
                plans.append(_local_report_payload(job))
            return json.dumps(
                {"success": True, "plans": plans[: max(1, min(int(limit or 20), 100))]},
                ensure_ascii=False,
                indent=2,
            )

        if normalized_action == "create_report_plan":
            from cron.jobs import create_job, update_job

            device = store.get_local_device(device_id or "")
            if not device or device.get("tenant_id") != tenant_id:
                raise ValueError("local device not found in this tenant")
            if device.get("revoked_at") is not None or device.get("status") != "active":
                raise ValueError("local device is inactive")
            request_text = (request or "").strip()
            if not request_text:
                raise ValueError("request is required")
            plan_id = "lrpt_" + secrets.token_hex(6)
            script = _write_local_report_script(plan_id, device["id"], request_text)
            normalized_schedule = _normalize_report_schedule(schedule)
            job = create_job(
                prompt="[SILENT]",
                schedule=normalized_schedule,
                name=(name or "").strip() or f"Local report: {device.get('name') or device['id']}",
                deliver="local",
                script=script,
                origin={"platform": "enterprise_local_report", "chat_id": device["id"]},
            )
            updated = update_job(
                job["id"],
                {
                    "enterprise_local_report": {
                        "plan_id": plan_id,
                        "device_id": device["id"],
                        "request": request_text,
                        "device_name": device.get("name"),
                        "user_email": device.get("user_email"),
                        "user_name": device.get("user_name"),
                        "agent_name": device.get("agent_name"),
                    }
                },
            )
            return json.dumps(
                {"success": True, "plan": _local_report_payload(updated or job)},
                ensure_ascii=False,
                indent=2,
            )

        if normalized_action == "trigger_report_plan":
            from cron.jobs import get_job

            job = get_job(job_id or "")
            if not job or not isinstance(job.get("enterprise_local_report"), dict):
                raise ValueError("report plan not found")
            meta = job.get("enterprise_local_report") or {}
            device = store.get_local_device(str(meta.get("device_id") or ""))
            if not device or device.get("tenant_id") != tenant_id:
                raise ValueError("report plan not found in this tenant")
            item = store.create_local_agent_request(
                device_id=device["id"],
                request=str(meta.get("request") or ""),
                requester_user_id=admin_user_id,
            )
            return json.dumps(
                {"success": True, "request": item, "plan": _local_report_payload(job)},
                ensure_ascii=False,
                indent=2,
            )

        return _tool_error(f"unknown action '{action}'")
    except Exception as exc:
        return _tool_error(str(exc))
    finally:
        store.close()


ENTERPRISE_LOCAL_BRIDGE_SCHEMA: Dict[str, Any] = {
    "name": "enterprise_local_bridge",
    "description": (
        "Admin-only tool for communicating with user-owned local Hermes agents. "
        "It lists connected local devices, sends collaboration requests, checks "
        "responses, and creates recurring local report plans backed by Hermes cron. "
        "For multi-turn collaboration, list prior requests and send a follow-up "
        "request to the same device that references the previous request id or summary. "
        "It does not grant direct access to local files or tools; the local agent "
        "decides what to share."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "action": {
                "type": "string",
                "enum": [
                    "list_devices",
                    "send_request",
                    "list_requests",
                    "list_report_plans",
                    "create_report_plan",
                    "trigger_report_plan",
                ],
            },
            "device_id": {"type": "string"},
            "user_id": {"type": "string"},
            "user_email": {"type": "string"},
            "agent_id": {"type": "string"},
            "job_id": {
                "type": "string",
                "description": "Cron/report plan job id, required for trigger_report_plan.",
            },
            "request": {
                "type": "string",
                "description": "Exact collaboration request to send to the local agent or schedule as a recurring report. For report requests, state that the answer is for the enterprise admin, specify target scope, and ask the local agent to summarize scoped local transcript rather than keyword-searching snippets.",
            },
            "schedule": {
                "type": "string",
                "description": "Schedule for create_report_plan. Accepts cron such as '20 20 * * *', intervals such as 'every 1d', or daily time such as '每天20:20'.",
            },
            "name": {
                "type": "string",
                "description": "Optional report plan name.",
            },
            "status": {
                "type": "string",
                "description": "Optional comma-separated request statuses such as pending,delivered,responded,rejected.",
            },
            "limit": {"type": "integer", "minimum": 1, "maximum": 100},
            "include_revoked": {"type": "boolean"},
            "confirmed_by_admin": {
                "type": "boolean",
                "description": "Required for send_request/create_report_plan/trigger_report_plan after the admin confirms the target and request text.",
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
        job_id=args.get("job_id"),
        request=args.get("request"),
        schedule=args.get("schedule"),
        name=args.get("name"),
        status=args.get("status"),
        limit=args.get("limit", 20),
        include_revoked=args.get("include_revoked", False),
        confirmed_by_admin=args.get("confirmed_by_admin", False),
        task_id=kw.get("task_id"),
    ),
)
