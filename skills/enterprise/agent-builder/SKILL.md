---
name: enterprise-agent-builder
description: Build tenant-scoped business agents, knowledge, skills, data-fetch scripts, and invite flows for enterprise deployments.
version: 1.0.0
metadata:
  hermes:
    tags: [enterprise, agent-builder, business-agent, skills]
    category: enterprise
---

# Enterprise Agent Builder

Use this skill when an administrator wants to create, configure, or improve a business agent for any kind of business.

## Operating Model

You are still a normal Hermes agent. Use native Hermes tools, native skills, and normal tool-calling behavior. The difference is scope: you are building tenant-scoped business agents and tenant/agent-scoped enterprise skill packages.

Use `enterprise_builder` for enterprise mutations. Do not edit `enterprise.db` directly.

## Build Flow

1. Understand the business: industry, audience, products or services, common customer questions, escalation rules, and tone.
2. Identify the agent contract:
   - role prompt
   - primary tasks
   - tone and style
   - operating instructions
   - escalation boundaries
   - business knowledge
3. Identify capabilities:
   - built-in native skills that should be visible to this business agent
   - tenant/agent-specific enterprise skills that need to be created
   - data-fetch scripts needed for private business data
   - cron or follow-up workflows
4. For vague requests, produce a draft or ask focused questions. Do not create anything yet.
5. Apply the setup with `enterprise_builder` only after the admin explicitly confirms the specific draft.

## Draft-First Rule

For an initial message like "create an agent for my bakery business", do not call mutating `enterprise_builder` actions. That request identifies an industry, but it is missing business-specific details.

First ask for the most important missing information, or provide a clearly labeled starter draft and ask whether to apply it. Useful questions include:

- business name and location, if relevant
- products/services and menu or catalog details
- order, pickup, delivery, cancellation, and refund policies
- allergy, safety, legal, or compliance boundaries
- whether the agent should answer only FAQs or also fetch live data
- which users should be invited
- preferred tone and languages

Only call mutating actions such as `create_agent`, `update_agent`, `create_agent_skill`, `set_skill_catalog`, or `create_invite` after the admin confirms with language such as "apply this", "yes create it", "save this agent", or equivalent.

When calling a mutating `enterprise_builder` action after confirmation, set `confirmed_by_admin: true`. Never set it to true for vague initial requirements.

## Data-Fetch Skills

When an admin describes a business database, create a tenant/agent-scoped enterprise skill package instead of a global skill.

The package should include:

- `SKILL.md` instructions explaining when to fetch data and how to summarize it.
- `scripts/*.py` files when executable fetching is required.
- parameterized queries or clearly marked placeholders, never string-concatenated SQL.
- required environment variables or credential names, but never secrets in source.
- tenant, agent, and current-user scoping rules.
- a short test command or expected input/output format.

For example, if the admin says order history is in `order_history` and profile data is in `user`, create a skill that explains:

- fetch the current authenticated user's profile by user id.
- fetch only that user's orders.
- never query another user's records unless an admin explicitly authorizes an admin-only workflow.
- if credentials or column names are missing, ask before creating runnable scripts.

## Safety Rules

- Do not claim an agent, invite, skill, script, or allowlist was created until `enterprise_builder` returns success.
- Do not call mutating `enterprise_builder` actions until the admin has approved a specific draft.
- Do not store database passwords, API keys, or customer secrets in prompts, `SKILL.md`, scripts, or knowledge fields.
- Scripts should read credentials from environment variables or a future secure connector layer.
- Use least privilege: generated scripts should query only the tables and rows needed for the current user workflow.
- Make business knowledge explicit. If a policy is unknown, instruct the business agent to say what information is missing instead of inventing.

## Useful `enterprise_builder` Actions

- `status`: inspect tenant, users, and agents.
- `list_builtin_skills`: inspect native skills that can be allowlisted for business agents.
- `create_agent`: create a business agent with prompt fields and knowledge after explicit admin approval.
- `update_agent`: revise an existing business agent after explicit admin approval.
- `set_skill_catalog`: make a native built-in skill visible or hidden for a business agent after explicit admin approval.
- `create_agent_skill`: create a tenant/agent-scoped enterprise skill package, including optional `scripts/*.py`, after explicit admin approval.
- `create_invite`: generate an invite for a user and assign accessible agents after explicit admin approval.

## Response Style

When applying changes, summarize what was actually created:

- business agent name and id
- enabled built-in skills
- created enterprise skills and package paths
- generated invite link or code if requested
- missing setup work, especially credentials or schema details

Keep the response concise and operational.
