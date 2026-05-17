"""Tests for local-enterprise guidance in gateway sessions."""

import json

from gateway.run import (
    _enterprise_local_gateway_prompt,
    _load_enterprise_local_gateway_config,
)


def test_load_enterprise_local_gateway_config_requires_joined_profile(tmp_path, monkeypatch):
    monkeypatch.setenv("HERMES_HOME", str(tmp_path))

    assert _load_enterprise_local_gateway_config() == {}

    (tmp_path / "enterprise-local.json").write_text(
        json.dumps({"server": "https://admin.example"}),
        encoding="utf-8",
    )
    assert _load_enterprise_local_gateway_config() == {}

    (tmp_path / "enterprise-local.json").write_text(
        json.dumps(
            {
                "server": "https://admin.example",
                "device_token": "hmdt_test",
                "device": {"id": "dev_1", "name": "Laptop"},
            }
        ),
        encoding="utf-8",
    )

    loaded = _load_enterprise_local_gateway_config()
    assert loaded["server"] == "https://admin.example"
    assert loaded["device_token"] == "hmdt_test"


def test_enterprise_local_gateway_prompt_tells_social_gateway_to_use_remote_agent():
    prompt = _enterprise_local_gateway_prompt(
        {
            "server": "https://admin.example",
            "device": {"id": "dev_1", "name": "Laptop"},
            "user": {"id": "user_1", "email": "user@example.com"},
            "agent": {"id": "agent_1", "name": "Support"},
            "agents": [{"id": "agent_1", "name": "Support"}],
        }
    )

    assert "WhatsApp" in prompt
    assert "Weixin/WeChat" in prompt
    assert "call enterprise_remote before answering" in prompt
    assert "Support (agent_1)" in prompt
    assert "Do not send private local files" in prompt
