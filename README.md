<p align="center">
  <img src="https://raw.githubusercontent.com/ouwei2013/teames/main/assets/teames-logo-wide.png" alt="Teames" width="720">
</p>

<h1 align="center">Teames</h1>

<p align="center">
  <strong>Team + Hermes: a business agent workspace with social QR access.</strong>
</p>

<p align="center">
  <a href="#quick-start"><img src="https://img.shields.io/badge/Quickstart-5_minutes-blue?style=for-the-badge" alt="Quickstart"></a>
  <a href="#gateway-concepts"><img src="https://img.shields.io/badge/Gateways-Personal%20%7C%20Shared-0ea5e9?style=for-the-badge" alt="Personal and Shared gateways"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT license"></a>
</p>

Private agents such as Hermes or OpenClaw are great when one person wants a
personal AI agent. Teames is for the next step: businesses, teams, and
organizations that want agents they can build, share, govern, and connect to the
social apps their users already use.

If you run a business, Teames lets you quickly create an agent that understands
your services, policies, tone, workflows, and tools. You install Teames, create a
workspace, build a business agent by chatting with Teames or editing the agent
configuration, connect the agent to your social gateway accounts, and send invite
QR codes to your users. Once a user scans the QR code, they can talk to your
business agent from WeChat, WhatsApp, Telegram, or another supported gateway.

If you run an organization, Teames gives every employee a capable agent while
keeping the workspace under administrative control. People can access approved
workspace agents from the browser or social apps, while admins manage workspace
agents, invited users, social bindings, skills, cron jobs, sessions, and access
from one portal.

Under the hood, Teames keeps Hermes' tool-calling agent runtime, memory, skills,
terminal tools, cron, and messaging gateway, then adds the workspace and social
access layer needed for business use.

## Highlights

| Capability | What it means |
| --- | --- |
| Workspace agents | Create multiple business agents with role, task, tone, instructions, knowledge, skills, and users. |
| Builder chat | Describe the agent you want, review a draft, then let the controlled builder tool create agents, skills, and invites. |
| Remote portal | Run Teames on a server so users do not need to install a local agent before chatting. |
| Personal Gateway | Bind your own messaging accounts to your personal Teames agent, with optional routing to workspace agents. |
| Shared Gateway | Invite users through workspace-owned WeChat, WhatsApp, Telegram, or generic bind links without requiring local installation. |
| Social gateway routing | Messages from social platforms are mapped to tenant, user, and agent access context before the agent runs. |
| Skills and tools | Reuses Hermes tools, toolsets, skills, cron, memory, session search, and gateway infrastructure. |

## Example Use Cases

### 1. Remote portal: Weight Manager agent for social users

Gateway type: **Shared Gateway**.

A health coach, clinic, or wellness business can run Teames on a server and
create a `weight_manager` agent that knows its coaching style, diet principles,
check-in workflow, and reminder rules. The admin creates the agent in the
workspace portal, connects a shared server bot, and sends QR invites to users.

Users do not need to install anything. After scanning the invite, they can ask
questions from WeChat, WhatsApp, Telegram, or another supported social channel.
Teames maps the social account to the invited user, runs the assigned
`weight_manager` agent, stores the session, and sends the reply back to the same
social app.

<p align="center">
  <img src="https://raw.githubusercontent.com/ouwei2013/teames/main/assets/readme/remote-portal-weight-manager.png" alt="Remote portal Weight Manager example" width="900">
</p>

### 2. Organization: Employees with personal agents and workspace oversight

Gateway type: **Personal Gateway**.

A company can let employees install Teames on their own machines and bind their
own messaging accounts, such as WhatsApp, Telegram, WeChat, or Slack, to their
personal Teames agent. Employees can chat with their personal agent from the
apps they already use. When a question or task relates to a workspace business
agent, the personal agent can route the request to that remote workspace agent.

This keeps daily work convenient for employees while preserving organizational
control. Admins can invite local devices into the workspace, approve which
business agents they can access, and request reports about the employee's
interactions with remote agents when the business workflow requires oversight.

## Architecture

```text
Admins
  build agents, manage users, create QR invites
        |
        v
Teames Workspace Portal
  agents, users, permissions, sessions, skills, cron jobs
        |
        v
Hermes Agent Runtime
  model provider, tools, memory, skills, scheduler

Users
  browser / WeChat / WhatsApp / Telegram
        |
        v
Gateway + Access Binding
  identify user, workspace, and assigned agent
        |
        v
Business Agent Reply
```

A Teames workspace is the control center. Admins use the portal to create
business agents, configure what they know, connect social gateways, and invite
users. Users do not need to understand the runtime. They can open a browser or
scan a QR code from WeChat, WhatsApp, or Telegram.

When a message arrives, Teames identifies the user, checks which workspace agent
they can access, runs that business agent on top of the Hermes runtime, and sends
the reply back to the same channel.

Teames does not replace Hermes. It adds workspace, access, and social-gateway
layers around the Hermes agent runtime. A business agent prompt is applied as a
scoped instruction on top of the base Hermes agent prompt, so each workspace
agent gets a business role while preserving Hermes tools, memory, skills,
gateway behavior, and scheduler support.

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/ouwei2013/teames.git
cd teames

# Prefer the repo virtual environment.
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[portal,dev]"

# Frontend dependencies for the dashboard.
cd web
npm install
npm run build
cd ..
```

The command-line entry point is still `hermes` for compatibility with the
upstream Hermes Agent runtime.

`portal` installs the Teames dashboard, cron support, Telegram QR support,
WhatsApp bridge runtime support, and QR generation without installing Slack,
Discord, Matrix, or other gateway adapters you do not use. Install
`.[all,dev]` only when you want every upstream Hermes optional integration.

If pip starts downloading `slack-bolt` or `slack-sdk`, you are not using the
lightweight install path. Stop the command, make sure you have pulled the latest
repo, and run `pip install -e ".[portal,dev]"` instead of `.[all,dev]`.

### 2. Configure a model provider

```bash
hermes auth
hermes model
```

You can use OpenAI-compatible endpoints, OpenRouter, Nous Portal, local models,
or other Hermes-supported providers. Secrets are stored in `~/.hermes/.env`.

### 3. Start the remote portal

```bash
hermes dashboard \
  --host 0.0.0.0 \
  --port 9119 \
  --insecure \
  --no-open
```

Open:

```text
http://<server-ip>:9119/enterprise
```

If the portal is only bound to localhost on a remote machine, use your normal
SSH port-forwarding setup and open the forwarded local URL in your browser.

### 4. Start the messaging gateway

```bash
hermes gateway run --replace --accept-hooks -v
```

The gateway can run multiple platforms at the same time. A single process can
connect WeChat, WhatsApp, Telegram, and other enabled Hermes adapters, then route
each inbound message through its platform-specific binding. For Shared Gateway
QR invites, keep this process running on the Teames server. For Personal Gateway,
run it on the user's own installation after binding personal messaging accounts.

## Workspace Flow

1. Open `Workspace`.
2. Go to `Agents`.
3. Use `Build Agents` to create agents with the configuration form or builder chat.
4. Go to `People & Invites`.
5. Create email invites, social QR invites, or inspect connected users.
6. Users chat from the browser, WeChat, WhatsApp, Telegram, or another gateway.

## Builder Chat

Builder chat is a normal Hermes agent running in a special admin-only mode.
It uses:

- an Enterprise Agent Builder playbook;
- the `enterprise_builder` tool for controlled workspace mutations;
- the `enterprise_local_bridge` tool when local devices need to provide reports.

The builder follows a draft-first workflow. It should ask clarifying questions or
present a draft first. Mutating actions such as `create_agent`, `update_agent`,
`create_agent_skill`, and `create_invite` require explicit admin confirmation and
`confirmed_by_admin=true`.

## Gateway Concepts

Teames uses two gateway patterns. They both reuse Hermes' messaging gateway
runtime, but they solve different onboarding problems.

### Personal Gateway

Personal Gateway is for a person who installed Teames and wants their own
messaging accounts to reach their own Teames agent. The user binds platforms
such as WhatsApp, Telegram, WeChat, Slack, or other Hermes-supported channels.
Messages first go to the user's personal agent. If the user has joined a
workspace and asks for something related to a remote business agent, the
personal agent can route the request to that workspace agent.

Use Personal Gateway when the user owns the agent installation and wants social
apps as a personal control surface.

### Shared Gateway

Shared Gateway is for a workspace that wants other people to chat with business
agents without installing Teames. An admin configures a server-side bot once,
then creates QR invites. Invitees scan the QR code, bind their social account,
and immediately chat with the assigned workspace agent through the shared bot.

Use Shared Gateway when a business, team, or organization owns the server bot
and wants customers, members, or employees to connect with minimal setup.

## Shared Gateway QR Invites

Social QR is the Shared Gateway onboarding path for businesses and organizations.
The admin pairs or configures a server-side bot once, then creates QR invites in
the workspace. An invited user scans the QR code, sends or confirms the bind
message, and Teames maps that user's social account to the selected remote
business agent.

For WhatsApp and Telegram, once the server bot is paired/configured, admins can
create more QR invites from the workspace without pairing again. The invite QR
does not pair the admin's phone; it binds the invitee's social account to the
server bot and assigned workspace agent.

Users should not need to install a local agent just to talk to a business agent
from a social app.

### Telegram QR invites

1. In Telegram, open `@BotFather`.
2. Run `/newbot` and copy the bot token.
3. In Teames, open `Workspace -> People & Invites -> Social QR`.
4. Select `Telegram`.
5. Paste the bot token into `Server Telegram Bot` and save.
6. Restart or start the Teames gateway.
7. Click `Create QR Invite`.
8. The user scans the QR with the phone camera, opens Telegram, taps `Start`, and then chats with the assigned agent.

Useful environment variables:

```bash
TELEGRAM_BOT_TOKEN=<botfather-token>
SOCIAL_GATEWAY_TELEGRAM_BOT_USERNAME=<bot-username>
TELEGRAM_PROXY=http://127.0.0.1:7890   # optional, if Telegram needs a proxy
```

### WhatsApp QR invites

Teames supports a server-side WhatsApp bot through the bundled WhatsApp bridge.
The server bot is paired once. After pairing, admins can create WhatsApp QR
invites for users.

1. Open `Workspace -> People & Invites -> Social QR`.
2. Select `WhatsApp`.
3. In `Server WhatsApp Bot`, click `Pair WhatsApp Bot`.
4. On the bot phone, open WhatsApp `Settings -> Linked Devices -> Link a Device`.
5. Scan the pairing QR shown by Teames.
6. After the status is connected, click `Create QR Invite`.
7. The user scans the invite QR. WhatsApp opens with a bind message. The user taps Send, then chats with the remote agent.

Useful environment variables:

```bash
WHATSAPP_ENABLED=true
WHATSAPP_MODE=bot
WHATSAPP_ALLOWED_USERS=*
SOCIAL_GATEWAY_WHATSAPP_NUMBER=<paired-number>
WHATSAPP_PROXY_URL=http://127.0.0.1:7890   # optional
```

### WeChat / Weixin QR invites

WeChat uses an iLink / ClawBot style authorization flow rather than a normal
contact QR. The admin creates a QR in the portal; the user scans and confirms;
the backend stores bot credentials; the Weixin gateway loads the saved accounts
and long-polls messages.

Typical flow:

1. Configure the Weixin iLink credentials required by your deployment.
2. Start the Teames gateway with Weixin enabled.
3. Open `Workspace -> People & Invites -> Social QR`.
4. Select `WeChat`.
5. Click `Create QR Invite`.
6. The invitee scans and confirms in WeChat.
7. Teames records the binding and routes inbound WeChat messages to the selected business agent.

Useful environment variables depend on your iLink / ClawBot deployment, but the
gateway expects saved account credentials under the Hermes home directory and
loads all available Weixin accounts at startup.

### Generic Bind Links

For platforms without a native QR flow, Teames can generate a generic bind code
or link. The gateway extracts bind codes from messages like:

```text
/bind hms_xxx
/start hms_xxx
hms_xxx
```

## Development

### Backend checks

Use the repository test wrapper rather than calling `pytest` directly:

```bash
scripts/run_tests.sh tests/test_enterprise.py
scripts/run_tests.sh tests/hermes_cli/test_web_server.py
```

### Frontend checks

```bash
cd web
node node_modules/typescript/bin/tsc -b
npm run build
```

### Useful runtime commands

```bash
# Portal
hermes dashboard --host 0.0.0.0 --port 9119 --insecure --no-open

# Gateway
hermes gateway run --replace --accept-hooks -v

# Logs
tail -f ~/.hermes/logs/agent.log
```

## Configuration Files

| Path | Purpose |
| --- | --- |
| `~/.hermes/config.yaml` | Non-secret settings, toolsets, gateway config, terminal settings. |
| `~/.hermes/.env` | Secrets and provider tokens. Do not commit this file. |
| `~/.hermes/sessions/` | Session history. |
| `~/.hermes/enterprise_skills/` | Tenant and agent scoped enterprise skills. |
| `~/.hermes/weixin/` | Saved Weixin/iLink account state, depending on deployment. |
| `~/.hermes/whatsapp/` | WhatsApp bridge session state. |

## Security Notes

- Run `--insecure` only on trusted networks or behind an SSH tunnel.
- Keep provider keys, Telegram tokens, WhatsApp sessions, and iLink credentials out of git.
- Generated business skills should read credentials from environment variables.
- Social gateway bindings are tenant/user/agent scoped; do not bypass the binding layer with ad hoc allowlists for production.
- Business agents should say what is missing instead of inventing business policies or account-specific facts.

## Project Status

Teames is an active business-oriented fork of Hermes Agent. The remote portal,
workspace builder, local-agent bridge, and social QR gateway are evolving quickly.
Expect APIs and UI surfaces to change while the project is prepared for broader
open-source use.

## License

MIT. See [LICENSE](LICENSE).
