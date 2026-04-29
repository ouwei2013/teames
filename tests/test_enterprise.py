from enterprise import EnterpriseStore


def test_initialize_tenant_creates_admin_token(tmp_path):
    store = EnterpriseStore(tmp_path / "enterprise.db")
    try:
        result = store.initialize_tenant(
            name="Acme",
            tenant_id="acme",
            admin_email="admin@example.com",
            admin_name="Admin User",
        )

        assert result["created"] is True
        assert result["tenant"]["id"] == "acme"
        assert result["admin_api_key"].startswith("hmt_")
        users = store.list_users()
        assert len(users) == 1
        assert users[0]["role"] == "admin"
    finally:
        store.close()


def test_invite_redeem_returns_user_token_and_context(tmp_path):
    store = EnterpriseStore(tmp_path / "enterprise.db")
    try:
        store.initialize_tenant(name="Acme", tenant_id="acme")
        invite = store.create_invite(email="user@example.com", role="member")

        redeemed = store.redeem_invite(
            invite["code"],
            email="user@example.com",
            name="User One",
        )

        assert redeemed["api_key"].startswith("hmt_")
        auth = store.authenticate_api_key(redeemed["api_key"])
        assert auth is not None
        ctx = auth["access_context"]
        assert ctx.tenant_id == "acme"
        assert ctx.user_id == redeemed["user"]["id"]
        assert ctx.workspace_id == "default"
        assert redeemed["agents"]
        assert ctx.agent_id == redeemed["agents"][0]["id"]
    finally:
        store.close()


def test_invite_rejects_wrong_email(tmp_path):
    store = EnterpriseStore(tmp_path / "enterprise.db")
    try:
        store.initialize_tenant(name="Acme", tenant_id="acme")
        invite = store.create_invite(email="user@example.com")

        try:
            store.redeem_invite(invite["code"], email="other@example.com")
        except ValueError as exc:
            assert "different email" in str(exc)
        else:
            raise AssertionError("expected wrong invite email to fail")
    finally:
        store.close()


def test_invite_scopes_user_to_selected_business_agent(tmp_path):
    store = EnterpriseStore(tmp_path / "enterprise.db")
    try:
        store.initialize_tenant(name="Acme", tenant_id="acme")
        default_agent = store.list_agents()[0]
        support_agent = store.create_agent(
            name="Support Agent",
            description="Support for a generic business",
            role_prompt="You answer as the business support team.",
            task_prompt="Answer policy and product questions.",
            knowledge="Return window is 30 days.",
        )
        invite = store.create_invite(
            email="user@example.com",
            role="member",
            agent_ids=[support_agent["id"]],
        )

        redeemed = store.redeem_invite(
            invite["code"],
            email="user@example.com",
            name="User One",
        )
        allowed_ids = [agent["id"] for agent in redeemed["agents"]]
        assert allowed_ids == [support_agent["id"]]

        auth = store.authenticate_api_key(redeemed["api_key"])
        assert auth is not None
        assert auth["access_context"].agent_id == support_agent["id"]
        assert store.resolve_user_agent(auth["user"], support_agent["id"])["id"] == support_agent["id"]

        try:
            store.resolve_user_agent(auth["user"], default_agent["id"])
        except PermissionError as exc:
            assert "not allowed" in str(exc)
        else:
            raise AssertionError("expected default agent access to be denied")

        prompt = store.compile_agent_prompt(support_agent)
        assert "Support Agent" in prompt
        assert "business support team" in prompt
        assert "Return window is 30 days" in prompt
        assert "Do not invent" in prompt
    finally:
        store.close()
