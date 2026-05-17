<p align="center">
  <img src="https://raw.githubusercontent.com/ouwei2013/teames/main/assets/teames-logo-wide.png" alt="Teames" width="720">
</p>

<h1 align="center">Teames</h1>

<p align="center">
  <strong>Team + Hermes: a business agent workspace with social QR access.</strong>
</p>

<p align="center">
  <a href="#quick-start"><img src="https://img.shields.io/badge/Quickstart-5_minutes-blue?style=for-the-badge" alt="Quickstart"></a>
  <a href="#social-qr-gateways"><img src="https://img.shields.io/badge/Social_QR-WeChat%20%7C%20WhatsApp%20%7C%20Telegram-0ea5e9?style=for-the-badge" alt="Social QR gateways"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT license"></a>
</p>

Teames is a fork of Hermes Agent focused on businesses, teams, and organizations.
It keeps Hermes' tool-calling agent runtime, memory, skills, terminal tools, cron,
and messaging gateway, then adds a workspace layer where an administrator can build
business agents and invite users through email or social QR codes.

The main idea is simple:

- admins create workspace agents such as support, sales, fitness coaching, or internal operations agents;
- users can join from a browser, a local installed agent, or a social app;
- social QR invites bind WeChat, WhatsApp, or Telegram accounts to a remote business agent;
- the same runtime can route local-agent questions to remote workspace agents when needed.

## Highlights

| Capability | What it means |
| --- | --- |
| Workspace agents | Create multiple business agents with role, task, tone, instructions, knowledge, skills, and users. |
| Builder chat | Describe the agent you want, review a draft, then let the controlled builder tool create agents, skills, and invites. |
| Remote portal | Run Teames on a server so users do not need to install a local agent before chatting. |
| Social QR access | Invite users through WeChat, WhatsApp, Telegram, or generic bind links. |
| Local mode | A user's installed local agent can join a remote workspace and consult assigned remote agents. |
| Social gateway routing | Messages from social platforms are mapped to tenant, user, and agent access context before the agent runs. |
| Skills and tools | Reuses Hermes tools, toolsets, skills, cron, memory, session search, and gateway infrastructure. |

## Architecture

```text
Browser Admin UI
        |
        | create agents / invites / social QR
        v
Teames remote portal
        |
        | enterprise store + access context
        v
Hermes AIAgent runtime
        |
        +-- enterprise_builder tool
        +-- enterprise_remote tool
        +-- enterprise skills
        +-- cron + sessions + memory

Social apps
  WeChat / WhatsApp / Telegram
        |
        v
Gateway adapters
        |
        | platform user id + bot account id
        v
Social gateway binding
        |
        v
Remote business agent
```

Teames does not replace the Hermes runtime. A business agent prompt is appended
as a scoped system message on top of the base Hermes agent prompt. This gives each
workspace agent a business role while preserving the underlying tool, memory, and
gateway behavior.

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/<your-org>/teames.git
cd teames

# Prefer the repo virtual environment.
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[all,dev]"

# Frontend dependencies for the dashboard.
cd web
npm install
npm run build
cd ..
```

The command-line entry point is still `hermes` for compatibility with the
upstream Hermes Agent runtime.

### 2. Configure a model provider

```bash
hermes auth
hermes model
```

You can use OpenAI-compatible endpoints, OpenRouter, Nous Portal, local models,
or other Hermes-supported providers. Secrets are stored in `~/.hermes/.env`.

### 3. Start the remote portal

```bash
python3 -m hermes_cli.main dashboard \
  --host 0.0.0.0 \
  --port 9119 \
  --insecure \
  --no-open
```

Open:

```text
http://<server-ip>:9119/enterprise
```

For SSH tunneling:

```bash
ssh -p 6000 \
  -L 19119:127.0.0.1:9119 \
  user@server
```

Then open:

```text
http://127.0.0.1:19119/enterprise
```

### 4. Start the remote social gateway

```bash
python3 -m hermes_cli.main gateway run --replace --accept-hooks -v
```

The gateway can run multiple platforms at the same time. A single process can
connect WeChat, WhatsApp, Telegram, and other enabled Hermes adapters, then route
each inbound message through its platform-specific binding.

## Workspace Flow

1. Open `Workspace`.
2. Go to `Agents`.
3. Use `Build Agents` to create agents with the configuration form or builder chat.
4. Go to `People & Invites`.
5. Create email invites, social QR invites, or inspect connected users.
6. Users chat from the browser, local agent, WeChat, WhatsApp, Telegram, or another gateway.

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

## Social QR Gateways

Social QR is designed for remote portal onboarding. Users should not need to
install a local agent just to talk to a business agent from a social app.

### Telegram

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

### WhatsApp

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

### WeChat / Weixin

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

## Local Agent Mode

Remote portal is the simplest path for invited users, but Teames also supports
local agents.

A user can install Teames locally, join a remote workspace with an invite code,
and keep using one interface:

- local chat for private computer tasks;
- remote workspace agents for business-scope questions;
- social gateway bindings that can route through the local agent when needed.

Example local test server:

```bash
export HERMES_HOME=/tmp/teames-local-test
python -m hermes_cli.main enterprise local serve \
  --host 127.0.0.1 \
  --port 9130 \
  --no-open
```

Then open:

```text
http://127.0.0.1:9130/
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
python3 -m hermes_cli.main dashboard --host 0.0.0.0 --port 9119 --insecure --no-open

# Gateway
python3 -m hermes_cli.main gateway run --replace --accept-hooks -v

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
