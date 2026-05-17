---
name: enterprise-local-report-collaboration
description: Coordinate admin-to-local-agent report requests, local-user transcript summaries, recurring report plans, and multi-turn follow-ups.
version: 1.0.0
metadata:
  hermes:
    tags: [enterprise, local-agent, reports, collaboration]
    category: enterprise
---

# Enterprise Local Report Collaboration

Use this skill when an enterprise admin wants a report, summary, verification, or follow-up from a user-owned local Hermes agent.

This workflow is agent-to-agent collaboration. The admin agent does not read or operate the user's local machine directly. It sends a request to the local agent. The local agent decides what scoped local context is visible and returns a report.

## Roles

- Admin agent: understands the admin's intent, chooses the correct local device/user/business agent, drafts the request, and sends it with `enterprise_local_bridge`.
- Local agent: represents the local user, reads only scoped visible local context, may consult assigned remote business agents when appropriate, and replies with a report to the admin.
- Remote business agent: provides business knowledge when the local agent calls `enterprise_remote`. It does not get private local data unless the local user explicitly allowed it.

## Admin Agent Flow

1. Clarify the target if needed:
   - user email or name
   - device id or device name
   - business agent
   - time range or topic
   - whether this is one-time or recurring
2. Use `enterprise_local_bridge(action="list_devices")` to resolve the target device. Prefer displaying target as `device_id · user_email`.
3. Convert the admin's natural-language request into a local-agent report task:
   - say that the response is for the enterprise admin
   - specify the business agent and user scope
   - specify time range and report format
   - say to use the scoped local transcript, including remote-agent tool responses, rather than keyword searching
   - ask for evidence boundaries: what was visible, what was not visible, and what was not accessed
4. For a one-time request, call `enterprise_local_bridge(action="send_request")` after the admin confirms the target and task text.
5. For a recurring report, call `enterprise_local_bridge(action="create_report_plan")` after the admin confirms the target, schedule, and task text.
6. For follow-up questions, first inspect prior responses with `enterprise_local_bridge(action="list_requests")`, then send a follow-up request that includes the prior request id or a short summary of the previous answer.

## Local Agent Response Rules

When replying to a local report request:

- Reply to the enterprise admin, not to the local user.
- Use third-person wording: "the user asked", "the local agent answered", "the remote business agent returned".
- Do not address the user as "you".
- Do not offer next-step assistance to the local user.
- Summarize from the scoped local transcript provided to the local request turn.
- Include remote business agent tool results when they are part of the scoped transcript.
- Do not use keyword search as the primary history source. Keyword search is only a fallback when no transcript is available.
- Say clearly when scoped transcript is missing, incomplete, or truncated.
- Do not expose raw private local files, secrets, credentials, screenshots, or account data.
- Prefer concise reports with enough concrete evidence to audit the conclusion.

## Recommended Report Format

Use this shape unless the admin requested a different format:

```text
Report target
- User: <email or name>
- Device: <device id/name>
- Business agent: <agent name>
- Scope: <time range/topic>

Summary
- <1-3 bullets>

Observed conversation
- <what the user asked>
- <what the local/remote agent answered>

Interest or status assessment
- <assessment>
- Evidence: <specific visible turns>

Boundaries
- Visible context: <what was used>
- Not visible / not accessed: <what was not available or intentionally not accessed>

Follow-up needed
- <optional admin follow-up question or next request>
```

## Multi-Turn Pattern

Treat each local request/response as one turn in an admin-local-agent collaboration thread. If the admin needs clarification:

1. Use `list_requests` to find the latest response.
2. Send a new `send_request` to the same device.
3. Include the previous request id and the specific unresolved question.
4. The local agent should answer based on the same scoped transcript plus the new follow-up.

Do not assume the local agent will remember prior admin requests unless the follow-up request includes the relevant previous request id or summary.
