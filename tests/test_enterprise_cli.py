import json
from types import SimpleNamespace

from hermes_cli import main as cli_main


def _registration_result():
    return {
        "device_token": "hmdt_test",
        "device": {"id": "dev_1", "name": "Laptop"},
        "user": {"id": "user_1", "email": "user@example.com"},
        "agent": {"id": "agent_1", "name": "Support"},
    }


def test_enterprise_local_join_supports_invite_registration(monkeypatch, tmp_path):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    calls = []

    def fake_http(server, path, *, method="GET", token=None, payload=None):
        calls.append(
            {
                "server": server,
                "path": path,
                "method": method,
                "token": token,
                "payload": payload,
            }
        )
        if path == "/api/enterprise/local-agent/agents":
            return {"agents": [{"id": "agent_1", "name": "Support"}]}
        return _registration_result()

    monkeypatch.setattr(cli_main, "_enterprise_http_json", fake_http)
    cli_main._enterprise_local_join(
        SimpleNamespace(
            code="hmi_invite",
            server="http://enterprise.test",
            name="Laptop",
            password="secret123",
            email="",
            user_name="User One",
            agent_id=None,
        )
    )

    assert calls[0]["path"] == "/api/enterprise/local-agent/register-invite"
    assert calls[0]["payload"] == {
        "code": "hmi_invite",
        "password": "secret123",
        "device_name": "Laptop",
        "email": None,
        "name": "User One",
    }
    saved = json.loads((tmp_path / "enterprise-local.json").read_text())
    assert saved["device_token"] == "hmdt_test"
    assert saved["agents"][0]["id"] == "agent_1"


def test_enterprise_local_join_supports_email_login(monkeypatch, tmp_path):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))
    calls = []

    def fake_http(server, path, *, method="GET", token=None, payload=None):
        calls.append({"path": path, "payload": payload, "token": token})
        if path == "/api/enterprise/local-agent/agents":
            return {"agents": []}
        return _registration_result()

    monkeypatch.setattr(cli_main, "_enterprise_http_json", fake_http)
    cli_main._enterprise_local_join(
        SimpleNamespace(
            code=None,
            server="http://enterprise.test",
            name="Laptop",
            password="secret123",
            email="user@example.com",
            user_name=None,
            agent_id="agent_1",
        )
    )

    assert calls[0]["path"] == "/api/enterprise/local-agent/register-login"
    assert calls[0]["payload"] == {
        "email": "user@example.com",
        "password": "secret123",
        "device_name": "Laptop",
        "agent_id": "agent_1",
    }


def test_enterprise_local_chat_runs_cli_agent_with_remote_tool(monkeypatch):
    captured = {}
    config = {
        "server": "http://enterprise.test",
        "device_token": "hmdt_test",
        "device": {"id": "dev_1", "name": "Laptop"},
        "user": {"id": "user_1", "email": "user@example.com"},
        "agent": {"id": "agent_1", "name": "Support"},
        "agents": [{"id": "agent_1", "name": "Support"}],
    }

    monkeypatch.setattr(cli_main, "_read_enterprise_local_config", lambda: config)
    monkeypatch.setattr(cli_main, "_enterprise_local_refresh_config", lambda value: value)
    monkeypatch.setattr(cli_main, "_run_enterprise_agent_cli", lambda **kwargs: captured.update(kwargs))

    cli_main._enterprise_local_chat(SimpleNamespace(message="hello", session_id="local-1", json=False))

    assert captured["session_id"] == "local-1"
    assert captured["platform"] == "enterprise_local_cli"
    assert captured["extra_toolsets"] == {"enterprise_remote"}
    assert "call enterprise_remote" in captured["system_message"]
    assert "Support (agent_1)" in captured["system_message"]


def test_enterprise_admin_cli_modes_use_expected_tools(monkeypatch):
    captured = {}
    tenant = {"id": "tenant_1", "name": "Acme"}
    admin = {"id": "user_admin", "email": "admin@example.com", "role": "admin"}

    monkeypatch.setattr(
        cli_main,
        "_load_enterprise_admin_cli_setup",
        lambda builder: (tenant, admin, "builder prompt" if builder else "admin prompt"),
    )
    monkeypatch.setattr(cli_main, "_run_enterprise_agent_cli", lambda **kwargs: captured.update(kwargs))

    cli_main._enterprise_admin_chat(
        SimpleNamespace(message="status", session_id="builder-1", json=False),
        builder=True,
    )
    assert captured["session_id"] == "builder-1"
    assert captured["platform"] == "enterprise_admin_builder"
    assert captured["extra_toolsets"] == {"enterprise_builder", "enterprise_local_bridge"}
    assert captured["access_context"].agent_id == "enterprise_builder"

    captured.clear()
    cli_main._enterprise_admin_chat(
        SimpleNamespace(message="status", session_id="admin-1", json=False),
        builder=False,
    )
    assert captured["session_id"] == "admin-1"
    assert captured["platform"] == "enterprise_admin"
    assert captured["extra_toolsets"] == {"enterprise_local_bridge"}
    assert captured["access_context"].agent_id == "enterprise_admin_default"
